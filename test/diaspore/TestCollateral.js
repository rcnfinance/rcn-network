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

contract('Test Collateral cosigner Diaspore', function (accounts) {
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
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        loanManager = await LoanManager.new(debtEngine.address);
        model = await TestModel.new();
        await model.setEngine(debtEngine.address);
        collateral = await Collateral.new();
        auxToken = await TestToken.new();
        converter = await TestConverter.new();
    });

    describe('Function create', function () {
        it('Should create a new collateral', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('2');
            const amount = bn('1000');
            const collateralAmount = bn('1000');
            const liquidationRatio = bn('150');
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
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('3');
            const amount = bn('1000');
            const collateralAmount = bn('0');
            const liquidationRatio = bn('150');
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
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('4');
            const amount = bn('1000');
            const collateralAmount = bn('1');
            const liquidationRatio = bn('150');
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

    describe('Functional test', function () {
        it('Test C0', cTest(0, 15000, 200, 600, 5000));
        it('Test C1', cTest(1, 15000, 200, 450, 20000));
        it('Test C2', cTest(2, 15000, 200, 600, 4500));
        it('Test C3', cTest(3, 15000, 300, 600, 5000));
        it('Test C4', cTest(4, 90000, 200, 600, 5000));
        it('Test C5', cTest(5, 15000, 200, 201, 10000));
        it('Test C6', cTest(6, 15000, 200, 201, 20000));
        it('Test C7', cTest(7, 15000, 310, 600, 5000));
        it('Test C8', cTest(8, 15000, 310, 930, 20000));
        it('Test C9', cTest(9, 15000, 310, 930, 4000));
        it('Test C10', cTest(10, 5000, 310, 930, 4666));

        it('Test C11', cTest(11, 15000, 310, 930, 4500));

        function cTest (i, ratioLimit, debtRCN, collateralAmount, collateralRate) {
            const WEI = bn('10').pow(bn('18'));
            const BASE = bn('10000');
            const ROUND_OFF_ERROR = bn('8');

            ratioLimit = bn(ratioLimit.toString());
            debtRCN = bn(debtRCN.toString());
            collateralAmount = bn(collateralAmount.toString());
            collateralRate = bn(collateralRate.toString()).mul(WEI).div(BASE);

            function requiredCollateralPay (canWithdraw) {
                function min (x, y) {
                    return x.cmp(y) === -1 ? x : y;
                }

                return min(
                    min(
                        canWithdraw.isNeg() ? canWithdraw.abs().add(ROUND_OFF_ERROR).mul(BASE).div(ratioLimit.sub(BASE)) : bn('0'),
                        collateralAmount
                    ),
                    debtRCN.mul(WEI).div(collateralRate)
                );
            }

            function newCollateralRatio (debtAfterPay, newCollateralValue) {
                return debtAfterPay.isZero() ? null : newCollateralValue.mul(BASE).div(debtAfterPay);
            }

            function collateralized (debtAfterPay, newCollateralValue) {
                const _newCollateralRatio = newCollateralRatio(debtAfterPay, newCollateralValue);
                return _newCollateralRatio === null ? true : _newCollateralRatio.cmp(ratioLimit) !== -1;
            }

            function collateralAfterPay (requiredRCNPay, canWithdraw) {
                const aux = collateralAmount.sub(requiredCollateralPay(canWithdraw));
                // For round off error when convert token
                return requiredCollateralPay(canWithdraw).mul(collateralRate).mod(WEI).isZero() ? aux : aux.add(bn('2'));
            }

            const collateralInRCN = collateralRate.mul(collateralAmount).div(WEI);
            const collateralRatio = collateralInRCN.mul(BASE).div(debtRCN);
            const deltaRatio = collateralRatio.sub(ratioLimit);
            const canWithdraw = collateralAmount.mul(deltaRatio).div(collateralRatio);
            const requiredRCNPay = requiredCollateralPay(canWithdraw).mul(collateralRate).div(WEI);
            const debtAfterPay = debtRCN.sub(requiredRCNPay);
            const newCollateralValue = collateralAfterPay(requiredRCNPay, canWithdraw).mul(collateralRate).div(WEI);

            return async () => {
                const creator = accounts[1];
                const borrower = accounts[2];
                const salt = bn('959595').add(bn(i.toString()));
                const expiration = (await Helper.getBlockTime()) + 1000;

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

                await converter.setCollateralRate(collateralRate);
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

                expect(await converter.getReturn(rcn.address, auxToken.address, collateralAmount)).to.eq.BN(collateralInRCN);

                expect(await collateral.callateralInTokens(collateralId)).to.eq.BN(collateralInRCN);
                expect(await collateral.valueCollateralToTokens(collateralId, collateralAmount)).to.eq.BN(collateralInRCN);

                const _collateralRatio = await collateral.collateralRatio(collateralId, bn('0'), bn('0'));
                expect(_collateralRatio).to.eq.BN(collateralRatio);

                const _deltaRatio = await collateral.deltaRatio(collateralId, bn('0'), bn('0'));
                expect(_deltaRatio).to.eq.BN(deltaRatio);

                const _canWithdraw = await collateral.canWithdraw(collateralId, bn('0'), bn('0'));
                expect(_canWithdraw).to.eq.BN(canWithdraw);

                const _collateralToPay = await collateral.collateralToPay(collateralId, bn('0'), bn('0'));
                expect(_collateralToPay).to.eq.BN(requiredCollateralPay(canWithdraw));

                const _tokensToPay = await collateral.tokensToPay(collateralId, bn('0'), bn('0'));
                expect(_tokensToPay).to.eq.BN(requiredRCNPay);

                await auxToken.setBalance(converter.address, bn('0'));
                await rcn.setBalance(converter.address, bn('0'));
                await rcn.setBalance(converter.address, _collateralToPay);

                await collateral.claim(loanManager.address, loanId, []);

                const _debtAfterPay = await model.getClosingObligation(loanId);
                expect(_debtAfterPay).to.eq.BN(debtAfterPay);

                const _collateralAfterPay = (await collateral.entries(collateralId)).amount;
                expect(_collateralAfterPay).to.eq.BN(collateralAfterPay(requiredRCNPay, canWithdraw));

                const _newCollateralValue = await collateral.callateralInTokens(collateralId);
                expect(_newCollateralValue).to.eq.BN(newCollateralValue);

                if (debtAfterPay.isZero()) {
                    assert.isNull(newCollateralRatio(debtAfterPay, newCollateralValue));
                    assert.isTrue((await model.getStatus.call(loanId)).toString() === '2');
                } else {
                    expect(await collateral.collateralRatio(collateralId, bn('0'), bn('0'))).to.eq.BN(newCollateralRatio(debtAfterPay, newCollateralValue));
                    assert.equal(newCollateralRatio(debtAfterPay, newCollateralValue).cmp(ratioLimit) !== -1, collateralized(debtAfterPay, newCollateralValue));

                    assert.isFalse((await model.getStatus.call(loanId)).toString() === '2');
                }
            };
        };
    });
});
