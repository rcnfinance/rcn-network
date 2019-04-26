const Collateral = artifacts.require('./core/diaspore/cosigner/Collateral.sol');
const TestModel = artifacts.require('./test_utils/diaspore/TestModel.sol');
const LoanManager = artifacts.require('./core/diaspore/LoanManager.sol');
const DebtEngine = artifacts.require('./core/diaspore/DebtEngine.sol');
const TestToken = artifacts.require('./test_utils/TestToken.sol');
const TestConverter = artifacts.require('./test_utils/TestConverter.sol');

const Helper = require('../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn (number) {
    return new BN(number);
}

const WEI = bn('10').pow(bn('18'));
const BASE = bn('10000');

contract('Test Collateral cosigner Diaspore', function (accounts) {
    const owner = accounts[1];
    const creator = accounts[2];
    const borrower = accounts[3];
    const depositer = accounts[4];

    let rcn;
    let auxToken;
    let loanManager;
    let debtEngine;
    let model;
    let collateral;
    let converter;

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Requested');
        assert.ok(event);
        return event.args._id;
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
    });

    describe('Function create', function () {
        it('Should create a new collateral', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('1000');
            const liquidationRatio = bn('15000');
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
                    loanManager.address,
                    loanId,
                    auxToken.address,
                    collateralAmount,
                    Helper.address0x,
                    liquidationRatio,
                    { from: creator }
                ),
                'Created'
            );

            expect(Created._id).to.eq.BN(collateralId);
            assert.equal(Created._manager, loanManager.address);
            assert.equal(Created._loanId, loanId);
            assert.equal(Created._token, auxToken.address);
            expect(Created._amount).to.eq.BN(collateralAmount);
            assert.equal(Created._converter, Helper.address0x);
            expect(Created._liquidationRatio).to.eq.BN(liquidationRatio);

            const entry = await collateral.entries(collateralId);
            expect(entry.liquidationRatio).to.eq.BN(liquidationRatio);
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, Helper.address0x);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.loanId, loanId);
            expect(entry.amount).to.eq.BN(collateralAmount);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevAuxTokenBal.add(collateralAmount));
            assert.equal(await collateral.ownerOf(collateralId), creator);
        });

        it('Try create a new collateral with a closed loan', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('0');
            const liquidationRatio = bn('15000');
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
                    loanManager.address,
                    loanId,
                    auxToken.address,
                    collateralAmount,
                    Helper.address0x,
                    liquidationRatio,
                    { from: creator }
                ),
                'Loan request should be open'
            );
        });

        it('Try create a new collateral without approval of the token collateral', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const collateralAmount = bn('1');
            const liquidationRatio = bn('15000');
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
                    loanManager.address,
                    loanId,
                    auxToken.address,
                    collateralAmount,
                    Helper.address0x,
                    liquidationRatio,
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
                Helper.address0x,
                liquidationRatio,
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
            assert.equal(entry.loanManager, loanManager.address);
            assert.equal(entry.converter, Helper.address0x);
            assert.equal(entry.token, auxToken.address);
            assert.equal(entry.loanId, loanId);
            expect(entry.amount).to.eq.BN(depositAmount);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevAuxTokenBal.add(depositAmount));
            assert.equal(await collateral.ownerOf(collateralId), creator);
        });

        it('Try deposit an amount in a collateral without approval of the token collateral', async function () {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1000');
            const liquidationRatio = bn('15000');
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
                Helper.address0x,
                liquidationRatio,
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

    describe('Functional test', function () {
        it('Test C0', cTest(11000, 310, 930, 0.40));
        // it('Test C1', cTest(15000, 200, 600, 0.45));
        // it('Test C2', cTest(15000, 310, 930, 0.45));
        // it('Test C3', cTest(15000, 310, 930, 0.466));
        it('Test C4', cTest(15000, 200, 600, 0.5));
        it('Test C5', cTest(15000, 300, 600, 0.5));
        // it('Test C6', cTest(90000, 200, 600, 0.5));
        it('Test C7', cTest(15000, 310, 600, 0.5));
        it('Test C8', cTest(15000, 200, 201, 1));
        it('Test C9', cTest(15000, 200, 200, 1));
        it('Test C10', cTest(15000, 100, 140, 1));
        it('Test C11', cTest(15000, 100, 140, 1.1));
        it('Test C12', cTest(15000, 310, 930, 2));
        it('Test C13', cTest(15000, 200, 450, 2));
        it('Test C14', cTest(15000, 200, 201, 2));

        function cTest (ratioLimit, debtRCN, collateralAmount, collateralToTokenRate) {
            return async () => {
                function min (x, y, z) {
                    if (x.cmp(y) === -1 && x.cmp(z) === -1) {
                        return x;
                    } else {
                        return y.cmp(z) === -1 ? y : x;
                    }
                }

                function divceil (x, y) {
                    if (x.mod(y).cmp(bn('0')) === 0) {
                        return x.div(y);
                    } else {
                        return x.div(y).add(bn('1'));
                    }
                }

                ratioLimit = bn(ratioLimit.toString());
                debtRCN = bn(debtRCN.toString());
                collateralAmount = bn(collateralAmount.toString());

                const tokenToCollateralRate = bn(Math.round(10000 / collateralToTokenRate).toString()).mul(WEI).div(BASE);
                await converter.setRate(rcn.address, auxToken.address, tokenToCollateralRate);

                collateralToTokenRate = bn((collateralToTokenRate * 10000).toString()).mul(WEI).div(BASE);
                await converter.setRate(auxToken.address, rcn.address, collateralToTokenRate);

                const collateralInToken = await converter.getReturn(auxToken.address, rcn.address, collateralAmount);
                const collateralRatio = divceil(collateralInToken.mul(BASE), debtRCN);
                const deltaRatio = collateralRatio.sub(ratioLimit);
                const canWithdraw = divceil(collateralAmount.mul(deltaRatio), collateralRatio);

                async function calcRequiredCollateralPay () {
                    if (canWithdraw.cmp(bn('0')) === -1) {
                        return min(
                            divceil(canWithdraw.abs().mul(BASE), ratioLimit.sub(BASE)),
                            collateralAmount,
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
                const newCollateralInToken = collateralInToken.sub(requiredTokenPay);
                const newCollateralRatio = newDebt.isZero() ? null : divceil(newCollateralInToken.mul(BASE), newDebt);
                const collateralized = newCollateralRatio === null ? true : newCollateralRatio.cmp(ratioLimit) !== -1;

                const salt = bn(web3.utils.randomHex(32));
                const loanDuration = 100;
                const expiration = (await Helper.getBlockTime()) + loanDuration;

                const loanData = await model.encodeData(debtRCN, expiration);

                const loanId = await getId(loanManager.requestLoan(
                    debtRCN,           // Amount
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
                    ratioLimit,
                    { from: creator }
                );
                await rcn.setBalance(creator, debtRCN);
                await rcn.approve(loanManager.address, debtRCN, { from: creator });

                await loanManager.lend(
                    loanId,
                    [],
                    collateral.address,
                    bn('0'),
                    Helper.toBytes32(collateralId),
                    { from: creator }
                );

                expect(await converter.getReturn(auxToken.address, rcn.address, collateralAmount)).to.eq.BN(collateralInToken);

                expect(await collateral.collateralInTokens(collateralId)).to.eq.BN(collateralInToken);
                expect(await collateral.valueCollateralToTokens(collateralId, collateralAmount)).to.eq.BN(collateralInToken);

                const _collateralRatio = await collateral.collateralRatio(collateralId, bn('0'), bn('0'));

                expect(_collateralRatio).to.eq.BN(collateralRatio);

                const _deltaRatio = await collateral.deltaRatio(collateralId, bn('0'), bn('0'));
                expect(_deltaRatio).to.eq.BN(deltaRatio);

                const _canWithdraw = await collateral.canWithdraw(collateralId, bn('0'), bn('0'));
                expect(_canWithdraw).to.eq.BN(canWithdraw);

                const _collateralToPay = await collateral.collateralToPay(collateralId, bn('0'), bn('0'));
                expect(_collateralToPay).to.eq.BN(requiredCollateralPay);

                const _tokensToPay = await collateral.tokensToPay(collateralId, bn('0'), bn('0'));
                expect(_tokensToPay).to.eq.BN(requiredTokenPay);

                await auxToken.setBalance(converter.address, bn('0'));
                await rcn.setBalance(converter.address, _collateralToPay);

                await collateral.claim(loanManager.address, loanId, []);

                const _newDebt = await model.getClosingObligation(loanId);
                expect(_newDebt).to.eq.BN(newDebt);

                const _newCollateral = (await collateral.entries(collateralId)).amount;
                expect(_newCollateral).to.eq.BN(newCollateral);

                const _newCollateralInToken = await collateral.collateralInTokens(collateralId);
                expect(_newCollateralInToken).to.eq.BN(newCollateralInToken);

                if (newDebt.isZero()) {
                    assert.isNull(newCollateralRatio);
                    assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
                } else {
                    expect(await collateral.collateralRatio(collateralId, bn('0'), bn('0'))).to.eq.BN(newCollateralRatio);
                    assert.equal(newCollateralRatio.cmp(ratioLimit) !== -1, collateralized);

                    assert.isFalse((await model.getStatus.call(loanId)).toString() === '2');
                    // if haves collateral the newCollateralRatio should be more or equal than ratioLimit
                    if (!_newCollateral.isZero()) {
                        assert.isTrue(newCollateralRatio.cmp(ratioLimit) !== -1);
                    }
                }

                // Claim when the loan is in debt
                await Helper.increaseTime(loanDuration);

                const closingObligation = await loanManager.getClosingObligation(loanId);
                await rcn.setBalance(converter.address, bn(closingObligation));
                await auxToken.setBalance(converter.address, bn('0'));

                await collateral.claim(loanManager.address, loanId, []);

                const newCollateralAmount = (await collateral.entries(collateralId)).amount;
                if ((await model.getStatus.call(loanId)).toString() === '2') {
                    // expect(newCollateralAmount).to.eq.BN(prevCollateralAmount.sub(closingObligationInCollateral));
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
        const ratioLimit = bn('15000');

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
            ratioLimit,
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
            ratioLimit,
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
        const ratioLimit = bn('15000');

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
            ratioLimit,
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

        let calcDeltaRatio = calcCollateralRatio.sub(ratioLimit);
        expect(await collateral.deltaRatio(
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

        calcDeltaRatio = calcCollateralRatio.sub(ratioLimit);
        expect(await collateral.deltaRatio(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio.sub(ratioLimit));

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
        const ratioLimit = bn('15000');

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
            ratioLimit,
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

        let calcDeltaRatio = calcCollateralRatio.sub(ratioLimit);
        expect(await collateral.deltaRatio(
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

        calcDeltaRatio = calcCollateralRatio.sub(ratioLimit);
        expect(await collateral.deltaRatio(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCollateralRatio.sub(ratioLimit));

        calcCanWithdraw = collateralAmount.mul(calcDeltaRatio).div(calcCollateralRatio);
        expect(await collateral.canWithdraw(
            collateralId,
            rateTokens,
            rateEquivalent
        )).to.eq.BN(calcCanWithdraw);
    });
});
