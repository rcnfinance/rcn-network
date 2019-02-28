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

function inc (number) {
    return number.add(bn('1'));
}

function dec (number) {
    return number.sub(bn('1'));
}

async function getETHBalance (account) {
    return bn(await web3.eth.getBalance(account));
};

function toHexBytes32 (number) {
    return web3.utils.toTwosComplement(number);
};

contract('TestBundle', function (accounts) {
    const owner = accounts[0];
    const creator = accounts[1];
    const borrower = accounts[2];
    const beneficiary = accounts[3];
    const insurer = accounts[4];
    const lender = accounts[5];
    const otherAccount = accounts[9];

    let model;
    let loanManager;
    let debtEngine;
    let pawnManager;
    let bundle;
    let poach;
    let erc721;
    let erc20;

    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

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

        assert.equal(await pawnManager.loanManager(), loanManager.address);
        assert.equal(await pawnManager.bundle(), bundle.address);
        assert.equal(await pawnManager.poach(), poach.address);
        expect(await pawnManager.pawnsLength()).to.eq.BN('1');

        const pawn = await pawnManager.pawns('0');
        assert.equal(pawn.owner, Helper.address0x);
        assert.equal(pawn.loanManager, Helper.address0x);
        assert.equal(pawn.loanId, Helper.bytes320x);
        expect(pawn.packageId).to.eq.BN('0');
    });

    async function generateERC721 (_erc721, to) {
        const assetId = bn(web3.utils.randomHex(32));
        await _erc721.generate(assetId, to);
        await _erc721.approve(pawnManager.address, assetId, { from: to });
        return assetId;
    };

    describe('requestPawn and _createPackage functions', function () {
        it('Should request pawn', async () => {
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
            assert.equal(RequestedPawn._owner, creator);
            assert.equal(RequestedPawn._loanManager, loanManager.address);
            expect(RequestedPawn._packageId).to.eq.BN(packageId);

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, creator);
            assert.equal(pawn.loanManager, loanManager.address);
            assert.equal(pawn.loanId, loanId);
            expect(pawn.packageId).to.eq.BN(packageId);

            const request = await loanManager.requests(loanId);
            assert.equal(request.open, true);
            assert.equal(request.approved, true);
            expect(request.position).to.eq.BN((await loanManager.getDirectoryLength()).sub(bn('1')));
            expect(request.expiration).to.eq.BN(expiration);
            assert.equal(await loanManager.getCurrency(loanId), Helper.bytes320x);
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

        it('Try request a pawn with wrong signature', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const signature = await web3.eth.sign(web3.utils.randomHex(32), borrower);

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
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: creator }
                ),
                'Reject the approve'
            );
        });

        it('Try request a pawn and no approve the erc20 token transfer', async () => {
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
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: creator }  // Creator
                ),
                'Requested'
            ))._id;

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
            assert.equal(RequestedPawn._owner, creator);
            assert.equal(RequestedPawn._loanManager, loanManager.address);
            expect(RequestedPawn._packageId).to.eq.BN(packageId);

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, creator);
            assert.equal(pawn.loanManager, loanManager.address);
            assert.equal(pawn.loanId, loanId);
            expect(pawn.packageId).to.eq.BN(packageId);

            const request = await loanManager.requests(loanId);
            assert.equal(request.open, true);
            assert.equal(request.approved, true);
            expect(request.position).to.eq.BN((await loanManager.getDirectoryLength()).sub(bn('1')));
            expect(request.expiration).to.eq.BN(expiration);
            assert.equal(await loanManager.getCurrency(loanId), Helper.bytes320x);
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
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

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
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: creator } // Creator
                ),
                'Requested'
            ))._id;

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
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            await Helper.tryCatchRevert(
                () => pawnManager.requestPawnId(
                    loanManager.address,
                    loanId,
                    [], // ERC20 Tokens addresses
                    [], // ERC20 amounts
                    [], // ERC721 Tokens addresses
                    [], // ERC721 ids
                    { from: otherAccount }
                ),
                'The sender should be the borrower or the creator'
            );
        });

        it('Try request a pawn with a loan and the pawn was requested', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

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
                    { from: borrower }
                ),
                'The liability its taken'
            );
        });
    });

    describe('cancelPawn function', function () {
        it('Should cancel a request pawn and withdraw as a package', async () => {
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
            );

            const CanceledPawn = await Helper.toEvents(
                await pawnManager.cancelPawn(
                    pawnId,
                    beneficiary,
                    true,
                    { from: creator }
                ),
                'CanceledPawn'
            );

            expect(CanceledPawn._pawnId).to.eq.BN(pawnId);
            assert.equal(CanceledPawn._to, beneficiary);

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, Helper.address0x);
            assert.equal(pawn.loanManager, Helper.address0x);
            assert.equal(pawn.loanId, Helper.bytes320x);
            expect(pawn.packageId).to.eq.BN('0');

            expect(await pawnManager.loanToLiability(loanManager.address, loanId)).to.eq.BN('0');

            assert.equal(await bundle.ownerOf(packageId), beneficiary);
        });

        it('Should cancel a request pawn and disamble package', async () => {
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

            const pairETHId = await poach.poachesLength();
            const pairERC20Id = inc(await poach.poachesLength());

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
            );

            const prevBeneficiaryETH = await getETHBalance(beneficiary);
            const prevBeneficiaryERC20 = await erc20.balanceOf(beneficiary);

            const CanceledPawn = await Helper.toEvents(
                await pawnManager.cancelPawn(
                    pawnId,
                    beneficiary,
                    false,
                    { from: creator }
                ),
                'CanceledPawn'
            );

            expect(CanceledPawn._pawnId).to.eq.BN(pawnId);
            assert.equal(CanceledPawn._to, beneficiary);

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, Helper.address0x);
            assert.equal(pawn.loanManager, Helper.address0x);
            assert.equal(pawn.loanId, Helper.bytes320x);
            expect(pawn.packageId).to.eq.BN('0');

            expect(await pawnManager.loanToLiability(loanManager.address, loanId)).to.eq.BN('0');

            assert.equal(await bundle.ownerOf(packageId), pawnManager.address);
            assert.equal(await poach.ownerOf(pairETHId), pawnManager.address);
            assert.equal(await poach.ownerOf(pairERC20Id), pawnManager.address);

            expect(await getETHBalance(beneficiary)).to.eq.BN(inc(prevBeneficiaryETH));
            expect(await erc20.balanceOf(beneficiary)).to.eq.BN(inc(prevBeneficiaryERC20));
            assert.equal(await erc721.ownerOf(assetId), beneficiary);
        });

        it('Try cancel a pawn without ownership', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: creator } // Creator
                ),
                'Requested'
            ))._id;

            await loanManager.approveRequest(loanId, { from: borrower });

            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => pawnManager.cancelPawn(
                    pawnId,
                    beneficiary,
                    true,
                    { from: borrower }
                ),
                'Only the owner can cancel the pawn'
            );
        });

        it('Try cancel a lended pawn', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: borrower }
            );

            await erc20.setBalance(creator, '1');
            await erc20.approve(loanManager.address, '1', { from: creator });

            await loanManager.lend(
                loanId,
                [],
                pawnManager.address,
                '0',
                toHexBytes32(pawnId),
                { from: creator }
            );

            await Helper.tryCatchRevert(
                () => pawnManager.cancelPawn(
                    pawnId,
                    beneficiary,
                    true,
                    { from: borrower }
                ),
                'The pawn is take'
            );
        });

        it('Try cancel a the pawn of id 0', async () => {
            await Helper.tryCatchRevert(
                () => pawnManager.cancelPawn(
                    '0',
                    beneficiary,
                    false,
                    { from: creator }
                ),
                'Only the owner can cancel the pawn'
            );
        });
    });

    describe('requestCosign function', function () {
        it('Should lend a pawn with pawn as cosigner', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: borrower }
            );

            await erc20.setBalance(creator, '1');
            await erc20.approve(loanManager.address, '1', { from: creator });

            const tx = await loanManager.lend(
                loanId,
                [],
                pawnManager.address,
                '0',
                toHexBytes32(pawnId),
                { from: creator }
            );
            const topic = web3.utils.sha3('StartedPawn(uint256)');
            const pawnIdEmitted = tx.receipt.rawLogs.find(x => x.topics[0] === topic).data.slice(2);
            expect(pawnIdEmitted).to.eq.BN(pawnId);

            assert.equal(await pawnManager.ownerOf(pawnId), borrower);
        });

        it('Try request cosign with wrong loanManager', async () => {
            await Helper.tryCatchRevert(
                () => pawnManager.requestCosign(
                    creator,
                    Helper.bytes320x,
                    [],
                    []
                ),
                'The sender its not the LoanManager'
            );
        });

        it('Try request cosign with pawnId 0', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            await erc20.setBalance(creator, '1');
            await erc20.approve(loanManager.address, '1', { from: creator });

            await Helper.tryCatchRevert(
                () => loanManager.lend(
                    loanId,
                    [],
                    pawnManager.address,
                    '0',
                    toHexBytes32('0'),
                    { from: creator }
                ),
                'LoanManager does not match'
            );
        });

        it('Try request cosign with wrong idLoan', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: borrower }
            );

            const wrongSalt = bn(web3.utils.randomHex(32));

            const wrongLoanId = await loanManager.calcId(
                amount,
                borrower,
                borrower,
                model.address,
                Helper.address0x,
                wrongSalt,
                expiration,
                loanData
            );

            await loanManager.requestLoan(
                amount,            // Amount
                model.address,     // Model
                Helper.address0x,  // Oracle
                borrower,          // Borrower
                wrongSalt,              // salt
                expiration,        // Expiration
                loanData,          // Loan data
                { from: borrower } // Creator
            );

            await erc20.setBalance(creator, '1');
            await erc20.approve(loanManager.address, '1', { from: creator });

            await Helper.tryCatchRevert(
                () => loanManager.lend(
                    wrongLoanId,
                    [],
                    pawnManager.address,
                    '0',
                    toHexBytes32(pawnId),
                    { from: creator }
                ),
                'Loan id does not match'
            );
        });

        it('Try request cosign with canceled pawn', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            const pawnId = await pawnManager.pawnsLength();

            const assetId = await generateERC721(erc721, borrower);
            const erc721s = [erc721.address];
            const erc721Ids = [assetId];

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                erc721s, // ERC721 Tokens addresses
                erc721Ids, // ERC721 ids
                { from: borrower }
            );

            await pawnManager.cancelPawn(
                pawnId,
                beneficiary,
                false,
                { from: borrower }
            );

            await erc20.setBalance(creator, '1');
            await erc20.approve(loanManager.address, '1', { from: creator });

            await Helper.tryCatchRevert(
                () => loanManager.lend(
                    loanId,
                    [],
                    pawnManager.address,
                    '0',
                    toHexBytes32(pawnId),
                    { from: creator }
                ),
                'LoanManager does not match'
            );
        });
    });

    describe('isDefaulted function', function () {
        it('Should returns false', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            await erc20.setBalance(borrower, '1');
            await erc20.approve(loanManager.address, '1', { from: borrower });

            await loanManager.lend(
                loanId,
                [],
                Helper.address0x,
                '0',
                [],
                { from: borrower }
            );

            assert.isFalse(await pawnManager.isDefaulted(loanManager.address, loanId));
        });

        it('Should returns false(loan expired, but not lending)', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            await Helper.increaseTime((60 * 60 * 24 * 7) + 2000);

            assert.isFalse(await pawnManager.isDefaulted(loanManager.address, loanId));
        });

        it('Should returns false(loan not expired, loan lending)', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            await erc20.setBalance(borrower, '1');
            await erc20.approve(loanManager.address, '1', { from: borrower });

            await loanManager.lend(
                loanId,
                [],
                Helper.address0x,
                '0',
                [],
                { from: borrower }
            );

            assert.isFalse(await pawnManager.isDefaulted(loanManager.address, loanId));
        });

        it('Should returns true(loan expired, loan lending)', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            await erc20.setBalance(borrower, '1');
            await erc20.approve(loanManager.address, '1', { from: borrower });

            await loanManager.lend(
                loanId,
                [],
                Helper.address0x,
                '0',
                [],
                { from: borrower }
            );

            await Helper.increaseTime((60 * 60 * 24 * 7) + 2000);

            assert.isTrue(await pawnManager.isDefaulted(loanManager.address, loanId));
        });
    });

    describe('claim and _claim functions', function () {
        it('Should claim a payed pawn', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: insurer } // Creator
                ),
                'Requested'
            ))._id;
            await loanManager.approveRequest(loanId, { from: borrower });

            const packageId = await bundle.packagesLength();
            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: insurer }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(loanManager.address, '1', { from: borrower });

            await loanManager.lend(
                loanId,
                [],
                pawnManager.address,
                '0',
                toHexBytes32(pawnId),
                { from: borrower }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(debtEngine.address, '1', { from: borrower });

            await debtEngine.pay(
                loanId,
                '1',
                borrower,
                [],
                { from: borrower }
            );

            const PaidPawn = await Helper.toEvents(
                await pawnManager.claim(
                    loanManager.address,
                    loanId,
                    [],
                    { from: insurer }
                ),
                'PaidPawn'
            );

            expect(PaidPawn._pawnId).to.eq.BN(pawnId);
            assert.equal(PaidPawn._from, insurer);

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, Helper.address0x);
            assert.equal(pawn.loanManager, Helper.address0x);
            assert.equal(pawn.loanId, Helper.bytes320x);
            expect(pawn.packageId).to.eq.BN('0');

            expect(await pawnManager.loanToLiability(loanManager.address, loanId)).to.eq.BN('0');

            assert.equal(await bundle.ownerOf(packageId), insurer);
        });

        it('Should claim a defaulted pawn', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: insurer }  // Creator
                ),
                'Requested'
            ))._id;
            await loanManager.approveRequest(loanId, { from: borrower });

            const packageId = await bundle.packagesLength();
            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: insurer }
            );

            await erc20.setBalance(lender, '1');
            await erc20.approve(loanManager.address, '1', { from: lender });

            await loanManager.lend(
                loanId,
                [],
                pawnManager.address,
                '0',
                toHexBytes32(pawnId),
                { from: lender }
            );

            await Helper.increaseTime((60 * 60 * 24 * 7) + 2000);

            const DefaultedPawn = await Helper.toEvents(
                await pawnManager.claim(
                    loanManager.address,
                    loanId,
                    [],
                    { from: lender }
                ),
                'DefaultedPawn'
            );

            expect(DefaultedPawn._pawnId).to.eq.BN(pawnId);

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, Helper.address0x);
            assert.equal(pawn.loanManager, Helper.address0x);
            assert.equal(pawn.loanId, Helper.bytes320x);
            expect(pawn.packageId).to.eq.BN('0');

            expect(await pawnManager.loanToLiability(loanManager.address, loanId)).to.eq.BN('0');

            assert.equal(await bundle.ownerOf(packageId), lender);
        });

        it('Try claim a pawn, and loan its not paid or defaulted', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: insurer }  // Creator
                ),
                'Requested'
            ))._id;
            await loanManager.approveRequest(loanId, { from: borrower });

            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: insurer }
            );

            await erc20.setBalance(lender, '1');
            await erc20.approve(loanManager.address, '1', { from: lender });

            await loanManager.lend(
                loanId,
                [],
                pawnManager.address,
                '0',
                toHexBytes32(pawnId),
                { from: lender }
            );

            await Helper.tryCatchRevert(
                () => pawnManager.claim(
                    loanManager.address,
                    loanId,
                    [],
                    { from: otherAccount }
                ),
                'Pawn not defaulted/paid, or not cosgined'
            );
        });

        it('Try claim a pawn with id 0', async () => {
            await Helper.tryCatchRevert(
                () => pawnManager.claim(
                    loanManager.address,
                    Helper.bytes320x,
                    [],
                    { from: otherAccount }
                ),
                ''
            );

            await Helper.tryCatchRevert(
                () => pawnManager.claim(
                    creator,
                    Helper.bytes320x,
                    [],
                    { from: otherAccount }
                ),
                ''
            );

            await Helper.tryCatchRevert(
                () => pawnManager.claim(
                    Helper.address0x,
                    Helper.bytes320x,
                    [],
                    { from: otherAccount }
                ),
                ''
            );
        });

        it('Try claim an unexist pawn', async () => {
            await Helper.tryCatchRevert(
                () => pawnManager.claim(
                    loanManager.address,
                    web3.utils.randomHex(32),
                    [],
                    { from: otherAccount }
                ),
                'Loan manager don\'t match'
            );
        });

        it('Try claim a not cosigned pawn(defaulted loan)', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower }  // Creator
                ),
                'Requested'
            ))._id;

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: borrower }
            );

            await erc20.setBalance(lender, '1');
            await erc20.approve(loanManager.address, '1', { from: lender });

            await loanManager.lend(
                loanId,
                [],
                Helper.address0x,
                '0',
                [],
                { from: lender }
            );

            await Helper.increaseTime((60 * 60 * 24 * 7) + 2000);

            await Helper.tryCatchRevert(
                () => pawnManager.claim(
                    loanManager.address,
                    loanId,
                    [],
                    { from: lender }
                ),
                'The pawn is not take'
            );
        });

        it('Try claim a not cosigned pawn(payed loan)', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower }  // Creator
                ),
                'Requested'
            ))._id;

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: borrower }
            );

            await erc20.setBalance(lender, '1');
            await erc20.approve(loanManager.address, '1', { from: lender });

            await loanManager.lend(
                loanId,
                [],
                Helper.address0x,
                '0',
                [],
                { from: lender }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(debtEngine.address, '1', { from: borrower });

            await debtEngine.pay(
                loanId,
                '1',
                borrower,
                [],
                { from: borrower }
            );

            await Helper.tryCatchRevert(
                () => pawnManager.claim(
                    loanManager.address,
                    loanId,
                    [],
                    { from: borrower }
                ),
                'Sender not authorized'
            );
        });
    });

    describe('claimWithdraw function', function () {
        it('Should claim a pawn and withdraw all funds', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            await erc20.setBalance(borrower, '1');
            await erc20.approve(pawnManager.address, '1', { from: borrower });

            const erc20s = [ETH, erc20.address];
            const amounts = ['1', '1'];
            const assetId = await generateERC721(erc721, borrower);

            const erc721s = [erc721.address];
            const erc721Ids = [assetId];

            const pawnId = await pawnManager.pawnsLength();
            const packageId = await bundle.packagesLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                erc20s, // ERC20 Tokens addresses
                amounts, // ERC20 amounts
                erc721s, // ERC721 Tokens addresses
                erc721Ids, // ERC721 ids
                { from: borrower, value: '1' }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(loanManager.address, '1', { from: borrower });

            await loanManager.lend(
                loanId,
                [],
                pawnManager.address,
                '0',
                toHexBytes32(pawnId),
                { from: borrower }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(debtEngine.address, '1', { from: borrower });

            await debtEngine.pay(
                loanId,
                '1',
                borrower,
                [],
                { from: borrower }
            );

            const prevBorrowerETHBalance = await getETHBalance(borrower);
            const prevBorrowerERC20Balance = await erc20.balanceOf(borrower);

            const prevPoachETHBalance = await getETHBalance(poach.address);
            const prevPoachERC20Balance = await erc20.balanceOf(poach.address);

            const gasCost = (await pawnManager.claimWithdraw(
                loanManager.address,
                loanId,
                { from: borrower, gasPrice: '1' }
            )).receipt.gasUsed;

            const pawn = await pawnManager.pawns(pawnId);
            assert.equal(pawn.owner, Helper.address0x);
            assert.equal(pawn.loanManager, Helper.address0x);
            assert.equal(pawn.loanId, Helper.bytes320x);
            expect(pawn.packageId).to.eq.BN('0');

            expect(await pawnManager.loanToLiability(loanManager.address, loanId)).to.eq.BN('0');

            assert.equal(await bundle.ownerOf(packageId), pawnManager.address);

            assert.equal(await erc721.ownerOf(assetId), borrower);
            expect(await getETHBalance(borrower)).to.eq.BN(inc(prevBorrowerETHBalance).sub(bn(gasCost.toString())));
            expect(await erc20.balanceOf(borrower)).to.eq.BN(inc(prevBorrowerERC20Balance));

            expect(await getETHBalance(poach.address)).to.eq.BN(dec(prevPoachETHBalance));
            expect(await erc20.balanceOf(poach.address)).to.eq.BN(dec(prevPoachERC20Balance));
        });

        it('Try claim a pawn and withdraw and the pawn its empty', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                [], // ERC20 Tokens addresses
                [], // ERC20 amounts
                [], // ERC721 Tokens addresses
                [], // ERC721 ids
                { from: borrower }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(loanManager.address, '1', { from: borrower });

            await loanManager.lend(
                loanId,
                [],
                pawnManager.address,
                '0',
                toHexBytes32(pawnId),
                { from: borrower }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(debtEngine.address, '1', { from: borrower });

            await debtEngine.pay(
                loanId,
                '1',
                borrower,
                [],
                { from: borrower }
            );

            await Helper.tryCatchRevert(
                () => pawnManager.claimWithdraw(
                    loanManager.address,
                    loanId,
                    { from: borrower }
                ),
                'The package its empty'
            );
        });

        it('Try claim two time the same pawn', async () => {
            const salt = bn(web3.utils.randomHex(32));
            const amount = bn('1');
            const expiration = (await Helper.getBlockTime()) + 1000;
            const loanData = await model.encodeData(amount, expiration);

            const loanId = (await Helper.toEvents(
                await loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    Helper.address0x,  // Oracle
                    borrower,          // Borrower
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower } // Creator
                ),
                'Requested'
            ))._id;

            await erc20.setBalance(borrower, '1');
            await erc20.approve(pawnManager.address, '1', { from: borrower });

            const erc20s = [ETH, erc20.address];
            const amounts = ['1', '1'];
            const assetId = await generateERC721(erc721, borrower);

            const erc721s = [erc721.address];
            const erc721Ids = [assetId];

            const pawnId = await pawnManager.pawnsLength();

            await pawnManager.requestPawnId(
                loanManager.address,
                loanId,
                erc20s, // ERC20 Tokens addresses
                amounts, // ERC20 amounts
                erc721s, // ERC721 Tokens addresses
                erc721Ids, // ERC721 ids
                { from: borrower, value: '1' }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(loanManager.address, '1', { from: borrower });

            await loanManager.lend(
                loanId,
                [],
                pawnManager.address,
                '0',
                toHexBytes32(pawnId),
                { from: borrower }
            );

            await erc20.setBalance(borrower, '1');
            await erc20.approve(debtEngine.address, '1', { from: borrower });

            await debtEngine.pay(
                loanId,
                '1',
                borrower,
                [],
                { from: borrower }
            );

            await pawnManager.claim(
                loanManager.address,
                loanId,
                [],
                { from: borrower }
            );

            await Helper.tryCatchRevert(
                () => pawnManager.claimWithdraw(
                    loanManager.address,
                    loanId,
                    { from: borrower }
                ),
                'Loan manager don\'t match'
            );
        });
    });

    it('Try send ether to the pawnManager', async () => {
        await Helper.tryCatchRevert(
            () => web3.eth.sendTransaction(
                { from: creator, to: pawnManager.address, value: '1' }
            ),
            'The sender must be the poach'
        );
    });

    it('The cost should be 0', async () => {
        expect(await pawnManager.cost(Helper.address0x, Helper.bytes320x, [], [])).to.eq.BN('0');
    });

    it('Url and setUrl functions', async () => {
        assert.equal(await pawnManager.url(), '');

        const newUrl = 'https://www.testUrl.com/';

        await pawnManager.setUrl(newUrl);
        const NewUrl = await Helper.toEvents(
            await pawnManager.setUrl(
                newUrl,
                { from: owner }
            ),
            'NewUrl'
        );

        assert.equal(NewUrl._url, newUrl);

        assert.equal(await pawnManager.url(), newUrl);
    });
});
