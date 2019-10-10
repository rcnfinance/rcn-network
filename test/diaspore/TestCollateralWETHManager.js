const CollateralWETHManager = artifacts.require('CollateralWETHManager');

const WETH9 = artifacts.require('WETH9');
const Collateral = artifacts.require('Collateral');
const TestModel = artifacts.require('TestModel');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestConverter = artifacts.require('TestConverter');
const TestRateOracle = artifacts.require('TestRateOracle');

const Helper = require('../Helper.js');
const expect = require('chai')
    .use(require('bn-chai')(web3.utils.BN))
    .expect;

function bn (number) {
    return web3.utils.toBN(number);
}

async function getETHBalance (address) {
    return bn(await web3.eth.getBalance(address));
}

async function toETHConsume (tx) {
    const gasUsed = bn(tx.receipt.gasUsed);
    const gasPrice = bn(await web3.eth.getGasPrice());

    return gasUsed.mul(gasPrice);
}

const WEI = bn(10).pow(bn(18));

contract('Test Collateral cosigner Diaspore', function (accounts) {
    const owner = accounts[1];
    const creator = accounts[2];
    const borrower = accounts[3];
    const depositer = accounts[4];

    let rcn;
    let loanManager;
    let debtEngine;
    let model;
    let collateral;
    let converter;
    let oracle;
    let weth9;
    let collWETHManager;

    class EntryBuilder {
        constructor () {
            this.loanAmount = bn(200000000);
            // Entry
            this.createFrom = creator;
            this.burnFee = bn(500);
            this.rewardFee = bn(1000);
            this.liquidationRatio = bn(15000);
            this.balanceRatio = bn(20000);
            this.entryAmount = this.loanAmount.mul(this.balanceRatio);
        }

        with (attr, value) {
            this[attr] = value;
            return this;
        }

        async build () {
            // Set oracle
            await oracle.setEquivalent(WEI);
            // Set converter
            await converter.setRate(rcn.address, weth9.address, WEI);
            await converter.setRate(weth9.address, rcn.address, WEI);
            // Loan parametres
            const salt = bn(web3.utils.randomHex(32));
            const now = bn(await Helper.getBlockTime());
            const expiration = now.add(bn(100000));
            const duration = now.add(bn(100000));
            const loanData = await model.encodeData(this.loanAmount, duration);

            this.loanId = await getId(loanManager.requestLoan(
                loanData,          // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                Helper.address0x,  // Callback
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            if (this.onlyTakeALoan) {
                return this;
            }

            this.id = await collateral.getEntriesLength();

            await collWETHManager.create(
                this.loanId,           // debtId
                oracle.address,         // entry oracle
                this.liquidationRatio, // liquidationRatio
                this.balanceRatio,     // balanceRatio
                this.burnFee,          // burnFee
                this.rewardFee,        // rewardFee
                {
                    from: this.createFrom,
                    value: this.entryAmount,
                }
            );

            return this;
        }
    }

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Requested');
        assert.ok(event);
        return event.args._id;
    }

    before('Create contracts', async function () {
        converter = await TestConverter.new({ from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        rcn = await TestToken.new({ from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        collateral = await Collateral.new(loanManager.address, { from: owner });
        await collateral.setConverter(converter.address, { from: owner });

        weth9 = await WETH9.new({ from: owner });
        collWETHManager = await CollateralWETHManager.new(weth9.address, collateral.address, { from: owner });

        await collateral.setMaxSpreadRatio(weth9.address, 1000, { from: owner });
    });

    describe('Function setWeth', async function () {
        it('Set a new weth contract', async function () {
            const SetWeth = await Helper.toEvents(
                collWETHManager.setWeth(
                    owner,
                    { from: owner }
                ),
                'SetWeth'
            );

            assert.equal(SetWeth._weth, owner);
            assert.equal(await collWETHManager.weth(), owner);

            await collWETHManager.setWeth(weth9.address, { from: owner });
        });
    });
    describe('Function setCollateral', async function () {
        it('Set a new collateral contract', async function () {
            const SetCollateral = await Helper.toEvents(
                collWETHManager.setCollateral(
                    owner,
                    { from: owner }
                ),
                'SetCollateral'
            );

            assert.equal(SetCollateral._collateral, owner);
            assert.equal(await collWETHManager.collateral(), owner);

            await collWETHManager.setCollateral(collateral.address, { from: owner });
        });
    });
    describe('Functions onlyOwner', async function () {
        it('Try set a new WETH without being the owner', async function () {
            await Helper.tryCatchRevert(
                () => collWETHManager.setWeth(
                    Helper.address0x,
                    { from: borrower }
                ),
                'The owner should be the sender'
            );
        });
        it('Try set a new Collateral without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => collWETHManager.setCollateral(
                    Helper.address0x,
                    { from: borrower }
                ),
                'The owner should be the sender'
            );
        });
    });
    describe('Modifier isTheOwner', async function () {
        it('Try withdraw balance without being the owner of the entry', async function () {
            const entry = await new EntryBuilder()
                .build();

            await Helper.tryCatchRevert(
                () => collWETHManager.withdraw(
                    entry.id,
                    Helper.address0x,
                    1,
                    [],
                    { from: borrower }
                ),
                'msg.sender Not authorized'
            );
        });
        it('Try redeem an entry without being the owner', async function () {
            const entry = await new EntryBuilder()
                .build();

            await Helper.tryCatchRevert(
                () => collWETHManager.redeem(
                    entry.id,
                    Helper.address0x,
                    { from: borrower }
                ),
                'msg.sender Not authorized'
            );
        });
    });
    describe('Function create', async function () {
        it('Create a new collateral with WETH', async function () {
            const entry = await new EntryBuilder()
                .with('onlyTakeALoan', true)
                .build();
            const entryId = await collateral.getEntriesLength();
            const prevETHBalWETH = await getETHBalance(weth9.address);
            const prevETHBalCreator = await getETHBalance(entry.createFrom);

            const tx = await collWETHManager.create(
                entry.loanId,           // debtId
                oracle.address,         // entry oracle
                entry.liquidationRatio, // liquidationRatio
                entry.balanceRatio,     // balanceRatio
                entry.burnFee,          // burnFee
                entry.rewardFee,        // rewardFee
                {
                    from: entry.createFrom,
                    value: entry.entryAmount,
                }
            );

            const Created = await Helper.toEvents(tx, 'Created');
            // Check event
            expect(Created._entryId).to.eq.BN(entryId);
            assert.equal(Created._sender, entry.createFrom);
            expect(Created._amount).to.eq.BN(entry.entryAmount);
            // Check ownership
            assert.equal(await collateral.ownerOf(entryId), entry.createFrom);
            // Check balance
            expect(await getETHBalance(collWETHManager.address)).to.eq.BN(0);
            expect(await getETHBalance(weth9.address)).to.eq.BN(prevETHBalWETH.add(entry.entryAmount));
            expect(await getETHBalance(entry.createFrom)).to.eq.BN(
                prevETHBalCreator.sub(entry.entryAmount).sub(await toETHConsume(tx))
            );
        });
    });
    describe('Function deposit', async function () {
        it('Deposit WETH in an entry', async function () {
            const entry = await new EntryBuilder()
                .build();
            const amount = bn(1000000);
            const prevETHBalWETH = await getETHBalance(weth9.address);
            const prevETHBalDepositer = await getETHBalance(depositer);

            const tx = await collWETHManager.deposit(
                entry.id, // entryId
                {
                    from: depositer,
                    value: amount,
                }
            );
            const Deposited = await Helper.toEvents(tx, 'Deposited');

            // Check event
            expect(Deposited._entryId).to.eq.BN(entry.id);
            assert.equal(Deposited._sender, depositer);
            expect(Deposited._amount).to.eq.BN(amount);
            // Check balance
            expect(await getETHBalance(collWETHManager.address)).to.eq.BN(0);
            expect(await getETHBalance(weth9.address)).to.eq.BN(prevETHBalWETH.add(amount));
            expect(await getETHBalance(depositer)).to.eq.BN(
                prevETHBalDepositer.sub(amount).sub(await toETHConsume(tx))
            );
        });
    });
    describe('Function withdraw', async function () {
        it('Withdraw WETH of an entry', async function () {
            const entry = await new EntryBuilder()
                .build();
            const amount = bn(1000000);

            await collateral.approve(collWETHManager.address, entry.id, { from: entry.createFrom });

            const prevETHBalWETH = await getETHBalance(weth9.address);
            const prevETHBalBorrower = await getETHBalance(borrower);
            const prevETHBalCreator = await getETHBalance(entry.createFrom);

            const tx = await collWETHManager.withdraw(
                entry.id,
                borrower,
                amount,
                [],
                { from: entry.createFrom }
            );
            const Withdrawed = await Helper.toEvents(tx, 'Withdrawed');

            // Check event
            expect(Withdrawed._entryId).to.eq.BN(entry.id);
            assert.equal(Withdrawed._to, borrower);
            expect(Withdrawed._amount).to.eq.BN(amount);
            // Check balance
            expect(await getETHBalance(collWETHManager.address)).to.eq.BN(0);
            expect(await getETHBalance(weth9.address)).to.eq.BN(prevETHBalWETH.sub(amount));
            expect(await getETHBalance(borrower)).to.eq.BN(prevETHBalBorrower.add(amount));
            expect(await getETHBalance(entry.createFrom)).to.eq.BN(prevETHBalCreator.sub(await toETHConsume(tx)));
        });
        it('Try Withdraw WETH of an entry without authorization', async function () {
            const entry = await new EntryBuilder()
                .build();

            await Helper.tryCatchRevert(
                () => collWETHManager.withdraw(
                    entry.id,
                    Helper.address0x,
                    1,
                    [],
                    { from: entry.createFrom }
                ),
                'msg.sender Not authorized'
            );
        });
    });
    describe('Function redeem', async function () {
        it('Redeem an WETH entry', async function () {
            const entry = await new EntryBuilder()
                .build();

            await collateral.approve(collWETHManager.address, entry.id, { from: entry.createFrom });

            const prevETHBalWETH = await getETHBalance(weth9.address);
            const prevETHBalBorrower = await getETHBalance(borrower);
            const prevETHBalCreator = await getETHBalance(entry.createFrom);

            const tx = await collWETHManager.redeem(
                entry.id,
                borrower,
                { from: entry.createFrom }
            );
            const Redeemed = await Helper.toEvents(tx, 'Redeemed');

            // Check event
            expect(Redeemed._entryId).to.eq.BN(entry.id);
            assert.equal(Redeemed._to, borrower);
            expect(Redeemed._amount).to.eq.BN(entry.entryAmount);
            // Check balance
            expect(await getETHBalance(collWETHManager.address)).to.eq.BN(0);
            expect(await getETHBalance(weth9.address)).to.eq.BN(prevETHBalWETH.sub(entry.entryAmount));
            expect(await getETHBalance(borrower)).to.eq.BN(prevETHBalBorrower.add(entry.entryAmount));
            expect(await getETHBalance(entry.createFrom)).to.eq.BN(prevETHBalCreator.sub(await toETHConsume(tx)));
        });
        it('Try redeem an WETH entry without authorization', async function () {
            const entry = await new EntryBuilder()
                .build();

            await Helper.tryCatchRevert(
                () => collWETHManager.redeem(
                    entry.id,
                    Helper.address0x,
                    { from: entry.createFrom }
                ),
                'msg.sender Not authorized'
            );
        });
    });
});
