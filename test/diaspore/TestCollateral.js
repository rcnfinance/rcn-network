const Collateral = artifacts.require('./core/diaspore/cosigner/Collateral.sol');
const TestModel = artifacts.require('./test_utils/diaspore/TestModel.sol');
const LoanManager = artifacts.require('./core/diaspore/LoanManager.sol');
const DebtEngine = artifacts.require('./core/diaspore/DebtEngine.sol');
const TestToken = artifacts.require('./test_utils/TestToken.sol');
const TestConverter = artifacts.require('./test_utils/TestConverter.sol');
const TestRateOracle = artifacts.require('./test_utils/diaspore/TestRateOracle.sol');

const Helper = require('../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn (number) {
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
    if (x.mod(y).eq(bn('0'))) {
        return x.div(y);
    } else {
        return x.div(y).add(bn('1'));
    }
}

const WEI = bn('10').pow(bn('18'));
const BASE = bn('10000');

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

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Requested');
        assert.ok(event);
        return event.args._id;
    }

    function roundCompare (x, y) {
        const z = x.sub(y).abs();
        assert.isTrue(z.gte(bn('0')) || z.lte(bn('2')),
            'Diff between ' +
            x.toString() +
            ' to ' +
            y.toString() +
            ' should be less than 1 and is ' +
            z.toString()
        );
    }

    before('Create constracts', async function () {
        rcn = await TestToken.new({ from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        collateral = await Collateral.new({ from: owner });
        auxToken = await TestToken.new({ from: owner });
        converter = await TestConverter.new({ from: owner });
        oracle = await TestRateOracle.new({ from: owner });
    });

    describe('Function create', function () {
        it('Should create a new collateral', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('1000');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');

            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            const prevAuxTokenBal = await auxToken.balanceOf(collateral.address);

            const Created = await Helper.toEvents(
                collateral.create(
                    loanManager.address, // loanManager
                    loanId, // debtId
                    auxToken.address, // token
                    collateralAmount, // amount
                    converter.address, // converter
                    liquidationRatio, // liquidationRatio
                    balanceRatio, // balanceRatio
                    payDebtBurnFee, // payDebtBurnFee
                    payDebtRewardFee, // payDebtRewardFee
                    margincallBurnFee, // margincallBurnFee
                    margincallRewardFee, // margincallRewardFee
                    { from: creator }
                ),
                'Created'
            );

            expect(Created._id).to.eq.BN(collateralId);
            assert.equal(Created._manager, loanManager.address);
            assert.equal(Created._debtId, loanId);
            assert.equal(Created._token, auxToken.address);
            expect(Created._amount).to.eq.BN(collateralAmount);
            assert.equal(Created._converter, converter.address);
            expect(Created._liquidationRatio).to.eq.BN(liquidationRatio);
            expect(Created._balanceRatio).to.eq.BN(balanceRatio);
            expect(Created._payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(Created._payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(Created._margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(Created._margincallRewardFee).to.eq.BN(margincallRewardFee);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevAuxTokenBal.add(collateralAmount));
            assert.equal(await collateral.ownerOf(collateralId), creator);
        });

        it('Try create a new collateral with a low liquidation ratio', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('0');
            const liquidationRatio = bn('10000');
            const balanceRatio = bn('15000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');

            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            await Helper.tryCatchRevert(
                () => collateral.create(
                    loanManager.address, // loanManager
                    loanId, // debtId
                    auxToken.address, // token
                    collateralAmount, // amount
                    converter.address, // converter
                    liquidationRatio, // liquidationRatio
                    balanceRatio, // balanceRatio
                    payDebtBurnFee, // payDebtBurnFee
                    payDebtRewardFee, // payDebtRewardFee
                    margincallBurnFee, // margincallBurnFee
                    margincallRewardFee, // margincallRewardFee
                    { from: creator }
                ),
                'The liquidation ratio should be greater than BASE'
            );
        });

        it('Try create a new collateral with a low balance ratio', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const liquidationRatio = bn('10001');
            const balanceRatio = bn('10000');

            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            await Helper.tryCatchRevert(
                () => collateral.create(
                    loanManager.address, // loanManager
                    loanId, // debtId
                    auxToken.address, // token
                    bn('0'), // amount
                    converter.address, // converter
                    liquidationRatio, // liquidationRatio
                    balanceRatio, // balanceRatio
                    balanceRatio, // payDebtBurnFee
                    bn('0'), // payDebtRewardFee
                    bn('0'), // margincallBurnFee
                    bn('0'), // margincallRewardFee
                    { from: creator }
                ),
                'The balance ratio should be greater than liquidation ratio'
            );
        });

        it('Try create a new collateral with a higth payDebtFee', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');

            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            await Helper.tryCatchRevert(
                () => collateral.create(
                    loanManager.address, // loanManager
                    loanId, // debtId
                    auxToken.address, // token
                    bn('0'), // amount
                    converter.address, // converter
                    bn('15000'), // liquidationRatio
                    bn('20000'), // balanceRatio
                    BASE.div(bn('2')), // payDebtBurnFee
                    BASE.div(bn('2')), // payDebtRewardFee
                    bn('0'), // margincallBurnFee
                    bn('0'), // margincallRewardFee
                    { from: creator }
                ),
                'PayDebtFee should be less than BASE'
            );

            await Helper.tryCatchRevert(
                () => collateral.create(
                    loanManager.address, // loanManager
                    loanId, // debtId
                    auxToken.address, // token
                    bn('0'), // amount
                    converter.address, // converter
                    bn('15000'), // liquidationRatio
                    bn('20000'), // balanceRatio
                    bn('2').pow(bn('32')).sub(bn('1')), // payDebtBurnFee
                    bn('2').pow(bn('32')).sub(bn('1')), // payDebtRewardFee
                    bn('0'), // margincallBurnFee
                    bn('0'), // margincallRewardFee
                    { from: creator }
                ),
                'PayDebtFee should be less than BASE'
            );
        });

        it('Try create a new collateral with a closed loan', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');

            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            await rcn.setBalance(creator, amount);
            await rcn.approve(loanManager.address, amount, { from: creator });

            await loanManager.lend(loanId, [], Helper.address0x, '0', [], { from: creator });

            await Helper.tryCatchRevert(
                () => collateral.create(
                    loanManager.address, // loanManager
                    loanId, // debtId
                    auxToken.address, // token
                    bn('0'), // amount
                    converter.address, // converter
                    bn('15000'), // liquidationRatio
                    bn('20000'), // balanceRatio
                    bn('0'), // payDebtBurnFee
                    bn('0'), // payDebtRewardFee
                    bn('0'), // margincallBurnFee
                    bn('0'), // margincallRewardFee
                    { from: creator }
                ),
                'Debt request should be open'
            );
        });

        it('Try create a new collateral without approval of the token collateral', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('1');

            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            await Helper.tryCatchRevert(
                () => collateral.create(
                    loanManager.address, // loanManager
                    loanId, // debtId
                    auxToken.address, // token
                    collateralAmount, // amount
                    converter.address, // converter
                    bn('15000'), // liquidationRatio
                    bn('20000'), // balanceRatio
                    bn('0'), // payDebtBurnFee
                    bn('0'), // payDebtRewardFee
                    bn('0'), // margincallBurnFee
                    bn('0'), // margincallRewardFee
                    { from: creator }
                ),
                'Error pulling tokens'
            );
        });
    });

    describe('Function deposit', function () {
        it('Should deposit an amount in a collateral', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');

            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                0,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
                { from: creator }
            );

            const depositAmount = bn('10000');

            await auxToken.setBalance(depositer, depositAmount);
            await auxToken.approve(collateral.address, depositAmount, { from: depositer });

            const prevAuxTokenBal = await auxToken.balanceOf(collateral.address);

            const Deposited = await Helper.toEvents(
                collateral.deposit(
                    collateralId,
                    depositAmount,
                    { from: depositer }
                ),
                'Deposited'
            );

            expect(Deposited._id).to.eq.BN(collateralId);
            expect(Deposited._amount).to.eq.BN(depositAmount);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(depositAmount);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevAuxTokenBal.add(depositAmount));
            assert.equal(await collateral.ownerOf(collateralId), creator);
        });

        it('Try deposit an amount in a collateral without approval of the token collateral', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                0,
                converter.address,
                bn('15000'),
                bn('20000'),
                bn('0'),
                bn('0'),
                bn('0'),
                bn('0'),
                { from: creator }
            );

            const depositAmount = bn('10000');

            await auxToken.setBalance(depositer, depositAmount);

            await Helper.tryCatchRevert(
                () => collateral.deposit(
                    collateralId,
                    depositAmount,
                    { from: depositer }
                ),
                'Error pulling tokens'
            );
        });
    });

    describe('Function withdraw', function () {
        it('Should withdraw an amount of an entry', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('6542');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
                { from: creator }
            );

            const withdrawAmount = bn('1000');

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevLenderBal = await auxToken.balanceOf(lender);

            const Withdrawed = await Helper.toEvents(
                collateral.withdraw(
                    collateralId,
                    lender,
                    withdrawAmount,
                    [],
                    { from: creator }
                ),
                'Withdrawed'
            );

            expect(Withdrawed._id).to.eq.BN(collateralId);
            assert.equal(Withdrawed._to, lender);
            expect(Withdrawed._amount).to.eq.BN(withdrawAmount);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount.sub(withdrawAmount));

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(withdrawAmount));
            expect(await auxToken.balanceOf(lender)).to.eq.BN(prevLenderBal.add(withdrawAmount));
            assert.equal(await collateral.ownerOf(collateralId), creator);
        });

        it('Try withdraw an entry without have collateral balance', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                0,
                converter.address,
                bn('15000'),
                bn('20000'),
                bn('0'),
                bn('0'),
                bn('0'),
                bn('0'),
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => collateral.withdraw(
                    collateralId,
                    lender,
                    bn('2').pow(bn(bn('127'))),
                    [],
                    { from: creator }
                ),
                'Dont have collateral to withdraw'
            );

            await Helper.tryCatchRevert(
                () => collateral.withdraw(
                    collateralId,
                    lender,
                    bn('1'),
                    [],
                    { from: creator }
                ),
                'Dont have collateral to withdraw'
            );

            const depositAmount = bn('1000');

            await auxToken.setBalance(depositer, depositAmount);
            await auxToken.approve(collateral.address, depositAmount, { from: depositer });

            await collateral.deposit(collateralId, depositAmount, { from: depositer });

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await converter.setRate(auxToken.address, rcn.address, WEI);
            await converter.setRate(rcn.address, auxToken.address, WEI);

            await loanManager.lend(
                loanId,
                [],
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            await Helper.tryCatchRevert(
                () => collateral.withdraw(
                    collateralId,
                    lender,
                    bn('501'),
                    [],
                    { from: creator }
                ),
                'Dont have collateral to withdraw'
            );
        });

        it('Try withdraw an entry without be an authorized', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('6542');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                bn('15000'),
                bn('20000'),
                bn('0'),
                bn('0'),
                bn('0'),
                bn('0'),
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => collateral.withdraw(
                    collateralId,
                    lender,
                    bn('0'),
                    [],
                    { from: lender }
                ),
                'Sender not authorized'
            );
        });
    });

    describe('Function redeem', function () {
        it('Should redeem an entry with a not request loan', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('6542');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
                { from: creator }
            );

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);

            const Redeemed = await Helper.toEvents(
                collateral.redeem(
                    collateralId,
                    { from: creator }
                ),
                'Redeemed'
            );

            expect(Redeemed._id).to.eq.BN(collateralId);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(0);
            expect(entry.balanceRatio).to.eq.BN(0);
            expect(entry.payDebtBurnFee).to.eq.BN(0);
            expect(entry.payDebtRewardFee).to.eq.BN(0);
            expect(entry.margincallBurnFee).to.eq.BN(0);
            expect(entry.margincallRewardFee).to.eq.BN(0);
            assert.equal(entry.loanManager, Helper.address0x);
            assert.equal(entry.converter, Helper.address0x);
            assert.equal(entry.token, Helper.address0x);
            assert.equal(entry.debtId, Helper.bytes320x);
            expect(entry.amount).to.eq.BN(0);

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(0);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(collateralAmount));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(collateralAmount));
            assert.equal(await collateral.ownerOf(collateralId), creator);
        });

        it('Should redeem an entry with a paid loan', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('6542');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            await converter.setRate(auxToken.address, rcn.address, WEI);
            await converter.setRate(rcn.address, auxToken.address, WEI);

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
                { from: creator }
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await loanManager.lend(
                loanId,
                [],
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            await Helper.increaseTime(loanDuration);

            const closingObligation = await loanManager.getClosingObligation(loanId);
            await rcn.setBalance(converter.address, closingObligation);

            await collateral.claim(loanManager.address, loanId, []);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);

            const Redeemed = await Helper.toEvents(
                collateral.redeem(
                    collateralId,
                    { from: creator }
                ),
                'Redeemed'
            );

            expect(Redeemed._id).to.eq.BN(collateralId);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(0);
            expect(entry.balanceRatio).to.eq.BN(0);
            expect(entry.payDebtBurnFee).to.eq.BN(0);
            expect(entry.payDebtRewardFee).to.eq.BN(0);
            expect(entry.margincallBurnFee).to.eq.BN(0);
            expect(entry.margincallRewardFee).to.eq.BN(0);
            assert.equal(entry.loanManager, Helper.address0x);
            assert.equal(entry.converter, Helper.address0x);
            assert.equal(entry.token, Helper.address0x);
            assert.equal(entry.debtId, Helper.bytes320x);
            expect(entry.amount).to.eq.BN(0);

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(0);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(collateralAmount.sub(amount)));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(collateralAmount.sub(amount)));
            assert.equal(await collateral.ownerOf(collateralId), creator);
        });

        it('Try redeem an entry without be an authorized', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                0,
                converter.address,
                bn('15000'),
                bn('20000'),
                0,
                0,
                0,
                0,
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => collateral.redeem(
                    collateralId,
                    { from: borrower }
                ),
                'Sender not authorized'
            );
        });

        it('Try redeem an entry with ongoing loan', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                0,
                converter.address,
                bn('15000'),
                bn('20000'),
                0,
                0,
                0,
                0,
                { from: creator }
            );

            await rcn.setBalance(creator, amount);
            await rcn.approve(loanManager.address, amount, { from: creator });

            await loanManager.lend(
                loanId,
                [],
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => collateral.redeem(
                    collateralId,
                    { from: creator }
                ),
                'Debt not request or paid'
            );
        });

        it('Try redeem an entry with loan in ERROR status', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                0,
                converter.address,
                bn('15000'),
                bn('20000'),
                0,
                0,
                0,
                0,
                { from: creator }
            );

            await rcn.setBalance(creator, amount);
            await rcn.approve(loanManager.address, amount, { from: creator });

            await loanManager.lend(
                loanId,
                [],
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: creator }
            );

            await model.setErrorFlag(loanId, 4, { from: owner });

            await Helper.tryCatchRevert(
                () => collateral.redeem(
                    collateralId,
                    { from: creator }
                ),
                'Debt not request or paid'
            );
        });
    });

    describe('Function emergencyRedeem', function () {
        it('Should redeem an entry with a loan in ERROR status', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('6542');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
                { from: creator }
            );

            await rcn.setBalance(creator, amount);
            await rcn.approve(loanManager.address, amount, { from: creator });

            await loanManager.lend(
                loanId,
                [],
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: creator }
            );

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);

            await model.setErrorFlag(loanId, 4, { from: owner });

            const EmergencyRedeemed = await Helper.toEvents(
                collateral.emergencyRedeem(
                    collateralId,
                    creator,
                    { from: owner }
                ),
                'EmergencyRedeemed'
            );

            expect(EmergencyRedeemed._id).to.eq.BN(collateralId);
            assert.equal(EmergencyRedeemed._to, creator);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(0);
            expect(entry.balanceRatio).to.eq.BN(0);
            expect(entry.payDebtBurnFee).to.eq.BN(0);
            expect(entry.payDebtRewardFee).to.eq.BN(0);
            expect(entry.margincallBurnFee).to.eq.BN(0);
            expect(entry.margincallRewardFee).to.eq.BN(0);
            assert.equal(entry.loanManager, Helper.address0x);
            assert.equal(entry.converter, Helper.address0x);
            assert.equal(entry.token, Helper.address0x);
            assert.equal(entry.debtId, Helper.bytes320x);
            expect(entry.amount).to.eq.BN(0);

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(0);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(collateralAmount));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(collateralAmount));
            assert.equal(await collateral.ownerOf(collateralId), creator);
        });

        it('Try redeem an entry without be the owner', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                0,
                converter.address,
                bn('15000'),
                bn('20000'),
                0,
                0,
                0,
                0,
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => collateral.emergencyRedeem(
                    collateralId,
                    borrower,
                    { from: borrower }
                ),
                'The owner should be the sender'
            );
        });

        it('Try redeem an entry with a loan in not ERROR status', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const expiration = (await Helper.getBlockTime()) + 1000;

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                0,
                converter.address,
                bn('15000'),
                bn('20000'),
                0,
                0,
                0,
                0,
                { from: creator }
            );

            await rcn.setBalance(creator, amount);
            await rcn.approve(loanManager.address, amount, { from: creator });

            await loanManager.lend(
                loanId,
                [],
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => collateral.emergencyRedeem(
                    collateralId,
                    creator,
                    { from: owner }
                ),
                'Debt is not in error'
            );
        });
    });

    describe('Function claim', function () {
        it('Should claim an entry and pay the loan', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('6542');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            await converter.setRate(auxToken.address, rcn.address, WEI);
            await converter.setRate(rcn.address, auxToken.address, WEI);

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
                { from: creator }
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await loanManager.lend(
                loanId,
                [],
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            await Helper.increaseTime(loanDuration);

            const closingObligation = await loanManager.getClosingObligation(loanId);
            await rcn.setBalance(converter.address, closingObligation);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    loanId,
                    [],
                    { from: creator }
                ),
                'CancelDebt',
                'ConvertPay'
            );

            const CancelDebt = events[0];
            expect(CancelDebt._id).to.eq.BN(collateralId);
            expect(CancelDebt._obligationInToken).to.eq.BN(amount);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(amount);
            expect(ConvertPay._toAmount).to.eq.BN(amount);
            assert.equal(ConvertPay._oracleData, null);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount.sub(amount));

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(collateralId);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(amount));
            assert.equal(await collateral.ownerOf(collateralId), creator);

            expect(await model.getClosingObligation(loanId)).to.eq.BN(0);
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
        });

        it('Should claim an entry and pay the loan with oracle', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('6542');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            // 1 collateral token = 2 token
            await converter.setRate(auxToken.address, rcn.address, WEI.mul(bn('2')));
            await converter.setRate(rcn.address, auxToken.address, WEI.div(bn('2')));

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

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
                { from: creator }
            );

            // 0.82711175222132156792 debt currency = 1.23333566612312 token
            const tokens = bn('123333566612312000000');
            const equivalent = bn('82711175222132156792');

            const amountInToken = divceil(amount.mul(tokens), equivalent);

            await rcn.setBalance(lender, amountInToken);
            await rcn.approve(loanManager.address, amountInToken, { from: lender });

            const oracleData = await oracle.encodeRate(tokens, equivalent);

            await loanManager.lend(
                loanId,
                oracleData,
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            await Helper.increaseTime(loanDuration);

            const closingObligation = await loanManager.getClosingObligation(loanId);
            const closingObligationInToken = divceil(closingObligation.mul(tokens), equivalent);
            await rcn.setBalance(converter.address, closingObligationInToken);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    loanId,
                    oracleData,
                    { from: creator }
                ),
                'CancelDebt',
                'ConvertPay'
            );

            const CancelDebt = events[0];
            expect(CancelDebt._id).to.eq.BN(collateralId);
            expect(CancelDebt._obligationInToken).to.eq.BN(amountInToken);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(closingObligationInToken.div(bn('2')));
            expect(ConvertPay._toAmount).to.eq.BN(closingObligationInToken);
            assert.equal(ConvertPay._oracleData, oracleData);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount.sub(closingObligationInToken.div(bn('2'))));

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(collateralId);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(closingObligationInToken.div(bn('2'))));
            assert.equal(await collateral.ownerOf(collateralId), creator);

            expect(await model.getClosingObligation(loanId)).to.eq.BN(0);
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
        });

        it('Should claim an entry and equilibrate the entry', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('1100');
            const equilibrateAmount = bn('900');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('3');
            const payDebtRewardFee = bn('3');
            const margincallBurnFee = bn('3');
            const margincallRewardFee = bn('3');
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            await converter.setRate(auxToken.address, rcn.address, WEI);
            await converter.setRate(rcn.address, auxToken.address, WEI);

            const loanData = await model.encodeData(amount, expiration);

            const loanId = await getId(loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            ));

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
                { from: creator }
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await loanManager.lend(
                loanId,
                [],
                collateral.address,
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            await rcn.setBalance(converter.address, equilibrateAmount);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    loanId,
                    [],
                    { from: creator }
                ),
                'CollateralBalance',
                'ConvertPay'
            );

            const CollateralBalance = events[0];
            expect(CollateralBalance._id).to.eq.BN(collateralId);
            expect(CollateralBalance._tokenPayRequired).to.eq.BN(equilibrateAmount);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(equilibrateAmount);
            expect(ConvertPay._toAmount).to.eq.BN(equilibrateAmount);
            assert.equal(ConvertPay._oracleData, null);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount.sub(equilibrateAmount));

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(equilibrateAmount));
            assert.equal(await collateral.ownerOf(collateralId), creator);

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(collateralId);

            expect(await model.getClosingObligation(loanId)).to.eq.BN(amount.sub(equilibrateAmount));
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '1');

            assert.isTrue((await collateral.collateralRatio(
                collateralId,
                bn('0'),
                bn('0')
            )).gte(balanceRatio));
        });

        it('Should claim an entry and equilibrate the entry, with a debt with oracle', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('10000000');
            const collateralAmount = bn('11000000');
            const equilibrateAmountInToken = bn('7000327');
            const equilibrateAmountInCollateral = equilibrateAmountInToken;
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('0');
            const payDebtRewardFee = bn('0');
            const margincallBurnFee = bn('0');
            const margincallRewardFee = bn('0');
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            // 1 collateral token = 1 token
            await converter.setRate(auxToken.address, rcn.address, WEI);
            await converter.setRate(rcn.address, auxToken.address, WEI);

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

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
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
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            await rcn.setBalance(converter.address, equilibrateAmountInToken);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);

            const events = await Helper.toEvents(
                collateral.claim(
                    loanManager.address,
                    loanId,
                    oracleData,
                    { from: creator }
                ),
                'CollateralBalance',
                'ConvertPay'
            );

            const CollateralBalance = events[0];
            expect(CollateralBalance._id).to.eq.BN(collateralId);
            expect(CollateralBalance._tokenPayRequired).to.eq.BN(equilibrateAmountInToken);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(equilibrateAmountInCollateral);
            expect(ConvertPay._toAmount).to.eq.BN(equilibrateAmountInToken);
            assert.equal(ConvertPay._oracleData, oracleData);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount.sub(equilibrateAmountInCollateral));

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(equilibrateAmountInCollateral));
            assert.equal(await collateral.ownerOf(collateralId), creator);

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(collateralId);

            const payAmount = equilibrateAmountInToken.mul(equivalent).div(tokens);
            expect(await model.getClosingObligation(loanId)).to.eq.BN(amount.sub(payAmount));
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '1');

            assert.isTrue((await collateral.collateralRatio(
                collateralId,
                tokens,
                equivalent
            )).gte(balanceRatio));
        });

        it('Should claim an entry and equilibrate the entry, with a debt with oracle and fee', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('20000000');
            const collateralAmount = bn('11000000');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('654');
            const payDebtRewardFee = bn('789');
            const margincallBurnFee = bn('0');
            const margincallRewardFee = bn('1000');
            const equilibrateAmountInCollateral = bn('7700359');
            const equilibrateAmountInToken = equilibrateAmountInCollateral.mul(bn('2'));
            const rewardedCollateral = equilibrateAmountInCollateral.mul(margincallRewardFee).div(BASE);
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            // 1 collateral token = 2 token
            await converter.setRate(auxToken.address, rcn.address, WEI.mul(bn('2')));
            await converter.setRate(rcn.address, auxToken.address, WEI.div(bn('2')));

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

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
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
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            await rcn.setBalance(converter.address, equilibrateAmountInToken);

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
                'TakeMargincallFee'
            );

            const CollateralBalance = events[0];
            expect(CollateralBalance._id).to.eq.BN(collateralId);
            expect(CollateralBalance._tokenPayRequired).to.eq.BN(equilibrateAmountInToken);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(equilibrateAmountInCollateral);
            expect(ConvertPay._toAmount).to.eq.BN(equilibrateAmountInToken);
            assert.equal(ConvertPay._oracleData, oracleData);

            const TakeMargincallFee = events[2];
            expect(TakeMargincallFee._burned).to.eq.BN(0);
            expect(TakeMargincallFee._rewarded).to.eq.BN(rewardedCollateral);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount.sub(equilibrateAmountInCollateral.add(rewardedCollateral)));

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(equilibrateAmountInCollateral.add(rewardedCollateral)));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(rewardedCollateral));
            expect(await auxToken.balanceOf(rcn.address)).to.eq.BN(prevRCNBal);

            assert.equal(await collateral.ownerOf(collateralId), creator);

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(collateralId);

            const payAmount = equilibrateAmountInToken.mul(equivalent).div(tokens);
            expect(await model.getClosingObligation(loanId)).to.eq.BN(amount.sub(payAmount));
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '1');

            assert.isTrue((await collateral.collateralRatio(
                collateralId,
                tokens,
                equivalent
            )).gte(balanceRatio.sub(rewardedCollateral)));
        });

        it('Should claim an entry and pay the loan, with a debt with oracle and fee', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('20000000');
            const collateralAmount = bn('11000000');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('334');
            const payDebtRewardFee = bn('666');
            const margincallBurnFee = bn('987');
            const margincallRewardFee = bn('159');
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            // 1 collateral token = 2 token
            await converter.setRate(auxToken.address, rcn.address, WEI.mul(bn('2')));
            await converter.setRate(rcn.address, auxToken.address, WEI.div(bn('2')));

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

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
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
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            const closingObligation = await loanManager.getClosingObligation(loanId);
            const closingObligationInToken = divceil(closingObligation.mul(tokens), equivalent);
            const closingObligationInCollateral = closingObligationInToken.div(bn('2'));

            await rcn.setBalance(converter.address, closingObligationInToken);

            const burnedCollateral = closingObligationInCollateral.mul(payDebtBurnFee).div(BASE);
            const rewardedCollateral = closingObligationInCollateral.mul(payDebtRewardFee).div(BASE);
            const totalFeeCollateral = burnedCollateral.add(rewardedCollateral);

            const prevCollateralBal = await auxToken.balanceOf(collateral.address);
            const prevCreatorBal = await auxToken.balanceOf(creator);
            const prevRCNBal = await auxToken.balanceOf(rcn.address);

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
            expect(CancelDebt._id).to.eq.BN(collateralId);
            expect(CancelDebt._obligationInToken).to.eq.BN(amountInToken);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(closingObligationInCollateral);
            expect(ConvertPay._toAmount).to.eq.BN(amountInToken);
            assert.equal(ConvertPay._oracleData, oracleData);

            const TakeDebtFee = events[2];
            expect(TakeDebtFee._burned).to.eq.BN(burnedCollateral);
            expect(TakeDebtFee._rewarded).to.eq.BN(rewardedCollateral);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount.sub(closingObligationInCollateral.add(totalFeeCollateral)));

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(collateralId);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(closingObligationInCollateral.add(totalFeeCollateral)));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(rewardedCollateral));
            expect(await auxToken.balanceOf(rcn.address)).to.eq.BN(prevRCNBal.add(burnedCollateral));

            assert.equal(await collateral.ownerOf(collateralId), creator);

            expect(await model.getClosingObligation(loanId)).to.eq.BN(0);
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
        });

        it('Should claim an entry and pay all collateral token, with a debt with oracle and fee', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('10000000');
            const collateralAmount = bn('4000000');
            const liquidationRatio = bn('15000');
            const balanceRatio = bn('20000');
            const payDebtBurnFee = bn('654');
            const payDebtRewardFee = bn('789');
            const margincallBurnFee = bn('666');
            const margincallRewardFee = bn('334');
            const totalMargincallFee = margincallBurnFee.add(margincallRewardFee);
            const collateralToPay = collateralAmount.mul(BASE.sub(totalMargincallFee)).div(BASE);
            const tokenToPay = collateralToPay.mul(bn('2'));
            const burnedCollateral = collateralToPay.mul(margincallBurnFee).div(BASE);
            const rewardedCollateral = collateralToPay.mul(margincallRewardFee).div(BASE);
            const totalFeeCollateral = burnedCollateral.add(rewardedCollateral);
            const loanDuration = 1000;
            const expiration = (await Helper.getBlockTime()) + loanDuration;

            // 1 collateral token = 2 token
            await converter.setRate(auxToken.address, rcn.address, WEI.mul(bn('2')));
            await converter.setRate(rcn.address, auxToken.address, WEI.div(bn('2')));

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

            const collateralId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, collateralAmount);
            await auxToken.approve(collateral.address, collateralAmount, { from: creator });

            await collateral.create(
                loanManager.address,
                loanId,
                auxToken.address,
                collateralAmount,
                converter.address,
                liquidationRatio,
                balanceRatio,
                payDebtBurnFee,
                payDebtRewardFee,
                margincallBurnFee,
                margincallRewardFee,
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
                bn('0'),
                Helper.toBytes32(collateralId),
                { from: lender }
            );

            await rcn.setBalance(converter.address, tokenToPay);

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
                'TakeMargincallFee'
            );

            const CollateralBalance = events[0];
            expect(CollateralBalance._id).to.eq.BN(collateralId);
            expect(CollateralBalance._tokenPayRequired).to.eq.BN(tokenToPay);

            const ConvertPay = events[1];
            expect(ConvertPay._fromAmount).to.eq.BN(collateralToPay);
            expect(ConvertPay._toAmount).to.eq.BN(tokenToPay);
            assert.equal(ConvertPay._oracleData, oracleData);

            const TakeMargincallFee = events[2];
            expect(TakeMargincallFee._burned).to.eq.BN(burnedCollateral);
            expect(TakeMargincallFee._rewarded).to.eq.BN(rewardedCollateral);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(balanceRatio);
            expect(entry.payDebtBurnFee).to.eq.BN(payDebtBurnFee);
            expect(entry.payDebtRewardFee).to.eq.BN(payDebtRewardFee);
            expect(entry.margincallBurnFee).to.eq.BN(margincallBurnFee);
            expect(entry.margincallRewardFee).to.eq.BN(margincallRewardFee);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, converter.address);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.debtId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount.sub(collateralToPay.add(totalFeeCollateral)));

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollateralBal.sub(collateralToPay.add(totalFeeCollateral)));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBal.add(rewardedCollateral));
            expect(await auxToken.balanceOf(rcn.address)).to.eq.BN(prevRCNBal.add(burnedCollateral));

            assert.equal(await collateral.ownerOf(collateralId), creator);

            expect(await collateral.liabilities(loanManager.address, loanId)).to.eq.BN(collateralId);

            const closingObligationInToken = (await model.getClosingObligation(loanId)).mul(tokens).div(equivalent);
            expect(closingObligationInToken).to.eq.BN(amountInToken.sub(tokenToPay));
            assert.isTrue((await model.getStatus.call(loanId)).toString() === '1');
        });
    });

    describe('Functional test', function () {
        // Debt in Token, collateral in Token
        it('Test 0.0', cTest(1, 1, 12000, 15000, 1000, 1100, 1));
        it('Test 0.1', cTest(1, 1, 15000, 20000, 1000, 1100, 1));
        it('Test 0.2', cTest(1, 1, 15000, 20000, 9000000, 11000000, 1));
        it('Test 0.3', cTest(1, 1, 15000, 20000, 600, 600, 1));
        it('Test 0.4', cTest(1, 1, 12345, 23456, 300, 200, 1));
        // Debt in Token
        it('Test 1.0', cTest(1, 1, 15000, 20000, 200, 450, 2));
        it('Test 1.1', cTest(1, 1, 15000, 20000, 200, 600, 0.45));
        it('Test 1.2', cTest(1, 1, 15000, 20000, 300, 600, 0.50));
        it('Test 1.3', cTest(1, 1, 90000, 100000, 2000, 6000, 0.50));
        it('Test 1.4', cTest(1, 1, 15000, 20000, 200, 201, 2.00));
        it('Test 1.5', cTest(1, 1, 15000, 20000, 310, 600, 0.50));
        it('Test 1.6', cTest(1, 1, 15000, 20000, 310, 930, 2.00));
        it('Test 1.7', cTest(1, 1, 15000, 20000, 310, 930, 0.40));
        // Collateral in Token
        it('Test 2.0', cTest(5, 1, 12345, 15678, 100, 600, 1.00));
        it('Test 2.1', cTest(1, 2, 17110, 20000, 1200, 600, 1.00));
        it('Test 2.2', cTest(2, 7, 16500, 20000, 100, 600, 1.00));
        it('Test 2.3', cTest(1, 2, 11000, 20000, 100, 600, 1.00));
        it('Test 2.4', cTest(1, 2, 11000, 20000, 1000, 100, 1.00));

        it('Test 3.0', cTest(1, 2, 11000, 20000, 1000, 100, 0.50));
        it('Test 3.1', cTest(1, 4, 11000, 20000, 4000, 1500, 1.50));
        it('Test 3.2', cTest(1, 2, 11000, 20000, 1000, 1000, 0.50));
        it('Test 3.3', cTest(4, 1, 11000, 20000, 1500, 8000, 1.50));

        // Converter error: When the collateral calculate collateralToPay, use valueTokensToCollateral and the Converter
        //      maybe return a different value
        //     Because the conversion rate of xToken to yToken might not be the same as the conversion of yToken to xToken

        function cTest (
            tokens,
            equivalent,
            liquidationRatioLimit,
            balanceRatioLimit,
            debt,
            collateralAmount,
            collateralToTokenRate
        ) {
            return async () => {
                liquidationRatioLimit = bn(liquidationRatioLimit.toString());
                balanceRatioLimit = bn(balanceRatioLimit.toString());
                debt = bn(debt.toString());
                tokens = bn(tokens.toString());
                equivalent = bn(equivalent.toString());
                const debtRCN = debt.mul(tokens).div(equivalent);

                collateralAmount = bn(collateralAmount.toString());

                const tokenToCollateralRate = bn(Math.round(10000 / collateralToTokenRate).toString()).mul(WEI).div(BASE);
                await converter.setRate(rcn.address, auxToken.address, tokenToCollateralRate);

                collateralToTokenRate = bn((collateralToTokenRate * 10000).toString()).mul(WEI).div(BASE);
                await converter.setRate(auxToken.address, rcn.address, collateralToTokenRate);

                const collateralInToken = await converter.getReturn(auxToken.address, rcn.address, collateralAmount);
                const collateralRatio = collateralInToken.mul(BASE).div(debtRCN);
                const liquidationDeltaRatio = collateralRatio.sub(liquidationRatioLimit);
                const balanceDeltaRatio = collateralRatio.sub(balanceRatioLimit);
                const canWithdraw = collateralAmount.mul(balanceDeltaRatio).div(collateralRatio);

                async function calcRequiredCollateralPay () {
                    if (canWithdraw.lt(bn('0'))) {
                        return min(
                            // Collateral require to balance
                            canWithdraw.abs().mul(BASE).div(balanceRatioLimit.sub(BASE)),
                            // Collateral
                            collateralAmount,
                            // Debt In Collateral
                            await converter.getReturn(rcn.address, auxToken.address, debtRCN)
                        );
                    } else {
                        return bn('0');
                    }
                };

                const requiredCollateralPay = await calcRequiredCollateralPay();
                const requiredTokenPay = await converter.getReturn(auxToken.address, rcn.address, requiredCollateralPay);
                const newDebt = debtRCN.sub(requiredTokenPay);
                const newCollateral = collateralAmount.sub(requiredCollateralPay);
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

                const collateralId = await collateral.getEntriesLength();

                await auxToken.setBalance(creator, collateralAmount);
                await auxToken.approve(collateral.address, collateralAmount, { from: creator });

                await collateral.create(
                    loanManager.address,
                    loanId,
                    auxToken.address,
                    collateralAmount,
                    converter.address,
                    liquidationRatioLimit,
                    balanceRatioLimit,
                    0,
                    0,
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
                    bn('0'),
                    Helper.toBytes32(collateralId),
                    { from: creator }
                );

                expect(await converter.getReturn(auxToken.address, rcn.address, collateralAmount)).to.eq.BN(collateralInToken);

                expect(await collateral.collateralInTokens(collateralId)).to.eq.BN(collateralInToken);
                expect(await collateral.valueCollateralToTokens(collateralId, collateralAmount)).to.eq.BN(collateralInToken);

                expect(await collateral.debtInTokens(collateralId, tokens, equivalent)).to.eq.BN(debtRCN);

                const _collateralRatio = await collateral.collateralRatio(collateralId, tokens, equivalent);
                expect(_collateralRatio).to.eq.BN(collateralRatio);

                const _liquidationDeltaRatio = await collateral.liquidationDeltaRatio(collateralId, tokens, equivalent);
                expect(_liquidationDeltaRatio).to.eq.BN(liquidationDeltaRatio);

                const _balanceDeltaRatio = await collateral.balanceDeltaRatio(collateralId, tokens, equivalent);
                expect(_balanceDeltaRatio).to.eq.BN(balanceDeltaRatio);

                const _canWithdraw = await collateral.canWithdraw(collateralId, tokens, equivalent);
                expect(_canWithdraw).to.eq.BN(canWithdraw);

                const _collateralToPay = await collateral.collateralToPay(collateralId, tokens, equivalent);
                expect(_collateralToPay).to.eq.BN(requiredCollateralPay);

                const _tokensToPay = await collateral.tokensToPay(collateralId, tokens, equivalent);
                expect(_tokensToPay).to.eq.BN(requiredTokenPay);

                await auxToken.setBalance(converter.address, bn('0'));
                await rcn.setBalance(converter.address, _tokensToPay);

                await collateral.claim(loanManager.address, loanId, oracleData);

                const _newDebt = await collateral.debtInTokens(collateralId, tokens, equivalent);
                roundCompare(_newDebt, newDebt);

                const _newCollateral = (await collateral.entries(collateralId)).amount;
                roundCompare(_newCollateral, newCollateral);

                const _newCollateralInToken = await collateral.collateralInTokens(collateralId);
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
                            const _newCollateralRatio = await collateral.collateralRatio(collateralId, tokens, equivalent);
                            assert.equal(_newCollateralRatio.gte(liquidationRatioLimit), collateralized);

                            assert.isFalse((await model.getStatus.call(loanId)).toString() === '2');
                            // if haves collateral the newCollateralRatio should be more or equal than ratioLimit
                            if (!_newCollateral.isZero()) {
                                assert.isTrue(newCollateralRatio.gte(liquidationRatioLimit));
                            }
                        }
                    }
                }

                const prevCollateralAmount = (await collateral.entries(collateralId)).amount;
                const _coll = await collateral.collateralInTokens(collateralId);
                const _debt = await collateral.debtInTokens(collateralId, tokens, equivalent);
                const canPayAllDebt = _coll.gte(_debt);

                // Claim when the loan is in debt
                await Helper.increaseTime(loanDuration + 10);

                const closingObligation = (await model.getObligation(loanId, await Helper.getBlockTime()))[0];
                const closingObligationInToken = divceil(tokens.mul(closingObligation), equivalent);

                await rcn.setBalance(converter.address, closingObligationInToken);
                await auxToken.setBalance(converter.address, bn('0'));

                await collateral.claim(loanManager.address, loanId, oracleData);

                const newCollateralAmount = (await collateral.entries(collateralId)).amount;
                if (canPayAllDebt) {
                    const closingObligationInCollateral = await collateral.valueTokensToCollateral(collateralId, closingObligationInToken);
                    roundCompare(newCollateralAmount, prevCollateralAmount.sub(closingObligationInCollateral)); // Convert rounded
                    assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
                } else {
                    expect(newCollateralAmount).to.eq.BN(bn('0'));
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

        await Helper.tryCatchRevert(
            () => collateral.setUrl(
                url,
                { from: creator }
            ),
            'The owner should be the sender'
        );
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
        const collateralAmount = bn('100');
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
        const collateralId = await collateral.getEntriesLength();

        await auxToken.setBalance(creator, collateralAmount);
        await auxToken.approve(collateral.address, collateralAmount, { from: creator });

        await collateral.create(
            loanManager.address,
            loanId,
            auxToken.address,
            collateralAmount,
            converter.address,
            liquidationRatio,
            balanceRatio,
            0,
            0,
            0,
            0,
            { from: creator }
        );

        await converter.setRate(auxToken.address, rcn.address, bn('2').mul(WEI));
        await converter.setRate(rcn.address, auxToken.address, bn('5').mul(WEI).div(bn('10')));

        expect(await collateral.collateralInTokens(
            collateralId
        )).to.eq.BN(200);

        expect(await collateral.valueCollateralToTokens(
            collateralId,
            0
        )).to.eq.BN(0);

        expect(await collateral.valueTokensToCollateral(
            collateralId,
            0
        )).to.eq.BN(0);

        expect(await collateral.valueCollateralToTokens(
            collateralId,
            200
        )).to.eq.BN(400);

        expect(await collateral.valueTokensToCollateral(
            collateralId,
            400
        )).to.eq.BN(200);

        const collateralId2 = await collateral.getEntriesLength();

        await rcn.setBalance(creator, collateralAmount);
        await rcn.approve(collateral.address, collateralAmount, { from: creator });

        await collateral.create(
            loanManager.address,
            loanId,
            rcn.address,
            collateralAmount,
            converter.address,
            liquidationRatio,
            balanceRatio,
            0,
            0,
            0,
            0,
            { from: creator }
        );

        expect(await collateral.valueCollateralToTokens(
            collateralId2,
            200
        )).to.eq.BN(200);

        expect(await collateral.valueTokensToCollateral(
            collateralId2,
            200
        )).to.eq.BN(200);

        await converter.setRate(auxToken.address, rcn.address, 0);
        await converter.setRate(rcn.address, auxToken.address, 0);
    });

    it('Function debtInTokens, collateralRatio and canWithdraw', async function () {
        const loanAmount = bn('100');
        const collateralAmount = bn('100');
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
        const collateralId = await collateral.getEntriesLength();

        await rcn.setBalance(creator, collateralAmount);
        await rcn.approve(collateral.address, collateralAmount, { from: creator });

        await collateral.create(
            loanManager.address,
            loanId,
            rcn.address,
            collateralAmount,
            converter.address,
            liquidationRatio,
            balanceRatio,
            0,
            0,
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
            bn('0'),
            Helper.toBytes32(collateralId),
            { from: creator }
        );

        expect(await collateral.debtInTokens(
            collateralId,
            bn('0'),
            bn('0')
        )).to.eq.BN(loanAmount);

        let calcCollateralRatio = collateralAmount.mul(BASE).div(loanAmount);
        expect(await collateral.collateralRatio(
            collateralId,
            bn('0'),
            bn('0')
        )).to.eq.BN(calcCollateralRatio);

        let calcDeltaRatio = calcCollateralRatio.sub(balanceRatio);
        expect(await collateral.balanceDeltaRatio(
            collateralId,
            bn('0'),
            bn('0')
        )).to.eq.BN(calcDeltaRatio);

        let calcCanWithdraw = collateralAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            collateralId,
            bn('0'),
            bn('0')
        )).to.eq.BN(calcCanWithdraw);

        const rateTokens = bn('2').mul(WEI);
        const rateEquivalent = WEI;

        const calcDebtInTokens = rateTokens.mul(loanAmount).div(rateEquivalent);
        expect(await collateral.debtInTokens(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcDebtInTokens);

        calcCollateralRatio = collateralAmount.mul(BASE).div(calcDebtInTokens);
        expect(await collateral.collateralRatio(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio);

        calcDeltaRatio = calcCollateralRatio.sub(balanceRatio);
        expect(await collateral.balanceDeltaRatio(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio.sub(balanceRatio));

        calcCanWithdraw = collateralAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCanWithdraw);
    });

    it('Function debtInTokens, collateralRatio and canWithdraw', async function () {
        const loanAmount = bn('100');
        const collateralAmount = bn('100');
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
        const collateralId = await collateral.getEntriesLength();

        await rcn.setBalance(creator, collateralAmount);
        await rcn.approve(collateral.address, collateralAmount, { from: creator });

        await collateral.create(
            loanManager.address,
            loanId,
            rcn.address,
            collateralAmount,
            converter.address,
            liquidationRatio,
            balanceRatio,
            0,
            0,
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
            bn('0'),
            Helper.toBytes32(collateralId),
            { from: creator }
        );

        expect(await collateral.debtInTokens(
            collateralId,
            bn('0'),
            bn('0')
        )).to.eq.BN(loanAmount);

        let calcCollateralRatio = collateralAmount.mul(BASE).div(loanAmount);
        expect(await collateral.collateralRatio(
            collateralId,
            bn('0'),
            bn('0')
        )).to.eq.BN(calcCollateralRatio);

        let calcDeltaRatio = calcCollateralRatio.sub(balanceRatio);
        expect(await collateral.balanceDeltaRatio(
            collateralId,
            bn('0'),
            bn('0')
        )).to.eq.BN(calcDeltaRatio);

        let calcCanWithdraw = collateralAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            collateralId,
            bn('0'),
            bn('0')
        )).to.eq.BN(calcCanWithdraw);

        const rateTokens = bn('2').mul(WEI);
        const rateEquivalent = WEI;

        const calcDebtInTokens = rateTokens.mul(loanAmount).div(rateEquivalent);
        expect(await collateral.debtInTokens(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcDebtInTokens);

        calcCollateralRatio = collateralAmount.mul(BASE).div(calcDebtInTokens);
        expect(await collateral.collateralRatio(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio);

        calcDeltaRatio = calcCollateralRatio.sub(balanceRatio);
        expect(await collateral.balanceDeltaRatio(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio.sub(balanceRatio));

        calcCanWithdraw = collateralAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCanWithdraw);
    });
});
