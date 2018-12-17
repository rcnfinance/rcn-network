const NanoLoanEngine = artifacts.require('./basalt/NanoLoanEngine.sol');

const Bundle = artifacts.require('./diaspore/cosigner/pawn/Bundle.sol');
const Poach = artifacts.require('./diaspore/cosigner/pawn/Poach.sol');
const PawnManager = artifacts.require('./diaspore/cosigner/pawn/PawnManager.sol');

const TestToken = artifacts.require('./diaspore/utils/test/TestModel.sol');
const TestERC721 = artifacts.require('./utils/test/TestERC721.sol');

const Helper = require('./../../Helper.js');
const BigNumber = web3.BigNumber;
const precision = new BigNumber(10 ** 18);
const Status = Object.freeze({ 'Pending': 0, 'Initial': 0, 'Ongoing': 1, 'Lent': 1, 'Canceled': 2, 'Paid': 3, 'Defaulted': 4, 'Destroyed': 4 });

const ethAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ethAmount = new BigNumber(50).times(precision);
// Contracts
let bundle;
let poach;
let rcnEngine;
let pawnManager;
// ERC20 contacts
let rcn;
let pepeCoin;
// ERC721 contacts
let pokemons;
let zombies;
let magicCards;
// ERC721 ids
// pokemons
const ratata = 19;
const pikachu = 25;
const clefairy = 35;
const vulpix = 37;
const mewtwo = 150;
// zombies
const michaelJackson = 9953121564;
const theFirst = 0;
// magic cards
const blackDragon = 56153153;
const ent = 12312313;
const orc = 6516551;

// Accounts
let borrower;
let borrowerHelper;
let lender;
let otherUser;

// common variables
const loanDuration = 6 * 30 * 24 * 60 * 60;
const closeTime = 24 * 60 * 60;
const expirationRequest = Helper.now() + (30 * 24 * 60 * 60);// now plus a month

const loanParams = [
    web3.toWei(199),                         // Amount requested
    Helper.toInterestRate(20, loanDuration), // Anual interest
    Helper.toInterestRate(30, loanDuration), // Anual punnitory interest
    loanDuration,                            // Duration of the loan, in seconds
    closeTime,                               // Time when the payment of the loan starts
    expirationRequest,                        // Expiration timestamp of the request
];

const loanMetadata = '#pawn';

let tokens;
let amounts;
let erc721s;
let ids;
let customLoanId;
let customPawnId;

contract('TestPawnManager', function (accounts) {
    before('Assign accounts', async function () {
        // set account addresses
        borrower = accounts[1];
        borrowerHelper = accounts[2];
        lender = accounts[3];
        otherUser = accounts[4];
    });

    beforeEach('Create contracts and set standard escenary', async function () {
        // deploy contracts
        // ERC20
        rcn = await TestToken.new();
        await rcn.createTokens(lender, web3.toWei(99999999));
        await rcn.createTokens(borrowerHelper, web3.toWei(99999999));
        pepeCoin = await TestToken.new();
        await pepeCoin.createTokens(borrower, web3.toWei(15));
        // ERC721
        pokemons = await TestERC721.new();
        await pokemons.addNtf('ratata', ratata, lender);
        await pokemons.addNtf('pikachu', pikachu, borrower);
        await pokemons.addNtf('clefairy', clefairy, borrower);
        await pokemons.addNtf('vulpix', vulpix, borrower);
        await pokemons.addNtf('mewtwo', mewtwo, borrower);
        zombies = await TestERC721.new();
        await zombies.addNtf('michaelJackson', michaelJackson, borrower);
        await zombies.addNtf('theFirst', theFirst, borrower);
        magicCards = await TestERC721.new();
        await magicCards.addNtf('blackDragon', blackDragon, borrower);
        await magicCards.addNtf('ent', ent, borrower);
        await magicCards.addNtf('orc', orc, borrower);

        bundle = await Bundle.new();
        poach = await Poach.new();
        rcnEngine = await NanoLoanEngine.new(rcn.address);
        pawnManager = await PawnManager.new(rcnEngine.address, bundle.address, poach.address);
        //
        // create custom loan with a pawn
        //
        tokens = [pepeCoin.address, ethAddress];
        amounts = [web3.toWei(1), ethAmount.toString()];
        erc721s = [pokemons.address];
        ids = [pikachu];
        // approves
        await pepeCoin.approve(pawnManager.address, amounts[0], { from: borrower });
        await pokemons.approve(pawnManager.address, ids[0], { from: borrower });
        // Retrieve the loan signature
        const loanIdentifier = await rcnEngine.buildIdentifier(
            0x0,                  // Contract of the oracle
            borrower,             // Borrower of the loan (caller of this method)
            pawnManager.address,  // Creator of the loan, the pawn creator
            0x0,                  // Currency of the loan, RCN
            loanParams[0],        // Request amount
            loanParams[1],        // Interest rate
            loanParams[2],        // Punnitory interest rate
            loanParams[3],        // Duration of the loan
            loanParams[4],        // Borrower can pay the loan at 1 day
            loanParams[5],        // Pawn request expires
            loanMetadata          // Metadata
        );
        // Sign the loan
        const approveSignature = await web3.eth.sign(borrower, loanIdentifier).slice(2);
        const r = `0x${approveSignature.slice(0, 64)}`;
        const s = `0x${approveSignature.slice(64, 128)}`;
        const v = web3.toDecimal(approveSignature.slice(128, 130)) + 27;
        // Request a Pawn
        const pawnReceipt = await pawnManager.requestPawn(
            0x0,
            0x0,
            loanParams,   // Configuration of the loan request
            loanMetadata, // Metadata of the loan
            v,            // Signature of the loan
            r,            // Signature of the loan
            s,            // Signature of the loan
            // ERC20
            tokens,       // Array of ERC20 addresses
            amounts,      // Array of ERC20 amounts
            // ERC721
            erc721s,      // Array of ERC721 addresses
            ids,          // Array of ERC721 ids
            { from: borrower, value: ethAmount.toString() }
        );
        customLoanId = pawnReceipt.logs[pawnReceipt.logs.length - 1].args.loanId;
        customPawnId = pawnReceipt.logs[pawnReceipt.logs.length - 1].args.pawnId;
    });

    it('test: create a pawn with only erc20', async () => {
        // create a loan
        const loanReceipt = await rcnEngine.createLoan(0x0, borrower, 0x0, web3.toWei(90), loanParams[1], loanParams[2], loanParams[3], loanParams[4], loanParams[5], loanMetadata, { from: borrower });
        const loanId = loanReceipt.logs[0].args._index;

        await pepeCoin.approve(pawnManager.address, web3.toWei(1), { from: borrower });
        const tokens = [pepeCoin.address];
        const amounts = [web3.toWei(1)];
        const erc721s = [];
        const ids = [];

        const pawnReceipt = await pawnManager.requestPawnId(rcnEngine.address, loanId, tokens, amounts, erc721s, ids, { from: borrower });
        const pawnId = pawnReceipt.logs[pawnReceipt.logs.length - 1].args.pawnId;

        assert.equal((await pawnManager.getPawnStatus(pawnId)).toNumber(), Status.Pending);
        assert.equal((await rcnEngine.getStatus(loanId)).toNumber(), Status.Initial);

        const packageId = await pawnManager.getPawnPackageId(pawnId);
        assert.equal((await bundle.content(packageId))[0][0], poach.address);
        const poachId = (await bundle.content(packageId))[1][0];
        const pair = await poach.getPair(poachId);
        assert.equal(pair[0], pepeCoin.address);
        assert.equal(pair[1], amounts[0]);
        assert.equal(pair[2], true);
    });

    it('test: create a pawn with only eth', async () => {
        // create a loan
        const loanReceipt = await rcnEngine.createLoan(0x0, borrower, 0x0, web3.toWei(90), loanParams[1], loanParams[2], loanParams[3], loanParams[4], loanParams[5], loanMetadata, { from: borrower });
        const loanId = loanReceipt.logs[0].args._index;
        const tokens = [ethAddress];
        const amounts = [web3.toWei(0.05)];
        const erc721s = [];
        const ids = [];

        const pawnReceipt = await pawnManager.requestPawnId(rcnEngine.address, loanId, tokens, amounts, erc721s, ids, { from: borrower, value: web3.toWei(0.05) });
        const pawnId = pawnReceipt.logs[pawnReceipt.logs.length - 1].args.pawnId;

        assert.equal((await pawnManager.getPawnStatus(pawnId)).toNumber(), Status.Pending);
        assert.equal((await rcnEngine.getStatus(loanId)).toNumber(), Status.Initial);

        const packageId = await pawnManager.getPawnPackageId(pawnId);
        assert.equal((await bundle.content(packageId))[0][0], poach.address);
        const poachId = (await bundle.content(packageId))[1][0];
        const pair = await poach.getPair(poachId);
        assert.equal(pair[0], ethAddress);
        assert.equal(pair[1], amounts[0]);
        assert.equal(pair[2], true);
    });

    it('test: create a pawn with only erc721', async () => {
        // create a loan
        const loanReceipt = await rcnEngine.createLoan(0x0, borrower, 0x0, web3.toWei(90), loanParams[1], loanParams[2], loanParams[3], loanParams[4], loanParams[5], loanMetadata, { from: borrower });
        const loanId = loanReceipt.logs[0].args._index;

        await pokemons.addNtf('dig', 99, borrower);
        await pokemons.approve(pawnManager.address, 99, { from: borrower });
        const tokens = [];
        const amounts = [];
        const erc721s = [pokemons.address];
        const ids = [99];

        const pawnReceipt = await pawnManager.requestPawnId(rcnEngine.address, loanId, tokens, amounts, erc721s, ids, { from: borrower });
        const pawnId = pawnReceipt.logs[pawnReceipt.logs.length - 1].args.pawnId;

        assert.equal((await pawnManager.getPawnStatus(pawnId)).toNumber(), Status.Pending);
        assert.equal((await rcnEngine.getStatus(loanId)).toNumber(), Status.Initial);
        const packageId = await pawnManager.getPawnPackageId(pawnId);
        assert.equal((await bundle.content(packageId))[0], pokemons.address);
        assert.equal((await bundle.content(packageId))[1], 99);
    });

    it('test: create a pawn and cancel', async () => {
        const packageId = await pawnManager.getPawnPackageId(customPawnId);
        let pawnPackage = await bundle.content(packageId);
        const poachId = pawnPackage[1][0];
        const poachEthId = pawnPackage[1][1];

        assert.equal(await poach.ownerOf(poachId), bundle.address);
        assert.equal(await poach.ownerOf(poachEthId), bundle.address);
        assert.equal(await bundle.ownerOf(packageId), pawnManager.address);
        assert.equal((await pawnManager.getLiability(rcnEngine.address, customLoanId)).toNumber(), customPawnId.toNumber());
        assert.equal(await pawnManager.ownerOf(customPawnId), 0x0);
        assert.equal(await pawnManager.getPawnOwner(customPawnId), borrower);
        assert.equal(await pawnManager.getPawnEngine(customPawnId), rcnEngine.address);
        assert.equal((await pawnManager.getPawnLoanId(customPawnId)).toNumber(), customLoanId);
        assert.equal((await pawnManager.getPawnPackageId(customPawnId)).toNumber(), customPawnId);
        assert.equal((await pawnManager.getPawnStatus(customPawnId)).toNumber(), Status.Pending);

        assert.equal(pawnPackage[0][0], poach.address);
        assert.equal(pawnPackage[0][1], poach.address);

        let pair = await poach.getPair(poachId);
        assert.equal(pair[0], tokens[0]);
        assert.equal(pair[1], amounts[0]);
        assert.equal(pair[2], true);
        let pairEth = await poach.getPair(poachEthId);
        assert.equal(pairEth[0], tokens[1]);
        assert.equal(pairEth[1], amounts[1]);
        assert.equal(pairEth[2], true);

        assert.equal(pawnPackage[0][2], pokemons.address);
        assert.equal(pawnPackage[1][2], ids[0]);

        try { // Try to claim a pawn without being borrowed from lender
            await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: lender });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }
        try { // Try to claim a pawn without being borrowed from borrower
            await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        try { // Try to cancel a pawn without be the owner
            await pawnManager.cancelPawn(customPawnId, lender, true, { from: lender });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        const cancelPawnReceipt = await pawnManager.cancelPawn(customPawnId, borrower, true, { from: borrower });
        const pawnId = cancelPawnReceipt.logs[cancelPawnReceipt.logs.length - 1].args.pawnId;

        assert.equal((await pawnManager.getPawnStatus(pawnId)).toNumber(), Status.Canceled);

        assert.equal(await bundle.ownerOf(packageId), borrower);

        pawnPackage = await bundle.content(packageId);
        assert.equal(pawnPackage[0][0], poach.address);
        assert.equal(pawnPackage[1][0], poachId.toString());
        assert.equal(pawnPackage[0][1], poach.address);
        assert.equal(pawnPackage[1][1], poachEthId.toString());
        assert.equal(pawnPackage[0][2], pokemons.address);
        assert.equal(pawnPackage[1][2], ids[0]);

        await bundle.withdrawAll(packageId, borrower, { from: borrower });

        assert.equal(web3.eth.getBalance(bundle.address), 0);
        assert.equal(web3.eth.getBalance(pawnManager.address), 0);
        assert.equal(web3.eth.getBalance(poach.address).toString(), ethAmount.toString());

        const prevBal = await pepeCoin.balanceOf(borrower);
        await poach.destroy(pawnPackage[1][0], { from: borrower });
        pair = await poach.getPair(pawnPackage[1][0]);
        assert.equal(pair[1], 0);
        assert.equal(pair[2], false);
        const bal = await pepeCoin.balanceOf(borrower);
        assert.equal(bal.toString(), prevBal.plus(amounts[0]).toString());

        await poach.destroy(pawnPackage[1][1], { from: borrower });
        pairEth = await poach.getPair(pawnPackage[1][1]);
        assert.equal(pair[1], 0);
        assert.equal(pairEth[2], false);
        assert.equal(web3.eth.getBalance(poach.address).toString(), 0);

        assert.equal(await pokemons.ownerOf(pikachu), borrower);
    });

    it('test: create a pawn and cancel and withdraw', async () => {
        try { // Try to cancelPawn a pawn without be the owner
            await pawnManager.cancelPawn(customPawnId, lender, false, { from: lender });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }
        const packageId = await pawnManager.getPawnPackageId(customPawnId);
        const pawnPackage = await bundle.content(packageId);

        assert.equal(web3.eth.getBalance(poach.address).toString(), ethAmount.toString());
        const prevBal = await pepeCoin.balanceOf(borrower);
        const cancelPawnReceipt = await pawnManager.cancelPawn(customPawnId, borrower, false, { from: borrower });
        try { // try withdraw all tokens
            await bundle.withdrawAll(packageId, borrower, { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        const pawnId = cancelPawnReceipt.logs[cancelPawnReceipt.logs.length - 1].args.pawnId;

        assert.equal((await pawnManager.getPawnStatus(pawnId)).toNumber(), Status.Canceled);

        assert.equal(await bundle.ownerOf(packageId), pawnManager.address);

        const pair = await poach.getPair(pawnPackage[1][0]);
        assert.equal(pair[2], false);
        const bal = await pepeCoin.balanceOf(borrower);
        assert.equal(bal.toString(), prevBal.plus(amounts[0]).toString());

        const pairEth = await poach.getPair(pawnPackage[1][1]);
        assert.equal(pairEth[2], false);
        assert.equal(web3.eth.getBalance(pawnManager.address).toString(), 0);
        assert.equal(web3.eth.getBalance(bundle.address).toString(), 0);
        assert.equal(web3.eth.getBalance(poach.address).toString(), 0);

        assert.equal(await pokemons.ownerOf(pikachu), borrower);
    });

    it('test: request a pawn with loan identifier', async () => {
        // create a loan
        await rcnEngine.createLoan(0x0, borrower, 0x0, web3.toWei(90), loanParams[1], loanParams[2], loanParams[3], loanParams[4], loanParams[5], loanMetadata, { from: borrower });
        const loanIdentifier = await rcnEngine.buildIdentifier(0x0, borrower, borrower, 0x0, web3.toWei(90), loanParams[1], loanParams[2], loanParams[3], loanParams[4], loanParams[5], loanMetadata);

        await pokemons.addNtf('dig', 99, borrower);
        await zombies.addNtf('doctorZ', 756, borrower);
        await pokemons.approve(pawnManager.address, 99, { from: borrower });
        await zombies.approve(pawnManager.address, 756, { from: borrower });
        await pepeCoin.approve(pawnManager.address, web3.toWei(1), { from: borrower });
        const tokens = [pepeCoin.address];
        const amounts = [web3.toWei(1)];
        const erc721s = [pokemons.address, zombies.address];
        const ids = [99, 756];

        const pawnReceipt = await pawnManager.requestPawnWithLoanIdentifier(rcnEngine.address, loanIdentifier, tokens, amounts, erc721s, ids, { from: borrower });

        const loanId = pawnReceipt.logs[pawnReceipt.logs.length - 1].args.loanId;
        const pawnId = pawnReceipt.logs[pawnReceipt.logs.length - 1].args.pawnId;

        assert.equal((await pawnManager.getPawnStatus(pawnId)).toNumber(), Status.Pending);
        assert.equal((await rcnEngine.getStatus(loanId)).toNumber(), Status.Initial);
    });

    it('test: request a pawn with loan index', async () => {
        // create a loan
        const loanReceipt = await rcnEngine.createLoan(0x0, borrower, 0x0, web3.toWei(90), loanParams[1], loanParams[2], loanParams[3], loanParams[4], loanParams[5], loanMetadata, { from: borrower });
        const loanId = loanReceipt.logs[0].args._index;

        await pokemons.addNtf('dig', 99, borrower);
        await zombies.addNtf('doctorZ', 756, borrower);
        await pokemons.approve(pawnManager.address, 99, { from: borrower });
        await zombies.approve(pawnManager.address, 756, { from: borrower });
        await pepeCoin.approve(pawnManager.address, web3.toWei(1), { from: borrower });
        const tokens = [pepeCoin.address];
        const amounts = [web3.toWei(1)];
        const erc721s = [pokemons.address, zombies.address];
        const ids = [99, 756];

        const pawnReceipt = await pawnManager.requestPawnId(rcnEngine.address, loanId, tokens, amounts, erc721s, ids, { from: borrower });

        const pawnId = pawnReceipt.logs[pawnReceipt.logs.length - 1].args.pawnId;

        assert.equal((await pawnManager.getPawnStatus(pawnId)).toNumber(), Status.Pending);
        assert.equal((await rcnEngine.getStatus(loanId)).toNumber(), Status.Initial);
    });

    it('test: transfer a pawn, pay, claim and withdraw', async () => {
        const packageId = await pawnManager.getPawnPackageId(customPawnId);
        rcn.approve(rcnEngine.address, loanParams[0], { from: lender });

        try { // Try to transfer a pawn without be the owner
            await pawnManager.transferFrom(borrower, otherUser, customPawnId, { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await rcnEngine.lend(customLoanId, [], pawnManager.address, Helper.toBytes32(customPawnId), { from: lender });

        try { // Try to transfer a pawn without be the owner
            await pawnManager.transferFrom(lender, otherUser, customPawnId, { from: lender });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await pawnManager.transferFrom(borrower, otherUser, customPawnId, { from: borrower });

        assert.equal(await bundle.ownerOf(packageId), pawnManager.address);
        assert.equal(await pawnManager.ownerOf(customPawnId), otherUser);
        assert.equal(await pawnManager.getPawnOwner(customPawnId), borrower);

        await rcn.approve(rcnEngine.address, web3.toWei('250'), { from: borrowerHelper });
        await rcnEngine.pay(customLoanId, web3.toWei('250'), borrowerHelper, [], { from: borrowerHelper });

        try { // Try to claim a pawn without be the actual owner
            await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: otherUser });

        assert.equal(await pawnManager.ownerOf(packageId), 0x0);
        try { // try withdraw all tokens of a pawn without be the actual owner
            await bundle.withdrawAll(packageId, lender, { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        assert.equal(await bundle.ownerOf(packageId), otherUser);

        const pawnPackage = await bundle.content(packageId);

        await bundle.withdrawAll(packageId, borrowerHelper, { from: otherUser });

        assert.equal(await bundle.ownerOf(packageId), otherUser);

        const prevBal = await pepeCoin.balanceOf(borrowerHelper);

        await poach.destroy(pawnPackage[1][0], { from: borrowerHelper });
        const pair = await poach.getPair(pawnPackage[1][0]);
        assert.equal(pair[1], 0);
        assert.equal(pair[2], false);

        const bal = await pepeCoin.balanceOf(borrowerHelper);
        assert.equal(bal.toString(), prevBal.plus(amounts[0]).toString());

        await poach.destroy(pawnPackage[1][1], { from: borrowerHelper });
        const pairEth = await poach.getPair(pawnPackage[1][1]);
        assert.equal(pair[1], 0);
        assert.equal(pairEth[2], false);
        assert.equal(web3.eth.getBalance(poach.address).toString(), 0);

        assert.equal(await pokemons.ownerOf(pikachu), borrowerHelper);
    });

    it('test: transfer a pawn, pay, claimWithdraw', async () => {
        const packageId = await pawnManager.getPawnPackageId(customPawnId);
        rcn.approve(rcnEngine.address, loanParams[0], { from: lender });

        await rcnEngine.lend(customLoanId, [], pawnManager.address, Helper.toBytes32(customPawnId), { from: lender });

        await rcn.approve(rcnEngine.address, web3.toWei('250'), { from: borrowerHelper });
        await rcnEngine.pay(customLoanId, web3.toWei('250'), borrowerHelper, [], { from: borrowerHelper });

        try { // Try to claim a pawn without be the actual owner
            await pawnManager.claimWithdraw(rcnEngine.address, customLoanId, { from: borrowerHelper });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        assert.equal(await bundle.ownerOf(packageId), pawnManager.address);
        const pawnPackage = await bundle.content(packageId);
        assert.equal(web3.eth.getBalance(poach.address).toString(), ethAmount.toString());

        const prevBal = await pepeCoin.balanceOf(borrower);
        await pawnManager.claimWithdraw(rcnEngine.address, customLoanId, { from: borrower });

        assert.equal(await pawnManager.ownerOf(packageId), 0x0);
        try { // try withdraw all tokens
            await bundle.withdrawAll(packageId, borrower, { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        assert.equal((await pawnManager.getPawnStatus(customPawnId)).toNumber(), Status.Paid);
        assert.equal(await bundle.ownerOf(packageId), pawnManager.address);

        const pair = await poach.getPair(pawnPackage[1][0]);
        assert.equal(pair[2], false);
        const bal = await pepeCoin.balanceOf(borrower);
        assert.equal(bal.toString(), prevBal.plus(amounts[0]).toString());

        const pairEth = await poach.getPair(pawnPackage[1][1]);
        assert.equal(pairEth[2], false);
        assert.equal(web3.eth.getBalance(pawnManager.address).toString(), 0);
        assert.equal(web3.eth.getBalance(bundle.address).toString(), 0);
        assert.equal(web3.eth.getBalance(poach.address).toString(), 0);

        assert.equal(await pokemons.ownerOf(pikachu), borrower);
    });

    it('test: lend a loan with a pawn as cosigner, pay and claim (as borrower)', async () => {
        const packageId = await pawnManager.getPawnPackageId(customPawnId);
        rcn.approve(rcnEngine.address, loanParams[0], { from: lender });

        await rcnEngine.lend(customLoanId, [], pawnManager.address, Helper.toBytes32(customPawnId), { from: lender });

        assert.equal(await bundle.ownerOf(packageId), pawnManager.address);
        assert.equal(await pawnManager.ownerOf(customPawnId), borrower);
        assert.equal(await pawnManager.getPawnOwner(customPawnId), borrower);
        assert.equal(await pawnManager.getPawnEngine(customPawnId), rcnEngine.address);
        assert.equal((await pawnManager.getPawnLoanId(customPawnId)).toNumber(), customLoanId);
        assert.equal((await pawnManager.getPawnPackageId(customPawnId)).toNumber(), customPawnId);
        assert.equal((await pawnManager.getPawnStatus(customPawnId)).toNumber(), Status.Ongoing);

        try { // try a withdraw all tokens of a ongoing pawn
            await bundle.withdrawAll(packageId, otherUser, { from: otherUser });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        try { // try borrower claim pawn with ongoing loan
            await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        try { // try lender claim pawn with ongoing loan
            await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: lender });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await rcn.approve(rcnEngine.address, web3.toWei('250'), { from: borrowerHelper });
        await rcnEngine.pay(customLoanId, web3.toWei('250'), borrowerHelper, [], { from: borrowerHelper });

        try { // try lender claim pawn with paid loan
            await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: lender });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: borrower });

        try { // try claim a pawn again as borrower
            await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        assert.equal((await pawnManager.getPawnStatus(customPawnId)).toNumber(), Status.Paid);

        assert.equal(await bundle.ownerOf(packageId), borrower);

        const pawnPackage = await bundle.content(packageId);
        assert.equal(pawnPackage[0][0], poach.address);
        assert.equal(pawnPackage[0][1], poach.address);
        assert.equal(pawnPackage[0][2], pokemons.address);
        assert.equal(pawnPackage[1][2], ids[0]);

        try { // try withdraw all tokens of a defaulted pawn as lender
            await bundle.withdrawAll(packageId, lender, { from: lender });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await bundle.withdrawAll(packageId, borrower, { from: borrower });

        const prevBal = await pepeCoin.balanceOf(borrower);
        await poach.destroy(pawnPackage[1][0], { from: borrower });
        const pair = await poach.getPair(pawnPackage[1][0]);
        assert.equal(pair[1], 0);
        assert.equal(pair[2], false);
        const bal = await pepeCoin.balanceOf(borrower);
        assert.equal(bal.toString(), prevBal.plus(amounts[0]).toString());

        await poach.destroy(pawnPackage[1][1], { from: borrower });
        const pairEth = await poach.getPair(pawnPackage[1][1]);
        assert.equal(pair[1], 0);
        assert.equal(pairEth[2], false);
        assert.equal(web3.eth.getBalance(poach.address).toString(), 0);

        assert.equal(await pokemons.ownerOf(pikachu), borrower);
    });

    it('test: lend a loan with a pawn as cosigner and claim when the loan is defaulted (as lender)', async () => {
        const packageId = await pawnManager.getPawnPackageId(customPawnId);
        rcn.approve(rcnEngine.address, loanParams[0], { from: lender });

        await rcnEngine.lend(customLoanId, [], pawnManager.address, Helper.toBytes32(customPawnId), { from: lender });
        Helper.timeTravel(loanDuration);

        try { // try borrower claim pawn with paid loan
            await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await pawnManager.claim(rcnEngine.address, customLoanId, '', { from: lender });

        assert.equal((await pawnManager.getPawnStatus(customPawnId)).toNumber(), Status.Defaulted);

        assert.equal(await bundle.ownerOf(packageId), lender);

        const pawnPackage = await bundle.content(packageId);
        assert.equal(pawnPackage[0][0], poach.address);
        assert.equal(pawnPackage[0][1], poach.address);
        assert.equal(pawnPackage[0][2], pokemons.address);
        assert.equal(pawnPackage[1][2], ids[0]);

        try { // try withdraw all tokens of a defaulted pawn as borrower
            await bundle.withdrawAll(packageId, borrower, { from: borrower });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await bundle.withdrawAll(packageId, lender, { from: lender });

        const prevBal = await pepeCoin.balanceOf(lender);
        await poach.destroy(pawnPackage[1][0], { from: lender });
        const pair = await poach.getPair(pawnPackage[1][0]);
        assert.equal(pair[1], 0);
        assert.equal(pair[2], false);
        const bal = await pepeCoin.balanceOf(lender);
        assert.equal(bal.toString(), prevBal.plus(amounts[0]).toString());

        await poach.destroy(pawnPackage[1][1], { from: lender });
        const pairEth = await poach.getPair(pawnPackage[1][1]);
        assert.equal(pair[1], 0);
        assert.equal(pairEth[2], false);
        assert.equal(web3.eth.getBalance(poach.address).toString(), 0);

        assert.equal(await pokemons.ownerOf(pikachu), lender);
    });
});
