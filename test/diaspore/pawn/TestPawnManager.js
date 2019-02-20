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

function dec (number) {
    return number.sub(bn('1'));
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

    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    const PENDING = 0;

    const ERC721S = 0;
    const ERC721IDS = 1;

    before('Create contracts', async function () {
        erc20 = await TestToken.new();
        erc721 = await TestERC721.new();

        debtEngine = await DebtEngine.new(erc20.address);
        loanManager = await LoanManager.new(debtEngine.address);
        model = await TestModel.new();
        await model.setEngine(debtEngine.address);

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

    describe('requestPawn and _createPackage functions', function () {
        it('Should request pawn', async () => {
            const borrower = user;
            const creator = accounts[2];
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

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

            await erc20.setBalance(creator, '1');
            await erc20.approve(pawnManager.address, '1', { from: creator });

            const erc20s = [ETH, erc20.address];
            const amounts = ['1', '1'];
            const assetId = await generateERC721(erc721, creator);

            const erc721s = [erc721.address];
            const erc721Ids = [assetId];

            const pawnId = await pawnManager.pawnsLength();
            const packageId = await bundle.packagesLength();

            const RequestedPawn = await Helper.toEvents(
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
                    { from: creator, value: '1' }
                ),
                'RequestedPawn'
            );
            expect(RequestedPawn._pawnId).to.eq.BN(pawnId);
            expect(RequestedPawn._loanId).to.eq.BN(loanId);
            expect(RequestedPawn._creator).to.eq.BN(creator);
            expect(RequestedPawn._borrower).to.eq.BN(borrower);
            expect(RequestedPawn._loanManager).to.eq.BN(loanManager.address);
            expect(RequestedPawn._packageId).to.eq.BN(packageId);

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, borrower);
            assert.equal(pawn.loanManager, loanManager.address);
            assert.equal(pawn.loanId, loanId);
            expect(pawn.packageId).to.eq.BN(packageId);
            expect(pawn.status).to.eq.BN(PENDING);

            const request = await loanManager.requests(loanId);
            assert.equal(request.open, true);
            assert.equal(request.approved, true);
            expect(request.position).to.eq.BN((await loanManager.getDirectoryLength()).sub(bn('1')));
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

            const content = await bundle.content(packageId);

            assert.equal(content[ERC721S][0], poach.address);
            const pairETHId = (await poach.poachesLength()).sub(bn('2'));
            expect(content[ERC721IDS][0]).to.eq.BN(pairETHId);
            const pairETH = await poach.poaches(pairETHId);
            assert.equal(pairETH.token, ETH);
            expect(pairETH.balance).to.eq.BN(amounts[0]);

            assert.equal(content[ERC721S][1], poach.address);
            const pairERC20Id = dec(await poach.poachesLength());
            expect(content[ERC721IDS][1]).to.eq.BN(pairERC20Id);
            const pairERC20 = await poach.poaches(pairERC20Id);
            assert.equal(pairERC20.token, erc20.address);
            expect(pairERC20.balance).to.eq.BN(amounts[1]);

            assert.equal(content[ERC721S][2], erc721.address);
            expect(content[ERC721IDS][2]).to.eq.BN(assetId);

            assert.equal(await poach.ownerOf(pairETHId), bundle.address);
            assert.equal(await poach.ownerOf(pairERC20Id), bundle.address);
            assert.equal(await bundle.ownerOf(packageId), pawnManager.address);

            expect(await pawnManager.loanToLiability(loanManager.address, loanId)).to.eq.BN(pawnId);
        });

        it('Try request a pawn with diferrent arrays lengths', async () => {
            const borrower = user;
            const creator = user;
            const salt = bn(web3.utils.randomHex(32));
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
            const amounts = [];

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawn(
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
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator }
                ),
                'The lengths must be equal'
            );

            const erc721s = [erc721.address];
            const erc721Ids = [];

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawn(
                    amount, // Amount
                    model.address, // Model
                    Helper.address0x, // Oracle
                    borrower, // Borrower
                    salt, // Salt
                    expiration, // Expiration
                    loanData, // Model data
                    signature, // Signature
                    [], // ERC20 Tokens addresses
                    [], // ERC20 amounts
                    erc721s, // ERC721 Tokens addresses
                    erc721Ids, // ERC721 ids
                    { from: creator }
                ),
                'The lengths must be equal'
            );
        });

        it('Try request a pawn and no approve the erc20 token transfer', async () => {
            const borrower = user;
            const creator = user;
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);
            await erc20.setBalance(creator, amount);
            await erc20.approve(pawnManager.address, '0', { from: creator });

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

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawn(
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
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator }
                ),
                'Error pulling tokens'
            );
        });

        it('Try request a pawn and no approve the erc721 token transfer', async () => {
            const borrower = user;
            const creator = user;
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

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

            const assetId = bn(web3.utils.randomHex(32));
            await erc721.generate(assetId, creator);

            const erc721s = [erc721.address];
            const erc721Ids = [assetId];

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawn(
                    amount, // Amount
                    model.address, // Model
                    Helper.address0x, // Oracle
                    borrower, // Borrower
                    salt, // Salt
                    expiration, // Expiration
                    loanData, // Model data
                    signature, // Signature
                    [], // ERC20 Tokens addresses
                    [], // ERC20 amounts
                    erc721s, // ERC721 Tokens addresses
                    erc721Ids, // ERC721 ids
                    { from: creator }
                ),
                'msg.sender Not authorized'
            );
        });

        it('Try request a pawn with poach in ETH and send diferrent ETH value', async () => {
            const borrower = user;
            const creator = user;
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

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

            let erc20s = [ETH];
            let amounts = ['1'];

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawn(
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
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator, value: '2' }
                ),
                'The sum of all ETH amounts and msg.value must be equal'
            );

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawn(
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
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator }
                ),
                ''
            );

            erc20s = [ETH, ETH];
            amounts = ['1', '2'];

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawn(
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
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator, value: '4' }
                ),
                ''
            );
        });
    });

    describe('requestPawnId function', function () {
        it('Should request pawn with a loan', async () => {
            const borrower = user;
            const creator = accounts[2];
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = await loanManager.calcId(
                amount,
                borrower,
                creator,
                model.address,
                Helper.address0x,
                salt,
                expiration,
                loanData
            );

            await loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: creator } // Creator
            );

            await loanManager.approveRequest(loanId, { from: borrower });

            await erc20.setBalance(creator, '1');
            await erc20.approve(pawnManager.address, '1', { from: creator });

            const erc20s = [ETH, erc20.address];
            const amounts = ['1', '1'];
            const assetId = await generateERC721(erc721, creator);

            const erc721s = [erc721.address];
            const erc721Ids = [assetId];

            const pawnId = await pawnManager.pawnsLength();
            const packageId = await bundle.packagesLength();

            const RequestedPawn = await Helper.toEvents(
                await pawnManager.requestPawnId(
                    loanManager.address,
                    loanId,
                    erc20s, // ERC20 Tokens addresses
                    amounts, // ERC20 amounts
                    erc721s, // ERC721 Tokens addresses
                    erc721Ids, // ERC721 ids
                    { from: creator, value: '1' }
                ),
                'RequestedPawn'
            );
            expect(RequestedPawn._pawnId).to.eq.BN(pawnId);
            expect(RequestedPawn._loanId).to.eq.BN(loanId);
            expect(RequestedPawn._creator).to.eq.BN(creator);
            expect(RequestedPawn._borrower).to.eq.BN(borrower);
            expect(RequestedPawn._loanManager).to.eq.BN(loanManager.address);
            expect(RequestedPawn._packageId).to.eq.BN(packageId);

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, borrower);
            assert.equal(pawn.loanManager, loanManager.address);
            assert.equal(pawn.loanId, loanId);
            expect(pawn.packageId).to.eq.BN(packageId);
            expect(pawn.status).to.eq.BN(PENDING);

            const request = await loanManager.requests(loanId);
            assert.equal(request.open, true);
            assert.equal(request.approved, true);
            expect(request.position).to.eq.BN((await loanManager.getDirectoryLength()).sub(bn('1')));
            expect(request.expiration).to.eq.BN(expiration);
            assert.equal(await loanManager.getCurrency(loanId), 0x0);
            expect(request.amount).to.eq.BN(amount);
            assert.equal(request.cosigner, Helper.address0x);
            assert.equal(request.model, model.address);
            assert.equal(request.creator, creator);
            assert.equal(request.oracle, Helper.address0x);
            assert.equal(request.borrower, borrower);
            expect(request.salt).to.eq.BN(salt);
            assert.equal(request.loanData, loanData);
            expect(await loanManager.getStatus(loanId)).to.eq.BN('0');
            expect(await loanManager.getDueTime(loanId)).to.eq.BN('0');

            const content = await bundle.content(packageId);

            assert.equal(content[ERC721S][0], poach.address);
            const pairETHId = (await poach.poachesLength()).sub(bn('2'));
            expect(content[ERC721IDS][0]).to.eq.BN(pairETHId);
            const pairETH = await poach.poaches(pairETHId);
            assert.equal(pairETH.token, ETH);
            expect(pairETH.balance).to.eq.BN(amounts[0]);

            assert.equal(content[ERC721S][1], poach.address);
            const pairERC20Id = dec(await poach.poachesLength());
            expect(content[ERC721IDS][1]).to.eq.BN(pairERC20Id);
            const pairERC20 = await poach.poaches(pairERC20Id);
            assert.equal(pairERC20.token, erc20.address);
            expect(pairERC20.balance).to.eq.BN(amounts[1]);

            assert.equal(content[ERC721S][2], erc721.address);
            expect(content[ERC721IDS][2]).to.eq.BN(assetId);

            assert.equal(await poach.ownerOf(pairETHId), bundle.address);
            assert.equal(await poach.ownerOf(pairERC20Id), bundle.address);
            assert.equal(await bundle.ownerOf(packageId), pawnManager.address);

            expect(await pawnManager.loanToLiability(loanManager.address, loanId)).to.eq.BN(pawnId);
        });

        it('Try request a pawn with a lended loan', async () => {
            const borrower = user;
            const creator = accounts[1];
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = await loanManager.calcId(
                amount,
                borrower,
                borrower,
                model.address,
                Helper.address0x,
                salt,
                expiration,
                loanData
            );

            await loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            );

            await erc20.setBalance(creator, '1');
            await erc20.approve(loanManager.address, '1', { from: creator });

            await loanManager.lend(
                loanId,
                [],
                Helper.address0x,
                '0',
                [],
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawnId(
                    loanManager.address,
                    loanId,
                    [], // ERC20 Tokens addresses
                    [], // ERC20 amounts
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator }
                ),
                'The loan request should be open'
            );
        });

        it('Try request a pawn with a unapproved loan', async () => {
            const borrower = user;
            const creator = accounts[2];
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = await loanManager.calcId(
                amount,
                borrower,
                borrower,
                model.address,
                Helper.address0x,
                salt,
                expiration,
                loanData
            );

            await loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: creator } // Creator
            );

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawnId(
                    loanManager.address,
                    loanId,
                    [], // ERC20 Tokens addresses
                    [], // ERC20 amounts
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator }
                ),
                'The loan its not approve'
            );
        });

        it('Try request a pawn with a loan without be the borrower or the creator', async () => {
            const borrower = user;
            const creator = user;
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = await loanManager.calcId(
                amount,
                borrower,
                borrower,
                model.address,
                Helper.address0x,
                salt,
                expiration,
                loanData
            );

            await loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: creator } // Creator
            );

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawnId(
                    loanManager.address,
                    loanId,
                    [], // ERC20 Tokens addresses
                    [], // ERC20 amounts
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: accounts[9] }
                ),
                'The sender should be the borrower or the creator'
            );
        });

        it('Try request a pawn with a loan and the pawn was requested', async () => {
            const borrower = user;
            const creator = user;
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = await loanManager.calcId(
                amount,
                borrower,
                borrower,
                model.address,
                Helper.address0x,
                salt,
                expiration,
                loanData
            );

            await loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                salt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: creator } // Creator
            );

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: borrower }
            );

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawnId(
                    loanManager.address,
                    loanId,
                    [], // ERC20 Tokens addresses
                    [], // ERC20 amounts
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator }
                ),
                'The liability its taken'
            );
        });
    });
});
