const Collateral = artifacts.require('./core/diaspore/cosigner/Collateral.sol');
const TestModel = artifacts.require('./test_utils/diaspore/TestModel.sol');
const LoanManager = artifacts.require('./core/diaspore/LoanManager.sol');
const DebtEngine = artifacts.require('./core/diaspore/DebtEngine.sol');
const TestToken = artifacts.require('./test_utils/TestToken.sol');

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

        it('Try create a new collateral with a closed loan', async function () {
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
});
