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
        it('Test C0', cTest(0, bn('15000'), bn('200'), bn('600'), bn('5000')));
        it('Test C1', cTest(1, bn('15000'), bn('200'), bn('450'), bn('20000')));
        // Round off error on convert token
        // it('Test C2', cTest(2, bn('15000'), bn('200'), bn('600'), bn('4500')));
        it('Test C3', cTest(3, bn('15000'), bn('300'), bn('600'), bn('5000')));
        it('Test C4', cTest(4, bn('90000'), bn('200'), bn('600'), bn('5000')));
        it('Test C5', cTest(5, bn('15000'), bn('200'), bn('201'), bn('10000')));
        it('Test C6', cTest(6, bn('15000'), bn('200'), bn('201'), bn('20000')));
        it('Test C7', cTest(7, bn('15000'), bn('200'), bn('201'), bn('20000')));
        it('Test C8', cTest(8, bn('15000'), bn('310'), bn('600'), bn('5000')));
        it('Test C9', cTest(9, bn('15000'), bn('310'), bn('930'), bn('20000')));
        it('Test C10', cTest(10, bn('15000'), bn('310'), bn('930'), bn('4000')));

        const expectResult = {
            collateralInRCN: [300, 900, 270, 300, 300, 201, 402, 402, 300, 1860, 372].map(x => bn(x.toString())),
            collateralRatio: [15000, 45000, 13500, 10000, 15000, 10050, 20100, 20100, 9677, 60000, 12000].map(x => bn(x.toString())),
            deltaRatio: [0, 30000, -1500, -5000, -75000, -4950, 5100, 5100, -5323, 45000, -3000].map(x => bn(x.toString())),
            canWithdraw: [0, 300, -66, -300, -3000, -99, 51, 51, -330, 697, -232].map(x => bn(x.toString())),
            requiredCollateralPay: [0, 0, 148, 600, 376, 200, 0, 0, 600, 0, 480].map(x => bn(x.toString())),
            requiredRCNPay: [0, 0, 66, 300, 188, 200, 0, 0, 300, 0, 192].map(x => bn(x.toString())),
            debtAfterPay: [200, 200, 134, 0, 12, 0, 200, 200, 10, 310, 118].map(x => bn(x.toString())),
            collateralAfterPay: [600, 450, 452, 0, 224, 1, 201, 201, 0, 930, 450].map(x => bn(x.toString())),
            newCollateralValue: [300, 900, 203, 0, 112, 1, 402, 402, 0, 1860, 180].map(x => bn(x.toString())),
            newCollateralRatio: [15000, 45000, 15149, null, 93333, null, 20100, 20100, 0, 60000, 15254].map(x => { if (x != null) return bn(x.toString()); return x; }),
            collateralized: [true, true, true, true, true, true, true, true, false, true, true],
            paid: [false, false, false, true, false, true, false, false, false, false, false],
        };

        function cTest (i, ratioLimit, debtRCN, collateralAmount, collateralRate) {
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

                collateralRate = collateralRate.mul(bn('10').pow(bn('18'))).div(bn('10000'));
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

                expect(await converter.getReturn(rcn.address, auxToken.address, collateralAmount)).to.eq.BN(expectResult.collateralInRCN[i]);

                expect(await collateral.callateralInTokens(collateralId)).to.eq.BN(expectResult.collateralInRCN[i]);
                expect(await collateral.valueCollateralToTokens(collateralId, collateralAmount)).to.eq.BN(expectResult.collateralInRCN[i]);

                const _collateralRatio = await collateral.collateralRatio(collateralId, bn('0'), bn('0'));
                expect(_collateralRatio).to.eq.BN(expectResult.collateralRatio[i]);

                const _deltaRatio = await collateral.deltaRatio(collateralId, bn('0'), bn('0'));
                expect(_deltaRatio).to.eq.BN(expectResult.deltaRatio[i]);

                const _canWithdraw = await collateral.canWithdraw(collateralId, bn('0'), bn('0'));
                expect(_canWithdraw).to.eq.BN(expectResult.canWithdraw[i]);

                const _collateralToPay = await collateral.collateralToPay(collateralId, bn('0'), bn('0'));
                expect(_collateralToPay).to.eq.BN(expectResult.requiredCollateralPay[i]);

                const _tokensToPay = await collateral.tokensToPay(collateralId, bn('0'), bn('0'));
                expect(_tokensToPay).to.eq.BN(expectResult.requiredRCNPay[i]);

                await auxToken.setBalance(converter.address, bn('0'));
                await rcn.setBalance(converter.address, bn('0'));
                await rcn.setBalance(converter.address, _collateralToPay);

                await collateral.claim(loanManager.address, loanId, []);

                const _debtAfterPay = await model.getClosingObligation(loanId);
                expect(_debtAfterPay).to.eq.BN(expectResult.debtAfterPay[i]);

                const _collateralAfterPay = (await collateral.entries(collateralId)).amount;
                expect(_collateralAfterPay).to.eq.BN(expectResult.collateralAfterPay[i]);

                const _newCollateralValue = await collateral.callateralInTokens(collateralId);
                expect(_newCollateralValue).to.eq.BN(expectResult.newCollateralValue[i]);

                const paid = (await model.getStatus.call(loanId)).toString() === '2';
                assert.equal(paid, expectResult.paid[i]);
                if (paid) {
                    assert.equal(null, expectResult.newCollateralRatio[i]);
                    assert.equal(true, expectResult.collateralized[i]);
                } else {
                    const _newCollateralRatio = await collateral.collateralRatio(collateralId, bn('0'), bn('0'));
                    expect(_newCollateralRatio).to.eq.BN(expectResult.newCollateralRatio[i]);
                    const _collateralized = _newCollateralRatio >= ratioLimit;
                    assert.equal(_collateralized, expectResult.collateralized[i]);
                }
            };
        };
    });
});
