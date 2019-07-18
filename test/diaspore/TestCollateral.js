const Collateral = artifacts.require('Collateral');
const TestModel = artifacts.require('TestModel');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestConverter = artifacts.require('TestConverter');
const TestRateOracle = artifacts.require('TestRateOracle');
const RateOracleView = artifacts.require('RateOracleView');

const Helper = require('../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn (number) {
    if (!(number instanceof String)) {
        number.toString();
    }
    return new BN(number);
}

function min (x, y, z) {
    if (x.lte(y) && x.lte(z)) {
        return x;
    } else {
        return y.lte(z) ? y : x;
    }
}

function divceil (x, y) {
    if (x.mod(y).eq(bn(0))) {
        return x.div(y);
    } else {
        return x.div(y).add(bn(1));
    }
}

function rand (min = 0, max = 2 ** 53) {
    if (min instanceof BN) {
        min = min.toNumber();
    }
    if (max instanceof BN) {
        max = max.toNumber();
    }
    return bn(Math.floor(Math.random() * (max + 1 - min)) + min);
}

const WEI = bn(10).pow(bn(18));
const BASE = bn(10000);

contract('Test Collateral cosigner Diaspore', function (accounts) {
    const owner = accounts[1];
    const creator = accounts[2];
    const borrower = accounts[3];
    const depositer = accounts[4];
    const lender = accounts[5];

    let rcn;
    let auxToken;
    let loanManager;
    let debtEngine;
    let model;
    let collateral;
    let converter;
    let oracle;

    class EntryBuilder {
        constructor () {
            this.oracle = { address: Helper.address0x };
            // Entry
            this.createFrom = creator;
            this.entryAmount = rand(1);
            this.burnFee = rand(0, BASE);
            this.rewardFee = rand(0, BASE.sub(this.burnFee).sub(bn(1)));
            this.liquidationRatio = rand(BASE, 20000);
            this.balanceRatio = rand(this.liquidationRatio.add(this.burnFee).add(this.rewardFee), 30000);
            // Loan
            this.loanId = undefined;
            this.loanAmount = rand(1);
            this.loanAmountRcn = this.loanAmount;
            this.expirationDelta = rand(1000, BASE);
            this.durationDelta = rand(1000, BASE);
            // To oracle
            this.oracleData = [];
            this.tokens = WEI;
            this.equivalent = WEI;
            // To converter
            this.rateFromRCN = WEI;
            this.rateToRCN = WEI;
        }

        with (attr, value) {
            this[attr] = value;
            return this;
        }

        async build () {
            // 1 collateral token = 1 token
            await converter.setRate(rcn.address, auxToken.address, this.rateFromRCN);
            await converter.setRate(auxToken.address, rcn.address, this.rateToRCN);

            const salt = bn(web3.utils.randomHex(32));
            const now = bn(await Helper.getBlockTime());
            const expiration = now.add(this.expirationDelta);
            const duration = now.add(this.durationDelta);

            const loanData = await model.encodeData(this.loanAmount, duration);

            if (this.loanId === undefined) {
                this.loanId = await getId(loanManager.requestLoan(
                    this.loanAmount,     // Amount
                    model.address,       // Model
                    this.oracle.address, // Oracle
                    borrower,            // Borrower
                    salt,                // salt
                    expiration,          // Expiration
                    loanData,            // Loan data
                    { from: borrower }   // Creator
                ));
                if (this.oracle.address !== Helper.address0x) {
                    this.oracleData = await this.oracle.encodeRate(this.tokens, this.equivalent);
                    this.loanAmountRcn = await toTokens(this.loanId, this.loanAmount, this.oracleData);
                }
                if (this.onlyTakeALoan) {
                    return this.loanId;
                }
            }

            this.id = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, this.entryAmount);
            await auxToken.approve(collateral.address, this.entryAmount, { from: creator });

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);
            const creatorSnap = await Helper.balanceSnap(auxToken, this.createFrom);

            const createdEvent = await Helper.toEvents(
                collateral.create(
                    this.loanId,              // debtId
                    auxToken.address,         // token
                    this.entryAmount,         // amount
                    this.liquidationRatio,    // liquidationRatio
                    this.balanceRatio,        // balanceRatio
                    this.burnFee,             // burnFee
                    this.rewardFee,           // rewardFee
                    { from: this.createFrom } // sender
                ),
                'Created'
            );

            // Control collateral creation event
            expect(createdEvent._id).to.eq.BN(this.id);
            assert.equal(createdEvent._debtId, this.loanId);
            assert.equal(createdEvent._token, auxToken.address);
            expect(createdEvent._amount).to.eq.BN(this.entryAmount);
            expect(createdEvent._liquidationRatio).to.eq.BN(this.liquidationRatio);
            expect(createdEvent._balanceRatio).to.eq.BN(this.balanceRatio);
            expect(createdEvent._burnFee).to.eq.BN(this.burnFee);
            expect(createdEvent._rewardFee).to.eq.BN(this.rewardFee);

            // Expect entry creation
            const entry = await collateral.entries(this.id);
            expect(entry.liquidationRatio).to.eq.BN(this.liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(this.balanceRatio);
            expect(entry.burnFee).to.eq.BN(this.burnFee);
            expect(entry.rewardFee).to.eq.BN(this.rewardFee);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, this.loanId);
            expect(entry.amount).to.eq.BN(this.entryAmount);

            // Owner and balance of colalteral
            await creatorSnap.requireDecrease(this.entryAmount);
            await collateralSnap.requireIncrease(this.entryAmount);
            assert.equal(await collateral.ownerOf(this.id), creator);

            return this;
        }

        withFee (amount) {
            const totalFee = this.burnFee.add(this.rewardFee);
            return amount.mul(BASE.add(totalFee)).div(BASE);
        }
    }

    async function deposit (tok, col, id, amount, from = creator) {
        const prevEntry = await collateral.entries(id);
        await tok.setBalance(from, amount);
        await tok.approve(col.address, amount, { from: from });

        const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);
        const fromSnap = await Helper.balanceSnap(auxToken, from);
        const Deposited = await Helper.toEvents(
            col.deposit(
                id,
                amount,
                { from: from }
            ),
            'Deposited'
        );

        // Test events
        expect(Deposited._id).to.eq.BN(id);
        expect(Deposited._amount).to.eq.BN(amount);

        // Test collateral entry
        const entry = await collateral.entries(id);
        // Should remain the same
        expect(entry.liquidationRatio).to.eq.BN(prevEntry.liquidationRatio);
        expect(entry.balanceRatio).to.eq.BN(prevEntry.balanceRatio);
        expect(entry.burnFee).to.eq.BN(prevEntry.burnFee);
        expect(entry.rewardFee).to.eq.BN(prevEntry.rewardFee);
        expect(entry.token).to.equal(prevEntry.token);
        expect(entry.debtId).to.equal(prevEntry.debtId);

        // Should increase by amount
        expect(entry.amount).to.eq.BN(amount.add(prevEntry.amount));
        await collateralSnap.requireIncrease(amount);

        // Should decreae by amount
        await fromSnap.requireDecrease(amount);

        // Restore balance
        await fromSnap.restore();
    }

    async function withdraw (id, to, amount, from, data = []) {
        const prevEntry = await collateral.entries(id);

        const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);
        const toSnap = await Helper.balanceSnap(auxToken, to);

        const Withdrawed = await Helper.toEvents(
            collateral.withdraw(
                id,
                to,
                amount,
                data,
                { from: from }
            ),
            'Withdrawed'
        );

        // Assert events
        expect(Withdrawed._id).to.eq.BN(id);
        expect(Withdrawed._to).to.equal(from);
        expect(Withdrawed._amount).to.eq.BN(amount);

        // Validate entry
        const entry = await collateral.entries(id);
        // Should remain the same
        expect(entry.liquidationRatio).to.eq.BN(prevEntry.liquidationRatio);
        expect(entry.balanceRatio).to.eq.BN(prevEntry.balanceRatio);
        expect(entry.burnFee).to.eq.BN(prevEntry.burnFee);
        expect(entry.rewardFee).to.eq.BN(prevEntry.rewardFee);
        expect(entry.token).to.equal(prevEntry.token);
        expect(entry.debtId).to.equal(prevEntry.debtId);

        // Should decrease by amount
        expect(entry.amount).to.eq.BN(prevEntry.amount.sub(amount));
        await collateralSnap.requireDecrease(amount);

        // Shoud increase by amount
        await toSnap.requireIncrease(amount);
        await toSnap.restore();
    }

    async function lend (entry) {
        const lenderSnap = await Helper.balanceSnap(rcn, lender);

        await rcn.setBalance(lender, entry.loanAmountRcn);
        await rcn.approve(loanManager.address, entry.loanAmountRcn, { from: lender });

        await loanManager.lend(
            entry.loanId,               // Loan ID
            entry.oracleData,                 // Oracle data
            collateral.address,         // Collateral cosigner address
            bn(0),                      // Collateral cosigner cost
            Helper.toBytes32(entry.id), // Collateral ID reference
            { from: lender }
        );

        // TODO Check entry status change
        await lenderSnap.restore();
    }

    async function toTokens (loanId, amount, oracleData) {
        const oracle = await loanManager.getOracle(loanId);
        if (oracle !== Helper.address0x) {
            const reading = await (await RateOracleView.at(oracle)).readSample(oracleData);
            return amount.mul(bn(reading[0])).divRound(bn(reading[1]));
        } else {
            return amount;
        }
    }

    async function requireDeleted (entryId, loanId) {
        const entry = await collateral.entries(entryId);
        expect(entry.liquidationRatio).to.eq.BN(0);
        expect(entry.balanceRatio).to.eq.BN(0);
        expect(entry.burnFee).to.eq.BN(0);
        expect(entry.rewardFee).to.eq.BN(0);
        assert.equal(entry.token, Helper.address0x);
        assert.equal(entry.debtId, Helper.bytes320x);
        expect(entry.amount).to.eq.BN(0);

        expect(await collateral.debtToEntry(loanId)).to.eq.BN(0);
    }

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Requested');
        assert.ok(event);
        return event.args._id;
    }

    function roundCompare (x, y) {
        const z = x.sub(y).abs();
        assert.isTrue(z.gte(bn(0)) || z.lte(bn(2)),
            'Diff between ' +
            x.toString() +
            ' to ' +
            y.toString() +
            ' should be less than 1 and is ' +
            z.toString()
        );
    }

    before('Create contracts', async function () {
        converter = await TestConverter.new({ from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        rcn = await TestToken.new({ from: owner });
        auxToken = await TestToken.new({ from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        collateral = await Collateral.new(loanManager.address, { from: owner });
        await collateral.setConverter(converter.address, { from: owner });
    });

    it('Functions onlyOwner', async function () {
        it('Try emergency redeem an entry without being the owner', async function () {
            await Helper.tryCatchRevert(
                () => collateral.emergencyRedeem(
                    0,
                    borrower,
                    { from: borrower }
                ),
                'The owner should be the sender'
            );
        });
        it('Try set new url without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => collateral.setUrl(
                    '',
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });
        it('Try set burner without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => collateral.setBurner(
                    creator,
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });
        it('Try set converter without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => collateral.setConverter(
                    converter.address,
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });
    });
    describe('Constructor', function () {
        it('Check the loanManager and loanManagerToken', async function () {
            assert.equal(await collateral.loanManager(), loanManager.address);
            assert.equal(await collateral.loanManagerToken(), await loanManager.token());
        });
        it('Creation should fail if loan manger is the address 0', async function () {
            await Helper.tryCatchRevert(
                () => Collateral.new(
                    Helper.address0x
                ), 'Error loading loan manager'
            );
        });
    });
    describe('Function create', function () {
        it('Should create a new collateral', async function () {
            await new EntryBuilder().build();
        });
        it('Try create a new collateral with a high fee', async function () {
            await Helper.tryCatchRevert(
                () => new EntryBuilder()
                    .with('burnFee', bn(2).pow(bn(32)).sub(bn(1)))
                    .with('rewardFee', bn(2).pow(bn(32)).sub(bn(1)))
                    .build(),
                'Fee should be lower than BASE'
            );

            await Helper.tryCatchRevert(
                () => new EntryBuilder()
                    .with('burnFee', bn(BASE).div(bn(2)))
                    .with('rewardFee', bn(BASE).div(bn(2)))
                    .build(),
                'Fee should be lower than BASE'
            );
        });
        it('Try create a new collateral with a low liquidation ratio', async function () {
            await Helper.tryCatchRevert(
                () => new EntryBuilder()
                    .with('liquidationRatio', bn(10000))
                    .build(),
                'The liquidation ratio should be greater than BASE'
            );
        });
        it('Try create a new collateral with a low balance ratio', async function () {
            await Helper.tryCatchRevert(
                () => new EntryBuilder()
                    .with('balanceRatio', bn(10000))
                    .with('liquidationRatio', bn(10001))
                    .build(),
                'The balance ratio should be greater than liquidation ratio'
            );
        });
        it('Try create a new collateral with a total fee higher than the difference between balance ratio and liquidation ratio', async function () {
            await Helper.tryCatchRevert(
                () => new EntryBuilder()
                    .with('balanceRatio', bn(10002))
                    .with('liquidationRatio', bn(10001))
                    .with('burnFee', bn(490))
                    .with('rewardFee', bn(485))
                    .build(),
                'The fee should be less than the difference between balance ratio and liquidation ratio'
            );
        });
        it('Try create a new collateral for a closed loan', async function () {
            const entry = await new EntryBuilder().build();
            await lend(entry);

            await Helper.tryCatchRevert(
                () => new EntryBuilder()
                    .with('loanId', entry.loanId)
                    .build(),
                'Debt request should be open'
            );
        });
        it('Try create a new collateral without approval of the token collateral', async function () {
            const loan = await new EntryBuilder()
                .with('onlyTakeALoan', true)
                .build();

            await auxToken.approve(collateral.address, 0, { from: creator });

            await Helper.tryCatchRevert(
                () => collateral.create(
                    loan,             // debtId
                    auxToken.address, // token
                    1,                // amount
                    bn(15000),      // liquidationRatio
                    bn(20000),      // balanceRatio
                    bn(0),          // burnFee
                    bn(0),          // rewardFee
                    { from: creator }
                ),
                'Error pulling tokens'
            );
        });
    });
    describe('Function deposit', function () {
        it('Should deposit an amount in a collateral', async function () {
            const entry = await new EntryBuilder().build();
            await deposit(auxToken, collateral, entry.id, bn(1000), creator);
        });
        it('Try deposit an amount in a collateral without approval of the token collateral', async function () {
            const entry = await new EntryBuilder().build();

            const depositAmount = bn(10000);

            await auxToken.setBalance(depositer, depositAmount);

            await Helper.tryCatchRevert(
                () => collateral.deposit(
                    entry.id,
                    depositAmount,
                    { from: depositer }
                ),
                'Error pulling tokens'
            );
        });
    });
    describe('Function withdraw', function () {
        it('Should withdraw tokens of an entry', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(1))
                .build();

            await withdraw(
                entry.id,
                creator,
                bn(1),
                creator
            );
        });
        it('Try withdraw an entry without having collateral balance', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(0))
                .build();

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);

            await Helper.tryCatchRevert(
                () => withdraw(
                    entry.id,
                    creator,
                    bn(2).pow(bn(127)),
                    creator
                ),
                'Dont have collateral to withdraw'
            );

            await collateralSnap.requireConstant();

            await Helper.tryCatchRevert(
                () => withdraw(
                    entry.id,
                    creator,
                    bn(1),
                    creator
                ),
                'Dont have collateral to withdraw'
            );

            await collateralSnap.requireConstant();
        });
        it('Try withdraw an entry without having collateral balance after lend', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(0))
                .build();

            await lend(entry);

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);

            await Helper.tryCatchRevert(
                () => withdraw(
                    entry.id,
                    creator,
                    bn(1),
                    creator
                ),
                'Dont have collateral to withdraw'
            );

            await collateralSnap.requireConstant();
        });
        it('Try withdraw an entry without being authorized', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(100))
                .build();

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);

            await Helper.tryCatchRevert(
                () => withdraw(
                    entry.id,
                    lender,
                    bn(1),
                    lender
                ),
                'Sender not authorized'
            );

            await collateralSnap.requireConstant();
        });
    });
    describe('Function redeem', function () {
        it('Should redeem an entry with a not existing loan', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(2000))
                .build();

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);
            const creatorSnap = await Helper.balanceSnap(auxToken, creator);

            const Redeemed = await Helper.toEvents(
                collateral.redeem(
                    entry.id,
                    { from: creator }
                ),
                'Redeemed'
            );

            // Check redeem event params
            expect(Redeemed._id).to.eq.BN(entry.id);

            // Check if collateral entry was deleted
            await requireDeleted(entry.id, entry.loanId);

            // Validate balances and ownership
            await collateralSnap.requireDecrease(entry.entryAmount);
            await creatorSnap.requireIncrease(entry.entryAmount);
            assert.equal(await collateral.ownerOf(entry.id), creator);
        });
        it('Should redeem an entry paying with collateral', async function () {
            // Create collateral and take snap
            const initialCollateralSnap = await Helper.balanceSnap(auxToken, collateral.address);

            const entry = await new EntryBuilder()
                .with('entryAmount', bn(5000))
                .with('loanAmount', bn(500))
                .with('durationDelta', bn(500))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            await lend(entry);

            await rcn.setBalance(converter.address, bn(2).pow(bn(40)));

            // Snaps before claim pay
            let collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const debtSnap = await Helper.balanceSnap(rcn, debtEngine.address, 'debt engine');

            // Increase time and claim payment
            await Helper.increaseTime(entry.durationDelta.add(entry.durationDelta));
            await collateral.claim(loanManager.address, entry.loanId, []);

            // Require transfer of tokens Collateral -convert-> Loan manager
            await collateralSnap.requireDecrease(entry.withFee(entry.loanAmount));
            await debtSnap.requireIncrease(entry.loanAmount);

            collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const creatorSnap = await Helper.balanceSnap(auxToken, creator, 'creator');

            // Redeem extra tokens
            const Redeemed = await Helper.toEvents(
                collateral.redeem(
                    entry.id,
                    { from: creator }
                ),
                'Redeemed'
            );

            expect(Redeemed._id).to.eq.BN(entry.id);

            await requireDeleted(entry.id, entry.loanId);

            await initialCollateralSnap.requireConstant();
            await collateralSnap.requireDecrease(entry.entryAmount.sub(entry.loanAmount));
            await creatorSnap.requireIncrease(entry.entryAmount.sub(entry.loanAmount));

            assert.equal(await collateral.ownerOf(entry.id), creator);
        });
        it('Try redeem an entry without being authorized', async function () {
            const entry = await new EntryBuilder().build();

            await Helper.tryCatchRevert(
                () => collateral.redeem(
                    entry.id,
                    { from: borrower }
                ),
                'Sender not authorized'
            );
        });
        it('Try redeem an entry with ongoing loan', async function () {
            const entry = await new EntryBuilder().build();
            await lend(entry);

            await Helper.tryCatchRevert(
                () => collateral.redeem(
                    entry.id,
                    { from: creator }
                ),
                'Debt not request or paid'
            );
        });
        it('Try redeem an entry with loan in ERROR status', async function () {
            const entry = await new EntryBuilder().build();
            await lend(entry);

            await model.setErrorFlag(entry.loanId, 4, { from: owner });

            await Helper.tryCatchRevert(
                () => collateral.redeem(
                    entry.id,
                    { from: creator }
                ),
                'Debt not request or paid'
            );
        });
    });
    describe('Function emergencyRedeem', function () {
        it('Should redeem an entry with a loan in ERROR status', async function () {
            const entry = await new EntryBuilder().build();
            await lend(entry);

            await model.setErrorFlag(entry.loanId, 4, { from: owner });

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const receiverSnap = await Helper.balanceSnap(auxToken, accounts[7], 'receiver');

            const EmergencyRedeemed = await Helper.toEvents(
                collateral.emergencyRedeem(
                    entry.id,
                    accounts[7],
                    { from: owner }
                ),
                'EmergencyRedeemed'
            );

            expect(EmergencyRedeemed._id).to.eq.BN(entry.id);
            assert.equal(EmergencyRedeemed._to, accounts[7]);

            // TODO May remove delete in emergency redeem
            await requireDeleted(entry.id, entry.loanId);

            await collateralSnap.requireDecrease(entry.entryAmount);
            await receiverSnap.requireIncrease(entry.entryAmount);
        });
        it('Try redeem an entry with a loan in not ERROR status', async function () {
            const entry = await new EntryBuilder().build();
            await lend(entry);

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);
            const receiverSnap = await Helper.balanceSnap(auxToken, accounts[7]);

            await Helper.tryCatchRevert(
                () => collateral.emergencyRedeem(
                    entry.id,
                    creator,
                    { from: owner }
                ),
                'Debt is not in error'
            );

            await collateralSnap.requireConstant();
            await receiverSnap.requireConstant();
        });
    });
    describe('Function payOffDebt', function () {
        it('Should pay off a debt', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(1000))
                .with('loanAmount', bn(100))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            await lend(entry);

            await rcn.setBalance(converter.address, bn(2).pow(bn('40')));

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const debtSnap = await Helper.balanceSnap(rcn, debtEngine.address, 'debt engine');

            const events = await Helper.toEvents(
                collateral.payOffDebt(
                    entry.id,
                    [],
                    { from: creator }
                ),
                'PayOffDebt',
                'ConvertPay'
            );

            // Assert payoff event
            const PayOffDebt = events[0];
            expect(PayOffDebt._id).to.eq.BN(entry.id);
            expect(PayOffDebt._closingObligationToken).to.eq.BN(entry.loanAmount);

            // Assert convert pay event
            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(entry.loanAmount);
            expect(ConvertPay._toAmount).to.eq.BN(entry.loanAmount);
            assert.equal(ConvertPay._oracleData, null);

            // Assert modified entry
            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.amount).to.eq.BN(entry.entryAmount.sub(entry.loanAmount));

            // Assert token movement
            await collateralSnap.requireDecrease(entry.loanAmount);
            await debtSnap.requireIncrease(entry.loanAmount);

            // Assert paid loan
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '2');
        });
        it('Should pay off a debt with oracle', async function () {
            // 0.82711175222132156792 debt currency = 1.23333566612312 token
            const tokens = bn('123333566612312000000');
            const equivalent = bn('82711175222132156792');

            const oracleData = await oracle.encodeRate(tokens, equivalent);

            const entry = await new EntryBuilder()
                .with('entryAmount', bn(1000))
                .with('loanAmount', bn(100))
                .with('rateFromRCN', WEI.mul(bn(2)))
                .with('rateToRCN', WEI.mul(bn(2)))
                .build();

            await lend(entry);

            // Read closing obligation
            const closingObligation = await loanManager.getClosingObligation(entry.loanId);
            const closingObligationInToken = await toTokens(entry.loanId, closingObligation, oracleData);
            const closignObligationInCollateral = closingObligationInToken.divRound(bn(2));

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const debtSnap = await Helper.balanceSnap(rcn, debtEngine.address, 'debt engine');

            const events = await Helper.toEvents(
                collateral.payOffDebt(
                    entry.id,
                    oracleData,
                    { from: creator }
                ),
                'PayOffDebt',
                'ConvertPay'
            );

            // Assert PayOff event
            const PayOffDebt = events[0];
            expect(PayOffDebt._id).to.eq.BN(entry.id);
            expect(PayOffDebt._closingObligationToken).to.eq.BN(closingObligationInToken);

            // Assert convert pay event
            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(closignObligationInCollateral);
            expect(ConvertPay._toAmount).to.eq.BN(closingObligationInToken);
            assert.equal(ConvertPay._oracleData, oracleData);

            // Assert entry
            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.amount).to.eq.BN(entry.entryAmount.sub(closignObligationInCollateral));

            // Check balances
            await collateralSnap.requireDecrease(closignObligationInCollateral);
            await debtSnap.requireIncrease(closingObligationInToken);

            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '2');
        });
        it('Try pay off a debt without authorization', async function () {
            const entry = await new EntryBuilder().build();
            await lend(entry);

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const debtSnap = await Helper.balanceSnap(rcn, debtEngine.address, 'debt engine');

            await Helper.tryCatchRevert(
                () => collateral.payOffDebt(
                    entry.id,
                    [],
                    { from: lender }
                ),
                'The sender its not authorized'
            );

            await collateralSnap.requireConstant();
            await debtSnap.requireConstant();
        });
        it('Try pay off a non existing debt', async function () {
            const entry = await new EntryBuilder().build();

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const debtSnap = await Helper.balanceSnap(rcn, debtEngine.address, 'debt engine');

            await Helper.tryCatchRevert(
                () => collateral.payOffDebt(
                    entry.id,
                    [],
                    { from: creator }
                ),
                'Debt does not exist'
            );

            await collateralSnap.requireConstant();
            await debtSnap.requireConstant();
        });
    });
    describe('Function claim', function () {
        it('Should claim an entry if the loan passed due time', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(6542))
                .with('loanAmount', bn(1000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            await lend(entry);

            // Pass due time
            await Helper.increaseTime(entry.durationDelta);

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const debtSnap = await Helper.balanceSnap(rcn, debtEngine.address, 'debt engine');

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    entry.loanId,
                    [],
                    { from: creator }
                ),
                'CancelDebt',
                'ConvertPay'
            );

            // Assert cancel events
            const CancelDebt = events[0];
            expect(CancelDebt._id).to.eq.BN(entry.id);
            expect(CancelDebt._obligationInToken).to.eq.BN(entry.loanAmount);

            // Assert convert pay events
            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(entry.loanAmount);
            expect(ConvertPay._toAmount).to.eq.BN(entry.loanAmount);
            assert.equal(ConvertPay._oracleData, null);

            // Assert entry changes
            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.amount).to.eq.BN(entry.entryAmount.sub(entry.loanAmount));

            // Assert balance change
            await collateralSnap.requireDecrease(entry.loanAmount);
            await debtSnap.requireIncrease(entry.loanAmount);

            // Check loan status
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '2');
        });
        it('Should claim an entry and pay the loan with oracle', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(6542))
                .with('loanAmount', bn(1000))
                .with('oracle', oracle)
                .with('tokens', bn('123333566612312000000'))
                .with('equivalent', bn('82711175222132156792'))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .with('rateFromRCN', WEI.mul(bn(2)))
                .with('rateToRCN', WEI.mul(bn(2)))
                .build();

            await lend(entry);

            await Helper.increaseTime(entry.durationDelta);

            const closingObligation = await loanManager.getClosingObligation(entry.loanId);
            const closingObligationInToken = divceil(closingObligation.mul(entry.tokens), entry.equivalent);
            await rcn.setBalance(converter.address, closingObligationInToken);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    entry.loanId,
                    entry.oracleData,
                    { from: creator }
                ),
                'CancelDebt',
                'ConvertPay'
            );

            const CancelDebt = events[0];
            expect(CancelDebt._id).to.eq.BN(entry.id);
            expect(CancelDebt._obligationInToken).to.eq.BN(entry.amountInToken);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(closingObligationInToken.div(bn(2)));
            expect(ConvertPay._toAmount).to.eq.BN(closingObligationInToken);
            assert.equal(ConvertPay._oracleData, entry.oracleData);

            const entryStorage = await collateral.entries(entry.id);
            expect(entryStorage.liquidationRatio).to.eq.BN(entry.liquidationRatio);
            expect(entryStorage.balanceRatio).to.eq.BN(entry.balanceRatio);
            expect(entryStorage.burnFee).to.eq.BN(entry.burnFee);
            expect(entryStorage.rewardFee).to.eq.BN(entry.rewardFee);
            assert.equal(entryStorage.token, auxToken.address);
            assert.equal(entryStorage.debtId, entry.loanId);
            expect(entryStorage.amount).to.eq.BN(entry.entryAmount.sub(closingObligationInToken.div(bn(2))));

            expect(await collateral.debtToEntry(entry.loanId)).to.eq.BN(entry.id);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(closingObligationInToken.div(bn(2))));
            assert.equal(await collateral.ownerOf(entry.id), creator);

            expect(await model.getClosingObligation(entry.loanId)).to.eq.BN(0);
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '2');
        });
        it('Should claim an entry and equilibrate the entry', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(1100))
                .with('loanAmount', bn(1000))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            await lend(entry);

            const equilibrateAmount = bn('900');

            await rcn.setBalance(converter.address, equilibrateAmount);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    entry.loanId,
                    [],
                    { from: creator }
                ),
                'CollateralBalance',
                'ConvertPay'
            );

            const CollateralBalance = events[0];
            expect(CollateralBalance._id).to.eq.BN(entry.id);
            expect(CollateralBalance._tokenPayRequired).to.eq.BN(equilibrateAmount);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(equilibrateAmount);
            expect(ConvertPay._toAmount).to.eq.BN(equilibrateAmount);
            assert.equal(ConvertPay._oracleData, null);

            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.liquidationRatio).to.eq.BN(entry.liquidationRatio);
            expect(storageEntry.balanceRatio).to.eq.BN(entry.balanceRatio);
            expect(storageEntry.burnFee).to.eq.BN(entry.burnFee);
            expect(storageEntry.rewardFee).to.eq.BN(entry.rewardFee);
            assert.equal(storageEntry.token, auxToken.address);
            assert.equal(storageEntry.debtId, entry.loanId);
            expect(storageEntry.amount).to.eq.BN(entry.entryAmount.sub(equilibrateAmount));

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(equilibrateAmount));
            assert.equal(await collateral.ownerOf(entry.id), creator);

            expect(await collateral.debtToEntry(entry.loanId)).to.eq.BN(entry.id);

            expect(await model.getClosingObligation(entry.loanId)).to.eq.BN(entry.loanAmount.sub(equilibrateAmount));
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '1');

            assert.isTrue((await collateral.collateralRatio(
                entry.id,
                bn(0),
                bn(0)
            )).gte(entry.liquidationRatio));
        });
        it('Should claim an entry and equilibrate the entry, with a debt with oracle', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(11000000))
                .with('loanAmount', bn(10000000))
                .with('oracle', oracle)
                .with('tokens', bn('90000000000000000000'))
                .with('equivalent', bn('100000000000000000000'))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            const equilibrateAmountInToken = bn('7000327');
            const equilibrateAmountInCollateral = equilibrateAmountInToken;

            await lend(entry);

            await rcn.setBalance(converter.address, equilibrateAmountInToken);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    entry.loanId,
                    entry.oracleData,
                    { from: creator }
                ),
                'CollateralBalance',
                'ConvertPay'
            );

            const CollateralBalance = events[0];
            expect(CollateralBalance._id).to.eq.BN(entry.id);
            expect(CollateralBalance._tokenPayRequired).to.eq.BN(equilibrateAmountInToken);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(equilibrateAmountInCollateral);
            expect(ConvertPay._toAmount).to.eq.BN(equilibrateAmountInToken);
            assert.equal(ConvertPay._oracleData, entry.oracleData);

            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.liquidationRatio).to.eq.BN(entry.liquidationRatio);
            expect(storageEntry.balanceRatio).to.eq.BN(entry.balanceRatio);
            expect(storageEntry.burnFee).to.eq.BN(entry.burnFee);
            expect(storageEntry.rewardFee).to.eq.BN(entry.rewardFee);
            assert.equal(storageEntry.token, auxToken.address);
            assert.equal(storageEntry.debtId, entry.loanId);
            expect(storageEntry.amount).to.eq.BN(entry.entryAmount.sub(equilibrateAmountInCollateral));

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(equilibrateAmountInCollateral));
            assert.equal(await collateral.ownerOf(entry.id), creator);

            expect(await collateral.debtToEntry(entry.loanId)).to.eq.BN(entry.id);

            const payAmount = equilibrateAmountInToken.mul(entry.equivalent).div(entry.tokens);
            expect(await model.getClosingObligation(entry.loanId)).to.eq.BN(entry.loanAmount.sub(payAmount));
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '1');

            assert.isTrue((await collateral.collateralRatio(
                entry.id,
                entry.tokens,
                entry.equivalent
            )).gte(entry.liquidationRatio));
        });
        it('Should claim an entry and equilibrate the entry, with a debt with oracle and fee', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(11000000))
                .with('loanAmount', bn(20000000))
                .with('oracle', oracle)
                .with('tokens', bn('90000000000000000000'))
                .with('equivalent', bn('100000000000000000000'))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(0))
                .with('rateFromRCN', WEI.mul(bn(2)))
                .with('rateToRCN', WEI.mul(bn(2)))
                .build();

            await lend(entry);

            // TODO CHECKPOINT

            const totalFee = entry.burnFee.add(entry.rewardFee);
            const equilibrateAmountInCollateral = bn('7000327');

            const equilibrateAmountInToken = equilibrateAmountInCollateral.mul(bn(2));

            const rewardedCollateral = equilibrateAmountInCollateral.mul(entry.rewardFee).div(BASE);

            await rcn.setBalance(converter.address, equilibrateAmountInToken * 2);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);
            const prevRCNBal = await auxToken.balanceOf(rcn.address);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    loanId,
                    oracleData,
                    { from: creator }
                ),
                'CollateralBalance',
                'ConvertPay',
                'TakeFee'
            );

            // CollateralBalance emits the result of the collateral balancing
            // tokenPayRequired is the ideal amount to sent tokens
            const CollateralBalance = events[0];
            expect(
                CollateralBalance._id,
                'Should emit the collateral ID'
            ).to.eq.BN(entryId);

            expect(
                CollateralBalance._tokenPayRequired,
                'Should emit the ideal amount to equilibrate'
            ).to.eq.BN(equilibrateAmountInToken);

            // ConvertPay emits the result of the change operation
            // _fromAmount is the amount in collateral sold
            // _toAmount is the amount of tokens bought
            // _oracleData is used to reconstruct the operation
            const ConvertPay = events[1];
            expect(
                ConvertPay._fromAmount,
                'Amount sold to equilibrate and pay fees'
            ).to.eq.BN(equilibrateAmountInCollateral.mul(BASE.add(totalFee)).div(BASE).add(bn(1)));

            expect(
                ConvertPay._toAmount,
                'Amount bought to equilbirate and pay fees'
            ).to.eq.BN(equilibrateAmountInToken.mul(BASE.add(totalFee)).div(BASE));

            assert.equal(ConvertPay._oracleData, oracleData);

            console.log(events);

            const TakeMargincallFee = events[2];

            expect(TakeMargincallFee._burned).to.eq.BN(0);
            expect(
                TakeMargincallFee._rewarded
            ).to.eq.BN(
                ConvertPay._fromAmount.mul(rewardFee).div(BASE).sub(bn(1))
            );

            const storageEntry = await collateral.entries(entryId);
            expect(storageEntry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(storageEntry.balanceRatio).to.eq.BN(balanceRatio);
            expect(storageEntry.burnFee).to.eq.BN(burnFee);
            expect(storageEntry.rewardFee).to.eq.BN(rewardFee);
            assert.equal(storageEntry.token, auxToken.address);
            assert.equal(storageEntry.debtId, loanId);
            expect(storageEntry.amount).to.eq.BN(entryAmount.sub(equilibrateAmountInCollateral.add(rewardedCollateral).add(bn(1))));

            // TODO: re-do test
            // expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(equilibrateAmountInCollateral.add(rewardedCollateral)));
            // expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(rewardedCollateral));
            expect(await auxToken.balanceOf(rcn.address)).to.eq.BN(prevRCNBal);

            assert.equal(await collateral.ownerOf(entryId), creator);

            expect(await collateral.debtToEntry(loanId)).to.eq.BN(entryId);

            const payAmount = equilibrateAmountInToken.mul(equivalent).div(tokens);
            // expect(await model.getClosingObligation(loanId)).to.eq.BN(amount.sub(payAmount));
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '1');

            assert.isTrue((await collateral.collateralRatio(
                entryId,
                tokens,
                equivalent
            )).gte(liquidationRatio));
        });
        it('Should claim an entry and pay the loan, with a debt with oracle and fee', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('20000000');
            const entryAmount = bn('11000000');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const burnFee = bn('334');
            const rewardFee = bn('666');
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            // 1 collateral token = 2 token
            await converter.setRate(auxToken.address, rcn.address, WEI.mul(bn(2)));
            await converter.setRate(rcn.address, auxToken.address, WEI.div(bn(2)));

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                oracle.address,    // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const entryId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, entryAmount);
            await auxToken.approve(collateral.address, entryAmount, { from: creator });

            await collateral.create(
                loanId,
                auxToken.address,
                entryAmount,
                liquidationRatio,
                balanceRatio,
                burnFee,
                rewardFee,
                { from: creator }
            );

            // 1 debt currency = 0.9 token
            const tokens = bn('90000000000000000000');
            const equivalent = bn('100000000000000000000');

            const amountInToken = amount.mul(tokens).div(equivalent);

            await rcn.setBalance(lender, amountInToken);
            await rcn.approve(loanManager.address, amountInToken, { from: lender });

            const oracleData = await oracle.encodeRate(tokens, equivalent);

            await loanManager.lend(
                loanId,
                oracleData,
                collateral.address,
                bn(0),
                Helper.toBytes32(entryId),
                { from: lender }
            );

            const closingObligation = await loanManager.getClosingObligation(loanId);
            const closingObligationInToken = divceil(closingObligation.mul(tokens), equivalent);
            const closingObligationInCollateral = closingObligationInToken.div(bn(2));

            await rcn.setBalance(converter.address, closingObligationInToken);

            const burnedCollateral = closingObligationInCollateral.mul(burnFee).div(BASE);
            const rewardedCollateral = closingObligationInCollateral.mul(rewardFee).div(BASE);
            const totalFeeCollateral = burnedCollateral.add(rewardedCollateral);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);
            const prevRCNBal = await auxToken.balanceOf(rcn.address);
            const prevBurnerBal = await auxToken.balanceOf(Helper.address0x);

            await Helper.increaseTime(loanDuration + 10);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    loanId,
                    oracleData,
                    { from: creator }
                ),
                'CancelDebt',
                'ConvertPay',
                'TakeDebtFee'
            );

            const CancelDebt = events[0];
            expect(CancelDebt._id).to.eq.BN(entryId);
            expect(CancelDebt._obligationInToken).to.eq.BN(amountInToken);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(closingObligationInCollateral);
            expect(ConvertPay._toAmount).to.eq.BN(amountInToken);
            assert.equal(ConvertPay._oracleData, oracleData);

            const TakeDebtFee = events[2];
            expect(TakeDebtFee._burned).to.eq.BN(burnedCollateral);
            expect(TakeDebtFee._rewarded).to.eq.BN(rewardedCollateral);

            const entry = await collateral.entries(entryId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.burnFee).to.eq.BN(burnFee);
            expect(entry.rewardFee).to.eq.BN(rewardFee);
            expect(entry.burnFee).to.eq.BN(burnFee);
            expect(entry.rewardFee).to.eq.BN(rewardFee);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(entryAmount.sub(closingObligationInCollateral.add(totalFeeCollateral)));

            expect(await collateral.debtToEntry(loanId)).to.eq.BN(entryId);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(closingObligationInCollateral.add(totalFeeCollateral)));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(rewardedCollateral));
            expect(await auxToken.balanceOf(rcn.address)).to.eq.BN(prevRCNBal);
            expect(await auxToken.balanceOf(Helper.address0x)).to.eq.BN(prevBurnerBal.add(burnedCollateral));

            assert.equal(await collateral.ownerOf(entryId), creator);

            expect(await model.getClosingObligation(loanId)).to.eq.BN(0);
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
        });
        it('Should claim an entry and pay all collateral token, with a debt with oracle and fee', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('10000000');
            const entryAmount = bn('4000000');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const burnFee = bn('654');
            const rewardFee = bn('789');
            // const margincallBurnFee = bn('666');
            // const margincallRewardFee = bn('334');
            const totalMargincallFee = margincallBurnFee.add(margincallRewardFee);
            const collateralToPay = entryAmount.mul(BASE.sub(totalMargincallFee)).div(BASE);
            const tokenToPay = collateralToPay.mul(bn(2));
            const burnedCollateral = collateralToPay.mul(burnFee).div(BASE);
            const rewardedCollateral = collateralToPay.mul(rewardFee).div(BASE);
            const totalFeeCollateral = burnedCollateral.add(rewardedCollateral);
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            // 1 collateral token = 2 token
            await converter.setRate(auxToken.address, rcn.address, WEI.mul(bn(2)));
            await converter.setRate(rcn.address, auxToken.address, WEI.div(bn(2)));

            const loanData = await model.encodeData(amount, expiration);

            console.log('A to request');

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                oracle.address,    // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const entryId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, entryAmount);
            await auxToken.approve(collateral.address, entryAmount, { from: creator });

            console.log('A to create');
            await collateral.create(
                loanId,
                auxToken.address,
                entryAmount,
                liquidationRatio,
                balanceRatio,
                burnFee,
                rewardFee,
                { from: creator }
            );

            // 1 debt currency = 0.9 token
            const tokens = bn('90000000000000000000');
            const equivalent = bn('100000000000000000000');

            const amountInToken = amount.mul(tokens).div(equivalent);

            await rcn.setBalance(lender, amountInToken);
            await rcn.approve(loanManager.address, amountInToken, { from: lender });

            const oracleData = await oracle.encodeRate(tokens, equivalent);

            console.log('A to lend');
            await loanManager.lend(
                loanId,
                oracleData,
                collateral.address,
                bn(0),
                Helper.toBytes32(entryId),
                { from: lender }
            );

            await rcn.setBalance(converter.address, tokenToPay);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);
            const prevRCNBal = await auxToken.balanceOf(rcn.address);
            const prevBurnerBal = await auxToken.balanceOf(Helper.address0x);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    loanId,
                    oracleData,
                    { from: creator }
                ),
                'CollateralBalance',
                'ConvertPay',
                'TakeMargincallFee'
            );

            const CollateralBalance = events[0];
            expect(CollateralBalance._id).to.eq.BN(entryId);
            expect(CollateralBalance._tokenPayRequired).to.eq.BN(tokenToPay);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(collateralToPay);
            expect(ConvertPay._toAmount).to.eq.BN(tokenToPay);
            assert.equal(ConvertPay._oracleData, oracleData);

            const TakeMargincallFee = events[2];
            expect(TakeMargincallFee._burned).to.eq.BN(burnedCollateral);
            expect(TakeMargincallFee._rewarded).to.eq.BN(rewardedCollateral);

            const entry = await collateral.entries(entryId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.burnFee).to.eq.BN(burnFee);
            expect(entry.rewardFee).to.eq.BN(rewardFee);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(entryAmount.sub(collateralToPay.add(totalFeeCollateral)));

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(collateralToPay.add(totalFeeCollateral)));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(rewardedCollateral));
            expect(await auxToken.balanceOf(rcn.address)).to.eq.BN(prevRCNBal);
            expect(await auxToken.balanceOf(Helper.address0x)).to.eq.BN(prevBurnerBal.add(burnedCollateral));

            assert.equal(await collateral.ownerOf(entryId), creator);

            expect(await collateral.debtToEntry(loanId)).to.eq.BN(entryId);

            const closingObligationInToken = (await model.getClosingObligation(loanId)).mul(tokens).div(equivalent);
            expect(closingObligationInToken).to.eq.BN(amountInToken.sub(tokenToPay));
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '1');
        });
    });
    describe('Functional test', function () {
        const ratesMsg = [
            'Debt in Token, debt Token and collateral Token are the same',
            'Debt in Token, debt Token and collateral Token are different',
            'Debt use oracle, debt Token and collateral Token are the same',
            'Debt use oracle, debt Token and collateral Token are different',
        ];
        const paths = [
            'collateral require to balance',
            'entry amount',
            'debt amount',
        ];

        it('Test 0: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 12000, 15000, 1000, 1100, 1));
        it('Test 1: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 1000, 1100, 1));
        it('Test 2: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 9000000, 11000000, 1));
        it('Test 3: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[2],
            cTest(1, 1, 15000, 20000, 600, 600, 1));
        it('Test 4: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[1],
            cTest(1, 1, 12345, 23456, 300, 200, 1));
        // Debt in Token
        it('Test 5: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 200, 450, 2));
        it('Test 6: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 200, 600, 0.45));
        it('Test 7: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[2],
            cTest(1, 1, 15000, 20000, 300, 600, 0.50));
        it('Test 8: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 90000, 100000, 2000, 6000, 0.50));
        it('Test 9: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 200, 201, 2.00));
        it('Test 10: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[1],
            cTest(1, 1, 15000, 20000, 310, 600, 0.50));
        it('Test 11: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 310, 930, 2.00));
        it('Test 12: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 310, 930, 0.40));
        // Collateral in Token
        it('Test 13: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[0],
            cTest(5, 1, 12345, 15678, 100, 600, 1.00));
        it('Test 14: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[2],
            cTest(1, 2, 17110, 20000, 1200, 600, 1.00));
        it('Test 15: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[0],
            cTest(2, 7, 16500, 20000, 100, 600, 1.00));
        it('Test 16: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[0],
            cTest(1, 2, 11000, 20000, 100, 600, 1.00));
        it('Test 17: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[1],
            cTest(1, 2, 11000, 20000, 1000, 100, 1.00));

        it('Test 18: ' + ratesMsg[3] + ', ' + 'Path: ' + paths[1],
            cTest(1, 2, 11000, 20000, 1000, 100, 0.50));
        it('Test 19: ' + ratesMsg[3] + ', ' + 'Path: ' + paths[0],
            cTest(1, 4, 11000, 20000, 4000, 1500, 1.50));
        it('Test 20: ' + ratesMsg[3] + ', ' + 'Path: ' + paths[2],
            cTest(1, 2, 11000, 20000, 1000, 1000, 0.50));
        it('Test 21: ' + ratesMsg[3] + ', ' + 'Path: ' + paths[0],
            cTest(4, 1, 11000, 20000, 1500, 8000, 1.50));

        // Converter error: When the collateral calculate collateralToPay, use valueTokensToCollateral and the Converter
        //      maybe return a different value
        //     Because the conversion rate of xToken to yToken might not be the same as the conversion of yToken to xToken

        function cTest (
            tokens,
            equivalent,
            liquidationRatioLimit,
            balanceRatioLimit,
            debt,
            entryAmount,
            collateralToTokenRate
        ) {
            return async () => {
                liquidationRatioLimit = bn(liquidationRatioLimit.toString());
                balanceRatioLimit = bn(balanceRatioLimit.toString());
                debt = bn(debt.toString());
                tokens = bn(tokens.toString());
                equivalent = bn(equivalent.toString());
                const debtRCN = debt.mul(tokens).div(equivalent);

                entryAmount = bn(entryAmount.toString());

                const tokenToCollateralRate = bn(Math.round(10000 / collateralToTokenRate).toString()).mul(WEI).div(BASE);
                await converter.setRate(rcn.address, auxToken.address, tokenToCollateralRate);

                collateralToTokenRate = bn((collateralToTokenRate * 10000).toString()).mul(WEI).div(BASE);
                await converter.setRate(auxToken.address, rcn.address, collateralToTokenRate);

                const collateralInToken = await converter.getReturn(auxToken.address, rcn.address, entryAmount);
                const collateralRatio = collateralInToken.mul(BASE).div(debtRCN);
                const liquidationDeltaRatio = collateralRatio.sub(liquidationRatioLimit);
                const balanceDeltaRatio = collateralRatio.sub(balanceRatioLimit);
                const canWithdraw = entryAmount.mul(balanceDeltaRatio).div(collateralRatio);

                async function calcRequiredCollateralPay () {
                    if (liquidationDeltaRatio.lt(bn(0))) {
                        return min(
                            // Collateral require to balance
                            canWithdraw.abs().mul(BASE).div(balanceRatioLimit.sub(BASE)),
                            // Collateral
                            entryAmount,
                            // Debt In Collateral
                            await converter.getReturn(rcn.address, auxToken.address, debtRCN)
                        );
                    } else {
                        return bn(0);
                    }
                };

                const requiredCollateralPay = await calcRequiredCollateralPay();
                const requiredTokenPay = await converter.getReturn(auxToken.address, rcn.address, requiredCollateralPay);
                const newDebt = debtRCN.sub(requiredTokenPay);
                const newCollateral = entryAmount.sub(requiredCollateralPay);
                const newCollateralInToken = await converter.getReturn(auxToken.address, rcn.address, newCollateral);
                const newCollateralRatio = newDebt.isZero() ? null : divceil(newCollateralInToken.mul(BASE), newDebt);
                const collateralized = newCollateralRatio === null ? true : newCollateralRatio.gte(liquidationRatioLimit) !== -1;

                // ------------------------------------------------------

                const salt = bn(web3.utils.randomHex(32));
                const loanDuration = 100;
                const expiration = (await Helper.getBlockTime()) + loanDuration;

                const loanData = await model.encodeData(debt, expiration);

                const loanId = await getId(loanManager.requestLoan(
                    debt,              // Amount
                    model.address,     // Model
                    oracle.address,    // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ));

                const entryId = await collateral.getEntriesLength();

                await auxToken.setBalance(creator, entryAmount);
                await auxToken.approve(collateral.address, entryAmount, { from: creator });

                await collateral.create(
                    loanId,
                    auxToken.address,
                    entryAmount,
                    liquidationRatioLimit,
                    balanceRatioLimit,
                    0,
                    0,
                    { from: creator }
                );

                await rcn.setBalance(creator, debtRCN);
                await rcn.approve(loanManager.address, debtRCN, { from: creator });

                const oracleData = await oracle.encodeRate(tokens, equivalent);

                await loanManager.lend(
                    loanId,
                    oracleData,
                    collateral.address,
                    bn(0),
                    Helper.toBytes32(entryId),
                    { from: creator }
                );

                expect(await converter.getReturn(auxToken.address, rcn.address, entryAmount)).to.eq.BN(collateralInToken);

                expect(await collateral.collateralInTokens(entryId)).to.eq.BN(collateralInToken);
                expect(await collateral.valueCollateralToTokens(entryId, entryAmount)).to.eq.BN(collateralInToken);

                expect(await collateral.debtInTokens(entryId, tokens, equivalent)).to.eq.BN(debtRCN);

                const _collateralRatio = await collateral.collateralRatio(entryId, tokens, equivalent);
                expect(_collateralRatio).to.eq.BN(collateralRatio);

                const _liquidationDeltaRatio = await collateral.liquidationDeltaRatio(entryId, tokens, equivalent);
                expect(_liquidationDeltaRatio).to.eq.BN(liquidationDeltaRatio);

                const _balanceDeltaRatio = await collateral.balanceDeltaRatio(entryId, tokens, equivalent);
                expect(_balanceDeltaRatio).to.eq.BN(balanceDeltaRatio);

                const _canWithdraw = await collateral.canWithdraw(entryId, tokens, equivalent);
                expect(_canWithdraw).to.eq.BN(canWithdraw);

                const _collateralToPay = await collateral.collateralToPay(entryId, tokens, equivalent);
                expect(_collateralToPay).to.eq.BN(requiredCollateralPay);

                const _tokensToPay = await collateral.tokensToPay(entryId, tokens, equivalent);
                expect(_tokensToPay).to.eq.BN(requiredTokenPay);

                await auxToken.setBalance(converter.address, bn(0));
                await rcn.setBalance(converter.address, _tokensToPay);

                await collateral.claim(loanManager.address, loanId, oracleData);

                const _newDebt = await collateral.debtInTokens(entryId, tokens, equivalent);
                roundCompare(_newDebt, newDebt);

                const _newCollateral = (await collateral.entries(entryId)).amount;
                roundCompare(_newCollateral, newCollateral);

                const _newCollateralInToken = await collateral.collateralInTokens(entryId);
                roundCompare(_newCollateralInToken, newCollateralInToken);

                if (!(newDebt.isZero() && newCollateral.isZero())) {
                    if (newDebt.isZero()) {
                        assert.isNull(newCollateralRatio);
                        assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
                    } else {
                        if (newCollateral.isZero()) {
                            assert.isTrue(newCollateralRatio.isZero());
                            assert.isFalse((await model.getStatus.call(loanId)).toString() === '2');
                        } else {
                            const _newCollateralRatio = await collateral.collateralRatio(entryId, tokens, equivalent);
                            assert.equal(_newCollateralRatio.gte(liquidationRatioLimit), collateralized);

                            assert.isFalse((await model.getStatus.call(loanId)).toString() === '2');
                            // if haves collateral the newCollateralRatio should be more or equal than ratioLimit
                            if (!_newCollateral.isZero()) {
                                assert.isTrue(newCollateralRatio.gte(liquidationRatioLimit));
                            }
                        }
                    }
                }

                const prevCollateralAmount = (await collateral.entries(entryId)).amount;
                const _coll = await collateral.collateralInTokens(entryId);
                const _debt = await collateral.debtInTokens(entryId, tokens, equivalent);
                const canPayAllDebt = _coll.gte(_debt);

                // Claim when the loan is in debt
                await Helper.increaseTime(loanDuration + 10);

                const closingObligation = (await model.getObligation(loanId, await Helper.getBlockTime()))[0];
                const closingObligationInToken = divceil(tokens.mul(closingObligation), equivalent);

                await rcn.setBalance(converter.address, closingObligationInToken);
                await auxToken.setBalance(converter.address, bn(0));

                await collateral.claim(loanManager.address, loanId, oracleData);

                const newCollateralAmount = (await collateral.entries(entryId)).amount;
                if (canPayAllDebt) {
                    const closingObligationInCollateral = await collateral.valueTokensToCollateral(entryId, closingObligationInToken);
                    roundCompare(newCollateralAmount, prevCollateralAmount.sub(closingObligationInCollateral)); // Convert rounded
                    assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
                } else {
                    expect(newCollateralAmount).to.eq.BN(bn(0));
                }
            };
        };
    });
    it('Set new url', async function () {
        const url = 'test.com';

        const SetUrl = await Helper.toEvents(
            collateral.setUrl(
                url,
                { from: owner }
            ),
            'SetUrl'
        );

        assert.equal(SetUrl._url, url);
        assert.equal(await collateral.url(), url);
    });
    it('Set new burner', async function () {
        const SetBurner = await Helper.toEvents(
            collateral.setBurner(
                creator,
                { from: owner }
            ),
            'SetBurner'
        );

        assert.equal(SetBurner._burner, creator);
        assert.equal(await collateral.burner(), creator);

        await collateral.setBurner(Helper.address0x, { from: owner });
    });
    it('Set new converter', async function () {
        const SetConverter = await Helper.toEvents(
            collateral.setConverter(
                Helper.address0x,
                { from: owner }
            ),
            'SetConverter'
        );

        assert.equal(SetConverter._converter, Helper.address0x);
        assert.equal(await collateral.converter(), Helper.address0x);

        await collateral.setConverter(converter.address, { from: owner });
    });
    it('The cost should be 0', async function () {
        expect(await collateral.cost(
            Helper.address0x,
            0,
            [],
            []
        )).to.eq.BN(0);
    });
    it('Function valueCollateralToTokens, valueTokensToCollateral and collateralInTokens', async function () {
        const loanAmount = bn('100');
        const entryAmount = bn('100');
        const liquidationRatio = bn('15000');
        const balanceRatio = bn('20000');

        const expiration = (await Helper.getBlockTime()) + 100;
        const loanId = await getId(loanManager.requestLoan(
            loanAmount, // Amount
            model.address, // Model
            Helper.address0x, // Oracle
            borrower, // Borrower
            bn(web3.utils.randomHex(32)), // salt
            expiration, // Expiration
            await model.encodeData(loanAmount, expiration), // Loan data
            { from: borrower } // Creator
        ));
        const entryId = await collateral.getEntriesLength();

        await auxToken.setBalance(creator, entryAmount);
        await auxToken.approve(collateral.address, entryAmount, { from: creator });

        await collateral.create(
            loanId,
            auxToken.address,
            entryAmount,
            liquidationRatio,
            balanceRatio,
            0,
            0,
            { from: creator }
        );

        await converter.setRate(auxToken.address, rcn.address, bn(2).mul(WEI));
        await converter.setRate(rcn.address, auxToken.address, bn('5').mul(WEI).div(bn(10)));

        expect(await collateral.collateralInTokens(
            entryId
        )).to.eq.BN(200);

        expect(await collateral.valueCollateralToTokens(
            entryId,
            0
        )).to.eq.BN(0);

        expect(await collateral.valueTokensToCollateral(
            entryId,
            0
        )).to.eq.BN(0);

        expect(await collateral.valueCollateralToTokens(
            entryId,
            200
        )).to.eq.BN(400);

        expect(await collateral.valueTokensToCollateral(
            entryId,
            400
        )).to.eq.BN(200);

        const entryId2 = await collateral.getEntriesLength();

        await rcn.setBalance(creator, entryAmount);
        await rcn.approve(collateral.address, entryAmount, { from: creator });

        await collateral.create(
            loanId,
            rcn.address,
            entryAmount,
            liquidationRatio,
            balanceRatio,
            0,
            0,
            { from: creator }
        );

        expect(await collateral.valueCollateralToTokens(
            entryId2,
            200
        )).to.eq.BN(200);

        expect(await collateral.valueTokensToCollateral(
            entryId2,
            200
        )).to.eq.BN(200);

        await converter.setRate(auxToken.address, rcn.address, 0);
        await converter.setRate(rcn.address, auxToken.address, 0);
    });
    it('Function debtInTokens, collateralRatio and canWithdraw', async function () {
        const loanAmount = bn('100');
        const entryAmount = bn('100');
        const liquidationRatio = bn('15000');
        const balanceRatio = bn('20000');

        const expiration = (await Helper.getBlockTime()) + 100;
        const loanId = await getId(loanManager.requestLoan(
            loanAmount,           // Amount
            model.address,     // Model
            Helper.address0x,  // Oracle
            borrower,          // Borrower
            bn(web3.utils.randomHex(32)), // salt
            expiration, // Expiration
            await model.encodeData(loanAmount, expiration), // Loan data
            { from: borrower } // Creator
        ));
        const entryId = await collateral.getEntriesLength();

        await rcn.setBalance(creator, entryAmount);
        await rcn.approve(collateral.address, entryAmount, { from: creator });

        await collateral.create(
            loanId,
            rcn.address,
            entryAmount,
            liquidationRatio,
            balanceRatio,
            0,
            0,
            { from: creator }
        );

        await rcn.setBalance(creator, loanAmount);
        await rcn.approve(loanManager.address, loanAmount, { from: creator });

        await loanManager.lend(
            loanId,
            [],
            collateral.address,
            bn(0),
            Helper.toBytes32(entryId),
            { from: creator }
        );

        expect(await collateral.debtInTokens(
            entryId,
            bn(0),
            bn(0)
        )).to.eq.BN(loanAmount);

        let calcCollateralRatio = entryAmount.mul(BASE).div(loanAmount);
        expect(await collateral.collateralRatio(
            entryId,
            bn(0),
            bn(0)
        )).to.eq.BN(calcCollateralRatio);

        let calcDeltaRatio = calcCollateralRatio.sub(balanceRatio);
        expect(await collateral.balanceDeltaRatio(
            entryId,
            bn(0),
            bn(0)
        )).to.eq.BN(calcDeltaRatio);

        let calcCanWithdraw = entryAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            entryId,
            bn(0),
            bn(0)
        )).to.eq.BN(calcCanWithdraw);

        const rateTokens = bn(2).mul(WEI);
        const rateEquivalent = WEI;

        const calcDebtInTokens = rateTokens.mul(loanAmount).div(rateEquivalent);
        expect(await collateral.debtInTokens(
            entryId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcDebtInTokens);

        calcCollateralRatio = entryAmount.mul(BASE).div(calcDebtInTokens);
        expect(await collateral.collateralRatio(
            entryId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio);

        calcDeltaRatio = calcCollateralRatio.sub(balanceRatio);
        expect(await collateral.balanceDeltaRatio(
            entryId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio.sub(balanceRatio));

        calcCanWithdraw = entryAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            entryId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCanWithdraw);
    });
    it('Function debtInTokens, collateralRatio and canWithdraw', async function () {
        const loanAmount = bn('100');
        const entryAmount = bn('100');
        const liquidationRatio = bn('15000');
        const balanceRatio = bn('20000');

        const expiration = (await Helper.getBlockTime()) + 100;
        const loanId = await getId(loanManager.requestLoan(
            loanAmount,           // Amount
            model.address,     // Model
            Helper.address0x,  // Oracle
            borrower,          // Borrower
            bn(web3.utils.randomHex(32)), // salt
            expiration, // Expiration
            await model.encodeData(loanAmount, expiration), // Loan data
            { from: borrower } // Creator
        ));
        const entryId = await collateral.getEntriesLength();

        await rcn.setBalance(creator, entryAmount);
        await rcn.approve(collateral.address, entryAmount, { from: creator });

        await collateral.create(
            loanId,
            rcn.address,
            entryAmount,
            liquidationRatio,
            balanceRatio,
            0,
            0,
            { from: creator }
        );

        await rcn.setBalance(creator, loanAmount);
        await rcn.approve(loanManager.address, loanAmount, { from: creator });

        await loanManager.lend(
            loanId,
            [],
            collateral.address,
            bn(0),
            Helper.toBytes32(entryId),
            { from: creator }
        );

        expect(await collateral.debtInTokens(
            entryId,
            bn(0),
            bn(0)
        )).to.eq.BN(loanAmount);

        let calcCollateralRatio = entryAmount.mul(BASE).div(loanAmount);
        expect(await collateral.collateralRatio(
            entryId,
            bn(0),
            bn(0)
        )).to.eq.BN(calcCollateralRatio);

        let calcDeltaRatio = calcCollateralRatio.sub(balanceRatio);
        expect(await collateral.balanceDeltaRatio(
            entryId,
            bn(0),
            bn(0)
        )).to.eq.BN(calcDeltaRatio);

        let calcCanWithdraw = entryAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            entryId,
            bn(0),
            bn(0)
        )).to.eq.BN(calcCanWithdraw);

        const rateTokens = bn(2).mul(WEI);
        const rateEquivalent = WEI;

        const calcDebtInTokens = rateTokens.mul(loanAmount).div(rateEquivalent);
        expect(await collateral.debtInTokens(
            entryId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcDebtInTokens);

        calcCollateralRatio = entryAmount.mul(BASE).div(calcDebtInTokens);
        expect(await collateral.collateralRatio(
            entryId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio);

        calcDeltaRatio = calcCollateralRatio.sub(balanceRatio);
        expect(await collateral.balanceDeltaRatio(
            entryId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio.sub(balanceRatio));

        calcCanWithdraw = entryAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            entryId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCanWithdraw);
    });
});
