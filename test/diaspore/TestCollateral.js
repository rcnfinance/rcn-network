const Collateral = artifacts.require('Collateral');
const TestModel = artifacts.require('TestModel');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestConverter = artifacts.require('TestConverter');
const TestRateOracle = artifacts.require('TestRateOracle');

const Helper = require('../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn (number) {
    return web3.utils.toBN(number);
}

function min (x, y) {
    return x.lte(y) ? x : y;
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
    assert.isAtMost(min, max);
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
            // Loan
            this.loanId = undefined;
            this.loanAmount = rand(1, 200000000);
            this.loanAmountRcn = this.loanAmount;
            this.expirationDelta = rand(1000, BASE);
            this.durationDelta = rand(1000, BASE);
            // To oracle
            this.oracleData = [];
            // example:
            //  0.82711175222132156792 entry token = 1.23333566612312 loan manager token
            // tokens = 123333566612312000000
            // equivalent = 82711175222132156792
            this.tokens = WEI;
            this.equivalent = WEI;
            // To converter
            this.entryOracle = oracle;
            this.rateFromRCN = WEI;
            this.rateToRCN = WEI;
            // Entry
            this.createFrom = creator;
            this.burnFee = rand(0, BASE);
            this.rewardFee = rand(0, BASE.sub(this.burnFee).sub(bn(1)));
            this.liquidationRatio = rand(BASE, 20000);
            this.balanceRatio = rand(this.liquidationRatio.add(this.burnFee).add(this.rewardFee), 30000);
            this.collateralToken = this.entryOracle.address === Helper.address0x ? rcn : auxToken;
        }

        with (attr, value) {
            this[attr] = value;
            return this;
        }

        async build () {
            if (this.entryOracle.address !== Helper.address0x) {
                await converter.setRate(rcn.address, this.collateralToken.address, this.rateFromRCN);
                await converter.setRate(this.collateralToken.address, rcn.address, this.rateToRCN);
                const equivalent = (this.entryOracleEquivalent === undefined) ? this.rateFromRCN : this.entryOracleEquivalent;
                await this.entryOracle.setEquivalent(equivalent);
                this.collateralOracleEquivalent = equivalent;
            } else {
                this.collateralToken = rcn;
                this.collateralOracleEquivalent = WEI;
            }

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
                    Helper.address0x,    // Callback
                    salt,                // salt
                    expiration,          // Expiration
                    loanData,            // Loan data
                    { from: borrower }   // Creator
                ));
                if (this.oracle.address !== Helper.address0x) {
                    this.oracleData = await this.oracle.encodeRate(this.tokens, this.equivalent);
                    this.loanAmountRcn = await this.currencyToRCN();
                }
                if (this.onlyTakeALoan) {
                    return this.loanId;
                }
            }

            if (this.entryAmount === undefined) {
                const loanAmountInColl = await this.convertToRCN(this.loanAmountRcn);
                const minEntryAmount = divceil(loanAmountInColl.mul(this.balanceRatio.add(BASE)), BASE);
                this.entryAmount = rand(minEntryAmount, 40000000000);
            }

            this.id = await collateral.getEntriesLength();

            await this.collateralToken.setBalance(creator, this.entryAmount);
            await this.collateralToken.approve(collateral.address, this.entryAmount, { from: creator });

            const collateralSnap = await Helper.balanceSnap(this.collateralToken, collateral.address);
            const creatorSnap = await Helper.balanceSnap(this.collateralToken, this.createFrom);

            const Created = await Helper.toEvents(
                collateral.create(
                    this.loanId,                  // debtId
                    this.entryOracle.address,     // entry oracle
                    this.entryAmount,             // amount
                    this.liquidationRatio,        // liquidationRatio
                    this.balanceRatio,            // balanceRatio
                    this.burnFee,                 // burnFee
                    this.rewardFee,               // rewardFee
                    { from: this.createFrom }     // sender
                ),
                'Created'
            );

            // Control collateral creation event
            expect(Created._entryId).to.eq.BN(this.id);
            assert.equal(Created._debtId, this.loanId);
            assert.equal(Created._token, this.collateralToken.address);
            expect(Created._amount).to.eq.BN(this.entryAmount);
            expect(Created._liquidationRatio).to.eq.BN(this.liquidationRatio);
            expect(Created._balanceRatio).to.eq.BN(this.balanceRatio);
            expect(Created._burnFee).to.eq.BN(this.burnFee);
            expect(Created._rewardFee).to.eq.BN(this.rewardFee);

            // Expect entry creation
            const entry = await collateral.entries(this.id);
            expect(entry.liquidationRatio).to.eq.BN(this.liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(this.balanceRatio);
            expect(entry.burnFee).to.eq.BN(this.burnFee);
            expect(entry.rewardFee).to.eq.BN(this.rewardFee);
            assert.equal(entry.token, this.collateralToken.address);
            assert.equal(entry.debtId, this.loanId);
            expect(entry.amount).to.eq.BN(this.entryAmount);

            // Owner and balance of collateral
            await creatorSnap.requireDecrease(this.entryAmount);
            await collateralSnap.requireIncrease(this.entryAmount);
            assert.equal(await collateral.ownerOf(this.id), creator);

            return this;
        }

        totalFee () {
            return this.burnFee.add(this.rewardFee);
        }

        toRewardFee (amount, ceil = true) {
            if (ceil) {
                return divceil(amount.mul(BASE.add(this.rewardFee)), BASE).sub(amount);
            } else {
                return amount.mul(BASE.add(this.rewardFee)).div(BASE).sub(amount);
            }
        }

        toBurnFee (amount, ceil = true) {
            if (ceil) {
                return divceil(amount.mul(BASE.add(this.burnFee)), BASE).sub(amount);
            } else {
                return amount.mul(BASE.add(this.burnFee)).div(BASE).sub(amount);
            }
        }

        withFee (amount, ceil = true) {
            return this.toRewardFee(amount, ceil).add(this.toBurnFee(amount, ceil)).add(amount);
        }

        removeFee (amount, ceil = true) {
            return amount.sub(this.toRewardFee(amount, ceil).add(this.toBurnFee(amount, ceil)));
        }

        async currencyToRCN (amount = this.loanAmount, ceil = true) {
            if (this.oracle.address !== Helper.address0x) {
                if (ceil) {
                    return divceil(amount.mul(this.tokens), this.equivalent);
                } else {
                    return amount.mul(this.tokens).div(this.equivalent);
                }
            } else {
                return amount;
            }
        }

        async convertToRCN (amount = this.entryAmount) {
            if (this.entryOracle.address !== Helper.address0x) {
                const sample = await this.entryOracle.readSample.call([]);
                return amount.mul(sample.tokens).div(sample.equivalent);
            } else {
                return amount;
            }
        }

        async convertFromRCN (amountRCN) {
            if (this.entryOracle.address !== Helper.address0x) {
                const sample = await this.entryOracle.readSample.call([]);
                return amountRCN.mul(sample.equivalent).div(sample.tokens);
            } else {
                return amountRCN;
            }
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
        expect(Deposited._entryId).to.eq.BN(id);
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
        expect(Withdrawed._entryId).to.eq.BN(id);
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

    async function lend (entry, expectLoanAmount) {
        const lenderSnap = await Helper.balanceSnap(rcn, lender);

        await rcn.setBalance(lender, entry.loanAmountRcn);
        await rcn.approve(loanManager.address, entry.loanAmountRcn, { from: lender });

        await loanManager.lend(
            entry.loanId,               // Loan ID
            entry.oracleData,           // Oracle data
            collateral.address,         // Collateral cosigner address
            bn(0),                      // Collateral cosigner cost
            Helper.toBytes32(entry.id), // Collateral ID reference
            [],                         // Callback data
            { from: lender }
        );

        if (expectLoanAmount !== undefined) {
            assert.isTrue(expectLoanAmount.gt(entry.loanAmount), 'The new amount should be greater');
            await model.addDebt(entry.loanId, expectLoanAmount.sub(entry.loanAmount), { from: owner });
            entry.loanAmount = entry.loanAmount.add(expectLoanAmount.sub(entry.loanAmount));
            entry.loanAmountRcn = await entry.currencyToRCN();
        }

        // TODO Check entry status change
        await lenderSnap.restore();
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
        rcn = await TestToken.new({ from: owner });
        auxToken = await TestToken.new({ from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        await oracle.setToken(auxToken.address, { from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        collateral = await Collateral.new(loanManager.address, { from: owner });
        await collateral.setConverter(converter.address, { from: owner });
        await collateral.setMaxSpreadRatio(auxToken.address, bn(9000), { from: owner });
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
    it('Function liquidationDeltaRatio, balanceDeltaRatio', async function () {
        const entry = await new EntryBuilder()
            .with('rateFromRCN', WEI)
            .with('rateToRCN', WEI)
            .build();
        await lend(entry);

        const collateralRatio = await collateral.collateralRatio(
            entry.loanAmount, // debtInToken
            await entry.convertToRCN()
        );

        expect(await collateral.deltaCollateralRatio(
            entry.liquidationRatio,
            entry.loanAmount,
            await entry.convertToRCN()
        )).to.eq.BN(collateralRatio.sub(entry.liquidationRatio));

        expect(await collateral.deltaCollateralRatio(
            entry.balanceRatio,
            entry.loanAmount,
            await entry.convertToRCN()
        )).to.eq.BN(collateralRatio.sub(entry.balanceRatio));
    });
    it('Function collateralRatio', async function () {
        const entry = await new EntryBuilder()
            .with('rateFromRCN', WEI)
            .with('rateToRCN', WEI)
            .build();
        await lend(entry);

        expect(await collateral.collateralRatio(
            0,        // debtInToken
            await entry.convertToRCN()
        )).to.eq.BN(0);

        const calcCollateralRatio = entry.entryAmount.mul(BASE).div(entry.loanAmount);

        expect(await collateral.collateralRatio(
            entry.loanAmount,  // debtInToken
            await entry.convertToRCN()
        )).to.eq.BN(calcCollateralRatio);
    });
    describe('Function canWithdraw', async function () {
        it('Function canWithdraw', async function () {
            const entry = await new EntryBuilder()
                .with('rateFromRCN', WEI)
                .with('rateToRCN', WEI)
                .build();
            await lend(entry);
            const collateralInToken = await entry.convertToRCN();

            expect(await collateral.canWithdraw(
                entry.id,         // entryId,
                0,                // debtInToken
                collateralInToken // collateralInToken
            )).to.eq.BN(entry.entryAmount);

            expect(await collateral.canWithdraw(
                entry.id,          // entryId,
                collateralInToken, // debtInToken
                0                  // collateralInToken
            )).to.eq.BN(entry.entryAmount);

            const collateralRatio = await collateral.collateralRatio(
                entry.loanAmount, // debtInToken
                collateralInToken // collateralInToken
            );
            const balanceDeltaRatio = await collateral.deltaCollateralRatio(
                entry.balanceRatio, // ratio
                entry.loanAmount,   // debtInToken
                collateralInToken   // collateralInToken
            );
            const calcCanWithdraw = entry.entryAmount.mul(balanceDeltaRatio).div(collateralRatio);

            expect(await collateral.canWithdraw(
                entry.id,         // entryId,
                entry.loanAmount, // debtInToken
                entry.entryAmount // collateralInToken
            )).to.eq.BN(calcCanWithdraw);
        });
    });
    describe('Functions onlyOwner', async function () {
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
        it('Try set converter without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => collateral.setConverter(
                    converter.address,
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });
        it('Try set max spread ratio without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => collateral.setMaxSpreadRatio(
                    rcn.address,
                    1,
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });
    });
    describe('Constructor', function () {
        it('Check the loanManager and loanManagerToken', async function () {
            const collateral = await Collateral.new(loanManager.address, { from: owner });

            assert.equal(await collateral.loanManager(), loanManager.address);
            assert.equal(await collateral.loanManagerToken(), await loanManager.token());
            expect(await collateral.getEntriesLength()).to.eq.BN(bn(1));
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
        it('Should create a new collateral in loanManagerToken as token', async function () {
            await new EntryBuilder()
                .with('entryOracle', { address: Helper.address0x })
                .build();
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
                    oracle.address,   // entry oracle
                    1,                // amount
                    15000,            // liquidationRatio
                    20000,            // balanceRatio
                    0,                // burnFee
                    0,                // rewardFee
                    { from: creator }
                ),
                'Error pulling tokens'
            );
        });
    });
    describe('Function requestCosign', function () {
        it('Try lend a debt with low collateral ratio', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(500))
                .with('entryAmount', bn(999))
                .with('liquidationRatio', bn(10001))
                .with('balanceRatio', bn(20000))
                .build();

            await rcn.setBalance(lender, entry.loanAmountRcn);
            await rcn.approve(loanManager.address, entry.loanAmountRcn, { from: lender });

            await Helper.tryCatchRevert(
                () => loanManager.lend(
                    entry.loanId,               // Loan ID
                    entry.oracleData,           // Oracle data
                    collateral.address,         // Collateral cosigner address
                    0,                          // Collateral cosigner cost
                    Helper.toBytes32(entry.id), // Collateral ID reference
                    [],                         // Callback data
                    { from: lender }
                ),
                'The entry its not collateralized'
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
                'Don\'t have collateral to withdraw'
            );

            await collateralSnap.requireConstant();

            await Helper.tryCatchRevert(
                () => withdraw(
                    entry.id,
                    creator,
                    bn(1),
                    creator
                ),
                'Don\'t have collateral to withdraw'
            );

            await collateralSnap.requireConstant();
        });
        it('Should withdraw tokens of an cosigned entry', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(1))
                .with('entryAmount', bn(100))
                .build();

            await lend(entry);

            await withdraw(
                entry.id,
                creator,
                bn(1),
                creator
            );
        });
        it('Try withdraw an cosigned entry without having collateral balance', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(1000))
                .with('entryAmount', bn(2000))
                .with('liquidationRatio', bn(10001))
                .with('balanceRatio', bn(20000))
                .build();

            await lend(entry);

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
        it('Try withdraw an cosigned entry with collateral ratio less than balance ratio', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(1000))
                .with('entryAmount', bn(2000))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
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
                .with('loanAmount', bn(1000))
                .with('entryAmount', bn(2000))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address);

            await Helper.tryCatchRevert(
                () => withdraw(
                    entry.id,
                    lender,
                    bn(1),
                    lender
                ),
                'msg.sender Not authorized'
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
            expect(Redeemed._entryId).to.eq.BN(entry.id);

            // Check if collateral entry was deleted
            await requireDeleted(entry.id, entry.loanId);

            // Validate balances and ownership
            await collateralSnap.requireDecrease(entry.entryAmount);
            await creatorSnap.requireIncrease(entry.entryAmount);
            assert.equal(await collateral.ownerOf(entry.id), creator);
        });
        it('Should redeem an entry, paid with collateral', async function () {
            // Create collateral and take snap
            const initialCollateralSnap = await Helper.balanceSnap(auxToken, collateral.address);

            const entry = await new EntryBuilder()
                .with('entryAmount', bn(5000))
                .with('loanAmount', bn(500))
                .with('durationDelta', bn(500))
                .build();

            await lend(entry);

            await rcn.setBalance(converter.address, bn(2).pow(bn(40)));

            // Snaps before claim pay
            let collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const debtSnap = await Helper.balanceSnap(rcn, debtEngine.address, 'debt engine');

            // Pay the debt
            await collateral.payOffDebt(entry.id, [], { from: creator });

            // Require transfer of tokens Collateral -convert-> Loan manager
            await collateralSnap.requireDecrease(entry.loanAmount);
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

            expect(Redeemed._entryId).to.eq.BN(entry.id);

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
                'msg.sender Not authorized'
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

            expect(EmergencyRedeemed._entryId).to.eq.BN(entry.id);
            assert.equal(EmergencyRedeemed._to, accounts[7]);

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

            // Assert PayOffDebt event
            // event PayOffDebt(uint256 indexed _entryId, uint256 _closingObligationToken, uint256 _payTokens);
            const PayOffDebt = events[0];
            expect(PayOffDebt._entryId).to.eq.BN(entry.id);
            expect(PayOffDebt._closingObligationToken).to.eq.BN(entry.loanAmount);
            expect(PayOffDebt._payTokens).to.eq.BN(entry.loanAmount);

            // Assert convert pay event
            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
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
        it('Should pay off a debt, pay the collateral amount', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(1000))
                .with('loanAmount', bn(100))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            await lend(entry, bn(1100));

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

            // Assert PayOffDebt event
            // event PayOffDebt(uint256 indexed _entryId, uint256 _closingObligationToken, uint256 _payTokens);
            const PayOffDebt = events[0];
            expect(PayOffDebt._entryId).to.eq.BN(entry.id);
            expect(PayOffDebt._closingObligationToken).to.eq.BN(entry.loanAmount);
            expect(PayOffDebt._payTokens).to.eq.BN(entry.entryAmount);

            // Assert convert pay event
            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
            expect(ConvertPay._fromAmount).to.eq.BN(entry.entryAmount);
            expect(ConvertPay._toAmount).to.eq.BN(entry.entryAmount);
            assert.equal(ConvertPay._oracleData, null);

            // Assert modified entry
            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.amount).to.eq.BN(bn(0));

            // Assert token movement
            await collateralSnap.requireDecrease(entry.entryAmount);
            await debtSnap.requireIncrease(entry.entryAmount);

            // Assert paid loan
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '1');
        });
        it('Should pay off a debt with oracle', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(1000))
                .with('loanAmount', bn(100))
                .with('oracle', oracle)
                .with('tokens', bn('123333566612312000000'))
                .with('equivalent', bn('82711175222132156792'))
                .with('rateFromRCN', WEI.div(bn(2)))
                .with('rateToRCN', WEI.mul(bn(2)))
                .build();

            await lend(entry);

            // Read closing obligation
            const closingObligation = await loanManager.getClosingObligation(entry.loanId);
            const closingObligationInRCN = await entry.currencyToRCN(closingObligation);
            const closingObligationInCollateral = divceil(closingObligationInRCN, bn(2));

            const collateralSnap = await Helper.balanceSnap(auxToken, collateral.address, 'collateral');
            const debtSnap = await Helper.balanceSnap(rcn, debtEngine.address, 'debt engine');

            const events = await Helper.toEvents(
                collateral.payOffDebt(
                    entry.id,
                    entry.oracleData,
                    { from: creator }
                ),
                'PayOffDebt',
                'ConvertPay'
            );

            // Assert PayOffDebt event
            // event PayOffDebt(uint256 indexed _entryId, uint256 _closingObligationToken, uint256 _payTokens);
            const PayOffDebt = events[0];
            expect(PayOffDebt._entryId).to.eq.BN(entry.id);
            expect(PayOffDebt._closingObligationToken).to.eq.BN(closingObligationInRCN);
            expect(PayOffDebt._payTokens).to.eq.BN(closingObligationInRCN);

            // Assert convert pay event
            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
            expect(ConvertPay._fromAmount).to.eq.BN(closingObligationInCollateral);
            expect(ConvertPay._toAmount).to.eq.BN(closingObligationInRCN);
            assert.equal(ConvertPay._oracleData, entry.oracleData);

            // Assert entry
            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.amount).to.eq.BN(entry.entryAmount.sub(closingObligationInCollateral));

            // Check balances
            await collateralSnap.requireDecrease(closingObligationInCollateral);
            await debtSnap.requireIncrease(closingObligationInRCN);

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
                'msg.sender Not authorized'
            );

            await collateralSnap.requireConstant();
            await debtSnap.requireConstant();
        });
    });
    describe('Function claim', function () {
        it('(CancelDebt)Should claim an entry if the loan passed due time', async function () {
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
            await rcn.setBalance(converter.address, entry.loanAmount);

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
            // event CancelDebt(uint256 indexed _entryId, uint256 _obligationInToken, uint256 _payTokens);
            const CancelDebt = events[0];
            expect(CancelDebt._entryId).to.eq.BN(entry.id);
            expect(CancelDebt._obligationInToken).to.eq.BN(entry.loanAmount);
            expect(CancelDebt._payTokens).to.eq.BN(entry.loanAmount);

            // Assert convert pay events
            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
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
        it('(CancelDebt)Should claim an entry and pay the loan with oracle', async function () {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(6542))
                .with('loanAmount', bn(1000))
                .with('oracle', oracle)
                .with('tokens', bn('123333566612312000000'))
                .with('equivalent', bn('82711175222132156792'))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .with('rateFromRCN', WEI.div(bn(2)))
                .with('rateToRCN', WEI.mul(bn(2)))
                .build();

            await lend(entry);

            await Helper.increaseTime(entry.durationDelta);

            const closingObligation = await loanManager.getClosingObligation(entry.loanId);
            const closingObligationInRCN = divceil(closingObligation.mul(entry.tokens), entry.equivalent);
            await rcn.setBalance(converter.address, closingObligationInRCN);

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

            // Assert cancel events
            // event CancelDebt(uint256 indexed _entryId, uint256 _obligationInToken, uint256 _payTokens);
            const CancelDebt = events[0];
            expect(CancelDebt._entryId).to.eq.BN(entry.id);
            expect(CancelDebt._obligationInToken).to.eq.BN(entry.loanAmountRcn);
            expect(CancelDebt._payTokens).to.eq.BN(entry.loanAmountRcn);

            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
            expect(ConvertPay._fromAmount).to.eq.BN(await entry.convertFromRCN(closingObligationInRCN));
            expect(ConvertPay._toAmount).to.eq.BN(closingObligationInRCN);
            assert.equal(ConvertPay._oracleData, entry.oracleData);

            const entryStorage = await collateral.entries(entry.id);
            expect(entryStorage.liquidationRatio).to.eq.BN(entry.liquidationRatio);
            expect(entryStorage.balanceRatio).to.eq.BN(entry.balanceRatio);
            expect(entryStorage.burnFee).to.eq.BN(entry.burnFee);
            expect(entryStorage.rewardFee).to.eq.BN(entry.rewardFee);
            assert.equal(entryStorage.token, auxToken.address);
            assert.equal(entryStorage.debtId, entry.loanId);
            expect(entryStorage.amount).to.eq.BN(entry.entryAmount.sub(await entry.convertFromRCN(closingObligationInRCN)));

            expect(await collateral.debtToEntry(entry.loanId)).to.eq.BN(entry.id);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(await entry.convertFromRCN(closingObligationInRCN)));
            assert.equal(await collateral.ownerOf(entry.id), creator);

            expect(await model.getClosingObligation(entry.loanId)).to.eq.BN(0);
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '2');
        });
        it('(CollateralBalance)Should claim an entry and equilibrate the entry', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(100))
                .with('entryAmount', bn(1100))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            await lend(entry, bn(1000));

            const equilibrateAmount = bn(900);

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

            // CollateralBalance emits the result of the collateral balancing
            // tokenPayRequired is the ideal amount to sent tokens
            // event CollateralBalance(uint256 indexed _entryId, uint256 _tokenRequiredToTryBalance, uint256 _payTokens);
            const CollateralBalance = events[0];
            expect(CollateralBalance._entryId).to.eq.BN(entry.id);
            expect(CollateralBalance._tokenRequiredToTryBalance).to.eq.BN(equilibrateAmount);
            expect(CollateralBalance._payTokens).to.eq.BN(equilibrateAmount);

            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
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
                await model.getClosingObligation(entry.loanId),
                await entry.convertToRCN()
            )).gte(entry.liquidationRatio));
        });
        it('(CollateralBalance)Should claim an entry and equilibrate the entry, with a debt with oracle', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(10000))
                .with('entryAmount', bn(11000000))
                .with('oracle', oracle)
                .with('tokens', bn('90000000000000000000'))
                .with('equivalent', bn('100000000000000000000'))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            await lend(entry, bn(10000000));

            const equilibrateAmountInToken = bn(7000327);
            const equilibrateAmountInCollateral = equilibrateAmountInToken;

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

            // CollateralBalance emits the result of the collateral balancing
            // tokenPayRequired is the ideal amount to sent tokens
            // event CollateralBalance(uint256 indexed _entryId, uint256 _tokenRequiredToTryBalance, uint256 _payTokens);
            const CollateralBalance = events[0];
            expect(CollateralBalance._entryId).to.eq.BN(entry.id);
            expect(CollateralBalance._tokenRequiredToTryBalance).to.eq.BN(equilibrateAmountInToken);
            expect(CollateralBalance._payTokens).to.eq.BN(equilibrateAmountInToken);

            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
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
                await model.getClosingObligation(entry.loanId),
                await entry.convertToRCN()
            )).gte(entry.liquidationRatio));
        });
        it('(CollateralBalance)Should claim an entry and equilibrate the entry, with a debt with oracle and fee', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(1000))
                .with('entryAmount', bn(20000000))
                .with('oracle', oracle)
                .with('tokens', bn('90000000000000000000'))
                .with('equivalent', bn('100000000000000000000'))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(500))
                .with('rewardFee', bn(500))
                .with('rateFromRCN', WEI.mul(bn(2)))
                .with('rateToRCN', WEI.div(bn(2)))
                .build();

            await lend(entry, bn(10000000));

            const equilibrateAmountInToken = bn(8889088);
            const equilibrateAmountInCollateral = await entry.convertFromRCN(equilibrateAmountInToken);

            await rcn.setBalance(converter.address, equilibrateAmountInCollateral);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);
            const prevBurnBal = await auxToken.balanceOf(Helper.address0x);

            const prevBurnBalRCN = await rcn.balanceOf(Helper.address0x);
            const prevCreatorBalRCN = await rcn.balanceOf(creator);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    entry.loanId,
                    entry.oracleData,
                    { from: creator }
                ),
                'CollateralBalance',
                'ConvertPay',
                'TakeFee'
            );

            // CollateralBalance emits the result of the collateral balancing
            // tokenPayRequired is the ideal amount to sent tokens
            // event CollateralBalance(uint256 indexed _entryId, uint256 _tokenRequiredToTryBalance, uint256 _payTokens);
            const CollateralBalance = events[0];
            expect(
                CollateralBalance._entryId,
                'Should emit the collateral ID'
            ).to.eq.BN(entry.id);

            expect(
                CollateralBalance._tokenRequiredToTryBalance,
                'Should emit the ideal amount to equilibrate'
            ).to.eq.BN(equilibrateAmountInToken);

            expect(
                CollateralBalance._payTokens
            ).to.eq.BN(equilibrateAmountInToken);

            // ConvertPay emits the result of the change operation
            // _fromAmount is the amount in collateral sold
            // _toAmount is the amount of tokens bought
            // _oracleData is used to reconstruct the operation
            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
            expect(
                ConvertPay._fromAmount,
                'Amount sold to equilibrate and pay fees'
            ).to.eq.BN(entry.withFee(await entry.convertFromRCN(equilibrateAmountInToken), false));

            expect(
                ConvertPay._toAmount,
                'Amount bought to equilbirate and pay fees'
            ).to.eq.BN(entry.withFee(equilibrateAmountInToken, false));

            assert.equal(ConvertPay._oracleData, entry.oracleData);

            const rewarded = entry.toRewardFee(equilibrateAmountInToken, false);
            const burned = entry.toBurnFee(equilibrateAmountInToken, false);

            const TakeFee = events[2];
            expect(TakeFee._entryId).to.eq.BN(entry.id);
            expect(TakeFee._burned).to.eq.BN(burned);
            expect(TakeFee._rewardTo).to.eq.BN(creator);
            expect(TakeFee._rewarded).to.eq.BN(rewarded);

            const storageEntry = await collateral.entries(entry.id);
            expect(
                storageEntry.amount
            ).to.eq.BN(
                entry.entryAmount.sub(entry.withFee(await entry.convertFromRCN(equilibrateAmountInToken), false))
            );

            // TODO: re-do test
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(entry.withFee(await entry.convertFromRCN(equilibrateAmountInToken), false)));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal);
            expect(await auxToken.balanceOf(Helper.address0x)).to.eq.BN(prevBurnBal);

            expect(await rcn.balanceOf(Helper.address0x)).to.eq.BN(prevBurnBalRCN.add(burned));
            expect(await rcn.balanceOf(creator)).to.eq.BN(prevCreatorBalRCN.add(rewarded));

            assert.equal(await collateral.ownerOf(entry.id), creator);

            expect(await collateral.debtToEntry(entry.loanId)).to.eq.BN(entry.id);

            const payAmount = equilibrateAmountInToken.mul(entry.equivalent).div(entry.tokens);
            expect(await model.getClosingObligation(entry.loanId)).to.eq.BN(entry.loanAmount.sub(payAmount));
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '1');

            assert.isTrue((await collateral.collateralRatio(
                await model.getClosingObligation(entry.loanId),
                await entry.convertToRCN()
            )).gte(entry.liquidationRatio));
        });
        it('(CancelDebt)Should claim an entry and pay the loan, with a debt with oracle and fee', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(1000))
                .with('entryAmount', bn(110000000))
                .with('oracle', oracle)
                .with('tokens', bn('90000000000000000000'))
                .with('equivalent', bn('100000000000000000000'))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(334))
                .with('rewardFee', bn(666))
                .with('rateFromRCN', WEI.div(bn(2)))
                .with('rateToRCN', WEI.mul(bn(2)))
                .build();

            await lend(entry, bn(20000000));

            const closingObligation = await loanManager.getClosingObligation(entry.loanId);
            const closingObligationInRCN = await entry.currencyToRCN(closingObligation);
            const closingObligationInCollateral = await entry.convertFromRCN(closingObligationInRCN);

            await rcn.setBalance(converter.address, entry.withFee(closingObligationInRCN));

            const burned = entry.toBurnFee(closingObligationInRCN);
            const rewarded = entry.toRewardFee(closingObligationInRCN);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);
            const prevBurnBal = await auxToken.balanceOf(Helper.address0x);

            const prevBurnBalRCN = await rcn.balanceOf(Helper.address0x);
            const prevCreatorBalRCN = await rcn.balanceOf(creator);

            await Helper.increaseTime(entry.durationDelta);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    entry.loanId,
                    entry.oracleData,
                    { from: creator }
                ),
                'CancelDebt',
                'ConvertPay',
                'TakeFee'
            );

            // Assert cancel events
            // event CancelDebt(uint256 indexed _entryId, uint256 _obligationInToken, uint256 _payTokens);
            const CancelDebt = events[0];
            expect(CancelDebt._entryId).to.eq.BN(entry.id);
            expect(CancelDebt._obligationInToken).to.eq.BN(entry.loanAmountRcn);
            expect(CancelDebt._payTokens).to.eq.BN(entry.loanAmountRcn);

            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
            expect(ConvertPay._fromAmount).to.eq.BN(entry.withFee(closingObligationInCollateral));
            expect(ConvertPay._toAmount).to.eq.BN(entry.withFee(closingObligationInRCN));
            assert.equal(ConvertPay._oracleData, entry.oracleData);

            const TakeFee = events[2];
            expect(TakeFee._entryId).to.eq.BN(entry.id);
            expect(TakeFee._burned).to.eq.BN(burned);
            expect(TakeFee._rewardTo).to.eq.BN(creator);
            expect(TakeFee._rewarded).to.eq.BN(rewarded);

            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.amount).to.eq.BN(entry.entryAmount.sub(entry.withFee(closingObligationInCollateral)));

            expect(await collateral.debtToEntry(entry.loanId)).to.eq.BN(entry.id);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(entry.withFee(closingObligationInCollateral)));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal);
            expect(await auxToken.balanceOf(Helper.address0x)).to.eq.BN(prevBurnBal);

            expect(await rcn.balanceOf(Helper.address0x)).to.eq.BN(prevBurnBalRCN.add(burned));
            expect(await rcn.balanceOf(creator)).to.eq.BN(prevCreatorBalRCN.add(rewarded));

            assert.equal(await collateral.ownerOf(entry.id), creator);

            expect(await model.getClosingObligation(entry.loanId)).to.eq.BN(0);
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '2');
        });
        it('(CollateralBalance)Should claim an entry and pay all collateral token, with a debt with oracle and fee', async function () {
            const entry = await new EntryBuilder()
                .with('loanAmount', bn(10000))
                .with('entryAmount', bn(4000000))
                .with('oracle', oracle)
                .with('tokens', bn('90000000000000000000'))
                .with('equivalent', bn('100000000000000000000'))
                .with('liquidationRatio', bn(15000))
                .with('balanceRatio', bn(20000))
                .with('burnFee', bn(654))
                .with('rewardFee', bn(346))
                .with('rateFromRCN', WEI.div(bn(2)))
                .with('rateToRCN', WEI.mul(bn(2)))
                .build();

            await lend(entry, bn(10000000));
            const rcnCanPay = await entry.convertToRCN(entry.entryAmount);

            const burned = entry.toBurnFee(rcnCanPay);
            const rewarded = entry.toRewardFee(rcnCanPay);
            const totalFee = burned.add(rewarded);

            await rcn.setBalance(converter.address, entry.withFee(rcnCanPay));

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);
            const prevBurnBal = await auxToken.balanceOf(Helper.address0x);

            const prevBurnBalRCN = await rcn.balanceOf(Helper.address0x);
            const prevCreatorBalRCN = await rcn.balanceOf(creator);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    entry.loanId,
                    entry.oracleData,
                    { from: creator }
                ),
                'CollateralBalance',
                'ConvertPay',
                'TakeFee'
            );

            // CollateralBalance emits the result of the collateral balancing
            // tokenPayRequired is the ideal amount to sent tokens
            // event CollateralBalance(uint256 indexed _entryId, uint256 _tokenRequiredToTryBalance, uint256 _payTokens);
            const CollateralBalance = events[0];
            expect(CollateralBalance._entryId).to.eq.BN(entry.id);
            expect(CollateralBalance._tokenRequiredToTryBalance).to.eq.BN(await entry.convertToRCN());
            expect(CollateralBalance._payTokens).to.eq.BN(entry.removeFee(rcnCanPay));

            const ConvertPay = events[1];
            expect(ConvertPay._entryId).to.eq.BN(entry.id);
            expect(ConvertPay._fromAmount).to.eq.BN(entry.entryAmount);
            expect(ConvertPay._toAmount).to.eq.BN(rcnCanPay);
            assert.equal(ConvertPay._oracleData, entry.oracleData);

            const TakeFee = events[2];
            expect(TakeFee._entryId).to.eq.BN(entry.id);
            expect(TakeFee._burned).to.eq.BN(burned);
            expect(TakeFee._rewardTo).to.eq.BN(creator);
            expect(TakeFee._rewarded).to.eq.BN(rewarded);

            const storageEntry = await collateral.entries(entry.id);
            expect(storageEntry.amount).to.eq.BN(bn(0));

            expect(await collateral.debtToEntry(entry.loanId)).to.eq.BN(entry.id);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(entry.entryAmount));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal);
            expect(await auxToken.balanceOf(Helper.address0x)).to.eq.BN(prevBurnBal);

            expect(await rcn.balanceOf(Helper.address0x)).to.eq.BN(prevBurnBalRCN.add(burned));
            expect(await rcn.balanceOf(creator)).to.eq.BN(prevCreatorBalRCN.add(rewarded));

            assert.equal(await collateral.ownerOf(entry.id), creator);

            const closingObligation = await loanManager.getClosingObligation(entry.loanId);
            const closingObligationInRCN = await entry.currencyToRCN(closingObligation, false);
            expect(closingObligationInRCN).to.eq.BN(entry.loanAmountRcn.sub(rcnCanPay.sub(totalFee)));
            assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '1');
        });
        it('Try claim an entry with invalid loan', async function () {
            const loan = await new EntryBuilder()
                .with('onlyTakeALoan', true)
                .build();

            await Helper.tryCatchRevert(
                () => collateral.claim(
                    loanManager.address,
                    loan,
                    [],
                    { from: owner }
                ),
                'The loan dont lent'
            );
        });
    });
    describe('Front-running in _convertPay function', function () {
        it('With 0 spread', frontRunningTest(
            bn(0), // maxSpreadRatio
            WEI,   // rate
            false  // revert
        ));
        it('With 0 spread, low rate', frontRunningTest(
            bn(0),          // maxSpreadRatio
            WEI.div(bn(2)), // rate
            false           // revert
        ));
        it('With 0 spread, high rate', frontRunningTest(
            bn(0),          // maxSpreadRatio
            WEI.mul(bn(2)), // rate
            false           // revert
        ));
        it('With 100% spread', frontRunningTest(
            BASE, // maxSpreadRatio
            WEI,  // rate
            false // revert
        ));
        it('With 100% spread, high rate', frontRunningTest(
            BASE,           // maxSpreadRatio
            WEI.mul(bn(2)), // rate
            false           // revert
        ));
        it('With 10% spread', frontRunningTest(
            bn(9000), // maxSpreadRatio
            WEI,      // rate
            false     // revert
        ));
        it('With 10% spread, high rate', frontRunningTest(
            bn(9000),       // maxSpreadRatio
            WEI.mul(bn(2)), // rate
            false           // revert
        ));
        it('With -10% spread, low rate', frontRunningTest(
            bn(11000),                   // maxSpreadRatio
            WEI.mul(bn(11)).div(bn(10)), // rate
            false                        // revert
        ));

        // Reverts, front running
        it('With 100% spread, low rate', frontRunningTest(
            BASE,               // maxSpreadRatio
            WEI.div(bn(2)) // rate
        ));
        it('With 9.99% spread, low rate', frontRunningTest(
            bn(9001),                   // maxSpreadRatio
            WEI.mul(bn(9)).div(bn(10)), // rate
        ));
        it('With -10% spread, high rate', frontRunningTest(
            bn(11000),                    // maxSpreadRatio
            WEI.mul(bn(105)).div(bn(100)) // rate
        ));

        function frontRunningTest (
            maxSpreadRatio,
            rate,
            revert = true
        ) {
            return async () => {
                // With change oracle rate(RCNequivalent)
                await _frontRunningTest(maxSpreadRatio, rate, revert);
                // With change converter rate(setRate)
                await _frontRunningTest(maxSpreadRatio, rate, revert, true);
            };
        }

        async function _frontRunningTest (maxSpreadRatio, rate, revert, oracleRate = false) {
            const entry = await new EntryBuilder()
                .with('entryAmount', bn(1000000000))
                .with('loanAmount', bn(10000))
                .with('burnFee', bn(0))
                .with('rewardFee', bn(0))
                .build();

            await lend(entry);

            const prevMaxSpreadRatio = await collateral.tokenToMaxSpreadRatio(auxToken.address);
            await collateral.setMaxSpreadRatio(auxToken.address, bn(maxSpreadRatio), { from: owner });

            if (oracleRate) {
                const invRate = WEI.mul(WEI).div(rate);
                await converter.setRate(rcn.address, entry.collateralToken.address, invRate);
            } else {
                await oracle.setEquivalent(rate);
            }

            await rcn.setBalance(converter.address, bn(2).pow(bn('40')));

            const payOffDebt = () => collateral.payOffDebt(
                entry.id,
                [],
                { from: creator }
            );
            if (revert) {
                await Helper.tryCatchRevert(
                    payOffDebt,
                    'converter return below minimun required'
                );
            } else {
                await payOffDebt();
            }

            await collateral.setMaxSpreadRatio(auxToken.address, prevMaxSpreadRatio, { from: owner });
        }
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
        ];

        it('Test 0: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 12000, 15000, 1000, 1100, 1));
        it('Test 1: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 1000, 1100, 1));
        it('Test 2: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 9000000, 11000000, 1));
        it('Test 3: ' + ratesMsg[0] + ', ' + 'Path: ' + paths[1],
            cTest(1, 1, 12345, 23456, 300, 200, 1));
        // Debt in Token
        it('Test 4: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 200, 450, 2));
        it('Test 5: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 90000, 100000, 2000, 6000, 0.50));
        it('Test 6: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 200, 201, 2.00));
        it('Test 7: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[1],
            cTest(1, 1, 15000, 20000, 310, 600, 0.50));
        it('Test 8: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 310, 930, 2.00));
        it('Test 9: ' + ratesMsg[1] + ', ' + 'Path: ' + paths[0],
            cTest(1, 1, 15000, 20000, 310, 930, 0.40));
        // Collateral in Token
        it('Test 10: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[0],
            cTest(5, 1, 12345, 15678, 100, 600, 1.00));
        it('Test 11: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[0],
            cTest(2, 7, 16500, 20000, 100, 600, 1.00));
        it('Test 12: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[0],
            cTest(1, 2, 11000, 20000, 100, 600, 1.00));
        it('Test 13: ' + ratesMsg[2] + ', ' + 'Path: ' + paths[1],
            cTest(1, 2, 11000, 20000, 1000, 100, 1.00));

        it('Test 14: ' + ratesMsg[3] + ', ' + 'Path: ' + paths[1],
            cTest(1, 2, 11000, 20000, 1000, 100, 0.50));
        it('Test 15: ' + ratesMsg[3] + ', ' + 'Path: ' + paths[0],
            cTest(1, 4, 11000, 20000, 4000, 1500, 1.50));
        it('Test 16: ' + ratesMsg[3] + ', ' + 'Path: ' + paths[0],
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
                tokens = bn(tokens);
                equivalent = bn(equivalent);
                liquidationRatioLimit = bn(liquidationRatioLimit);
                balanceRatioLimit = bn(balanceRatioLimit);
                debt = bn(debt);
                entryAmount = bn(entryAmount);

                const debtRCN = debt.mul(tokens).div(equivalent);
                const tokenToCollateralRate = bn(Math.round(10000 / collateralToTokenRate).toString()).mul(WEI).div(BASE);

                await converter.setRate(rcn.address, auxToken.address, tokenToCollateralRate);

                collateralToTokenRate = bn(collateralToTokenRate * 10000).mul(WEI).div(BASE);
                await converter.setRate(auxToken.address, rcn.address, collateralToTokenRate);

                const collateralInToken = entryAmount.mul(WEI).div(tokenToCollateralRate);
                const collateralRatio = collateralInToken.mul(BASE).div(debtRCN);
                const liquidationDeltaRatio = collateralRatio.sub(liquidationRatioLimit);
                const balanceDeltaRatio = collateralRatio.sub(balanceRatioLimit);
                const canWithdraw = entryAmount.mul(balanceDeltaRatio).div(collateralRatio);

                async function calcTokenRequiredToTryBalance () {
                    if (liquidationDeltaRatio.lt(bn(0))) {
                        const coll = min(
                            // Collateral require to balance
                            canWithdraw.abs().mul(BASE).div(balanceRatioLimit.sub(BASE)),
                            // Collateral
                            entryAmount
                        );
                        return coll.mul(WEI).div(tokenToCollateralRate);
                    } else {
                        return bn(0);
                    }
                }

                const requiredTokenPay = await calcTokenRequiredToTryBalance();
                const newDebt = debtRCN.sub(requiredTokenPay);
                const newCollateral = entryAmount.sub(requiredTokenPay);
                const newCollateralInToken = newCollateral.mul(WEI).div(tokenToCollateralRate);
                const newCollateralRatio = newDebt.isZero() ? null : divceil(newCollateralInToken.mul(BASE), newDebt);
                const collateralized = newCollateralRatio === null ? true : newCollateralRatio.gte(liquidationRatioLimit) !== -1;

                // ------------------------------------------------------
                const entry = await new EntryBuilder()
                    .with('loanAmount', bn(10))
                    .with('entryAmount', bn(entryAmount))
                    .with('liquidationRatio', bn(liquidationRatioLimit))
                    .with('balanceRatio', bn(balanceRatioLimit))
                    .with('oracle', oracle)
                    .with('tokens', bn(tokens))
                    .with('equivalent', bn(equivalent))
                    .with('burnFee', bn(0))
                    .with('rewardFee', bn(0))
                    .with('rateFromRCN', tokenToCollateralRate)
                    .with('rateToRCN', collateralToTokenRate)
                    .build();

                await lend(entry, bn(debt));

                expect(await entry.convertToRCN()).to.eq.BN(collateralInToken);

                // expect(await collateral.methods['collateralToTokens(address,address,uint256)'].call(
                //     entry.oracle.address,
                //     entry.collateralToken.address,
                //     entryAmount
                // )).to.eq.BN(collateralInToken);

                // expect(await collateral.debtInTokens.call(entry.loanId)).to.eq.BN(debtRCN);

                const _collateralRatio = await collateral.collateralRatio(
                    debtRCN,
                    collateralInToken
                );
                expect(_collateralRatio).to.eq.BN(collateralRatio);

                const _liquidationDeltaRatio = await collateral.deltaCollateralRatio(
                    entry.liquidationRatio,
                    debtRCN,
                    collateralInToken
                );
                expect(_liquidationDeltaRatio).to.eq.BN(liquidationDeltaRatio);

                const _balanceDeltaRatio = await collateral.deltaCollateralRatio(
                    entry.balanceRatio,
                    debtRCN,
                    collateralInToken
                );
                expect(_balanceDeltaRatio).to.eq.BN(balanceDeltaRatio);

                const _canWithdraw = await collateral.canWithdraw(
                    entry.id,         // entryId,
                    debtRCN,          // debtInToken
                    collateralInToken // collateralInToken
                );
                expect(_canWithdraw).to.eq.BN(canWithdraw);

                const _collateralToPay = await collateral.getTokenRequiredToTryBalance.call(
                    entry.id,
                    entry.oracleData
                );

                expect(_collateralToPay).to.eq.BN(requiredTokenPay);

                await auxToken.setBalance(converter.address, bn(0));
                await rcn.setBalance(converter.address, requiredTokenPay);

                await collateral.claim(loanManager.address, entry.loanId, entry.oracleData);

                const _newDebt = await collateral.debtInTokens.call(entry.loanId, entry.oracleData);
                roundCompare(_newDebt, newDebt);

                const _newCollateral = (await collateral.entries(entry.id)).amount;
                roundCompare(_newCollateral, newCollateral);

                let _newCollateralInToken;
                const samples = await entry.oracle.readSample.call([]);
                if (entry.oracle.address === Helper.address0x) {
                    _newCollateralInToken = _newCollateral;
                } else {
                    _newCollateralInToken = _newCollateral.mul(samples[0]).div(samples[1]);
                }

                roundCompare(_newCollateralInToken, newCollateralInToken);

                if (!(newDebt.isZero() && newCollateral.isZero())) {
                    if (newDebt.isZero()) {
                        assert.isNull(newCollateralRatio);
                        assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '2');
                    } else {
                        if (newCollateral.isZero()) {
                            assert.isTrue(newCollateralRatio.isZero());
                            assert.isFalse((await model.getStatus.call(entry.loanId)).toString() === '2');
                        } else {
                            const _newCollateralRatio = await collateral.collateralRatio(
                                _newDebt,
                                _newCollateralInToken
                            );
                            if (!_newCollateralRatio.eq(bn(0))) {
                                assert.equal(_newCollateralRatio.gte(liquidationRatioLimit), collateralized);
                            } else {
                                assert.isTrue(collateralized);
                            }

                            assert.isFalse((await model.getStatus.call(entry.loanId)).toString() === '2');
                            // if haves collateral the newCollateralRatio should be more or equal than ratioLimit
                            if (!_newCollateral.isZero()) {
                                assert.isTrue(newCollateralRatio.gte(liquidationRatioLimit));
                            }
                        }
                    }
                }

                // Fix this
                let _coll;
                if (entry.oracle.address === Helper.address0x) {
                    _coll = _newCollateral;
                } else {
                    const sample = await entry.oracle.readSample.call([]);
                    _coll = _newCollateral.mul(sample[0]).div(sample[1]);
                }

                const _debt = await collateral.debtInTokens.call(
                    entry.loanId,
                    entry.oracleData
                );

                const canPayAllDebt = _coll.gte(_debt);

                // Claim when the loan is in debt
                await Helper.increaseTime(entry.durationDelta);

                const closingObligation = (await model.getObligation(entry.loanId, await Helper.getBlockTime()))[0];
                const closingObligationInRCN = divceil(tokens.mul(closingObligation), equivalent);

                await rcn.setBalance(converter.address, closingObligationInRCN);
                await auxToken.setBalance(converter.address, bn(0));

                if (!(await collateral.entries(entry.id)).amount.eq(bn(0))) {
                    await collateral.claim(loanManager.address, entry.loanId, entry.oracleData);
                }

                const newCollateralAmount = (await collateral.entries(entry.id)).amount;
                if (canPayAllDebt) {
                    assert.isTrue((await model.getStatus.call(entry.loanId)).toString() === '2');
                } else {
                    expect(newCollateralAmount).to.eq.BN(bn(0));
                }
            };
        }
    });
});
