const TestToken = artifacts.require('./utils/test/TestToken.sol');
const TestERC721 = artifacts.require('./utils/test/TestERC721.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');

const LoanManager = artifacts.require('./diaspore/LoanManager.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');

const PawnManager = artifacts.require('./diaspore/cosigner/pawn/PawnManager.sol');
const Bundle = artifacts.require('./diaspore/cosigner/pawn/Bundle.sol');
const Poach = artifacts.require('./diaspore/cosigner/pawn/Poach.sol');

const Helper = require('./../../Helper.js');

const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn (number) {
    return new BN(number);
}

contract('TestBundle', function (accounts) {
    const user = accounts[1];

    let model;
    let loanManager;
    let debtEngine;
    let pawnManager;
    let bundle;
    let poach;
    let erc721;
    let erc20;

    before('Create contracts', async function () {
        erc20 = await TestToken.new();
        erc721 = await TestERC721.new();

        debtEngine = await DebtEngine.new(erc20.address);
        loanManager = await LoanManager.new(debtEngine.address);
        model = await TestModel.new();

        bundle = await Bundle.new();
        poach = await Poach.new();
        pawnManager = await PawnManager.new(loanManager.address, bundle.address, poach.address);
    });

    async function generateERC721 (_erc721, to) {
        const assetId = bn(web3.utils.randomHex(32));
        await _erc721.generate(assetId, to);
        await _erc721.approve(pawnManager.address, assetId, { from: to });
        return assetId;
    };

    describe('requestPawn function', function () {
        it('Should request pawn', async () => {
            const borrower = user;
            const creator = user;
            const salt = bn('319');
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);
            await erc20.setBalance(creator, amount);
            await erc20.approve(pawnManager.address, amount, { from: creator });

            const loanId = await loanManager.calcId(
                amount,
                borrower,
                pawnManager.address,
                model.address,
                Helper.address0x,
                salt,
                expiration,
                loanData
            );
            const signature = await web3.eth.sign(loanId, borrower);

            const erc20s = [erc20.address];
            const amounts = ['1'];
            const assetId = await generateERC721(erc721, creator);

            const erc721s = [erc721.address];
            const erc721Ids = [assetId];

            const pawnId = (await pawnManager.allTokens()).length;
            const packageId = (await bundle.allTokens()).length;

            const NewPawn = await Helper.toEvents(
                await pawnManager.requestPawn(
                    amount, // Amount
                    model.address, // Model
                    Helper.address0x, // Oracle
                    borrower, // Borrower
                    salt, // Salt
                    expiration, // Expiration
                    loanData, // Model data
                    signature, // Signature
                    erc20s, // ERC20 Tokens addresses
                    amounts, // ERC20 amounts
                    erc721s, // ERC721 Tokens addresses
                    erc721Ids, // ERC721 ids
                    { from: creator }
                ),
                'NewPawn'
            );
            expect(NewPawn._pawnId).to.eq.BN(pawnId);
            expect(NewPawn._loanId).to.eq.BN(loanId);
            expect(NewPawn._creator).to.eq.BN(borrower);
            expect(NewPawn._packageId).to.eq.BN(packageId);

            const request = await loanManager.requests(loanId);
            assert.equal(request.open, true);
            assert.equal(request.approved, true);
            expect(request.position).to.eq.BN('1');
            expect(request.expiration).to.eq.BN(expiration);
            assert.equal(await loanManager.getCurrency(loanId), 0x0);
            expect(request.amount).to.eq.BN(amount);
            assert.equal(request.cosigner, Helper.address0x);
            assert.equal(request.model, model.address);
            assert.equal(request.creator, pawnManager.address);
            assert.equal(request.oracle, Helper.address0x);
            assert.equal(request.borrower, borrower);
            expect(request.salt).to.eq.BN(salt);
            assert.equal(request.loanData, loanData);
            expect(await loanManager.getStatus(loanId)).to.eq.BN('0');
            expect(await loanManager.getDueTime(loanId)).to.eq.BN('0');
        });
    });
});
