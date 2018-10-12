const LoanCreator = artifacts.require('./diaspore/LoanCreator.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require("./utils/test/TestToken.sol");
const TestOracle = artifacts.require("./examples/TestOracle.sol");

const Helper = require('./Helper.js');
const Web3Utils = require('web3-utils');

contract('Test LoanCreator Diaspore', function(accounts) {
    let nonce = 0;
    let rcn;
    let debtEngine;
    let loanCreator;
    let testModel;
    let oracle;

    const creator = accounts[1];
    const borrower = accounts[2];
    const lender = accounts[3];

    async function getRequest(id){
        const request = await loanCreator.requests(id);
        if ( request[8] == 0x0 )
          throw new Error("Request id: " + id + " does not exists");
        return {
          open: request[0],
          approved: request[1],
          currency: request[2],
          position: request[3],
          expiration: request[4],
          amount: request[5],
          cosigner: request[6],
          model: request[7],
          creator: request[8],
          oracle: request[9],
          borrower: request[10],
          nonce: request[11],
          loanData: await loanCreator.getLoanData(id)
        }
    }

    async function positionDirectory(id){
        return (await loanCreator.getDirectory()).indexOf(id);
    }

    async function getDebt(id){
        const debt = await debtEngine.debts(id);
        if ( debt[3] == 0x0 )
          throw new Error("Debt id: " + id + " does not exists");
        return {
          error: debt[0],
          currency: debt[1],
          balance: debt[2],
          model: debt[3],
          creator: debt[4],
          oracle: debt[5]
        }
    }

    before("Create engine and model", async function(){
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        loanCreator = await LoanCreator.new(debtEngine.address);
        testModel = await TestModel.new();
        await testModel.setEngine(debtEngine.address);
        oracle = await TestOracle.new();
    });

    it("Should create a loan using requestLoan", async function() {
        const amount = 1000;
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = [ Helper.toBytes32(amount), Helper.toBytes32(expiration) ];
        const id = await loanCreator.calcFutureDebt(creator, ++nonce);
        await loanCreator.requestLoan(
            0x0,                // Currency
            amount,             // Amount
            testModel.address,  // Model
            0x0,                // Oracle
            borrower,           // Borrower
            nonce,              // Nonce
            expiration,         // Expiration
            loanData,           // Loan data
            { from: creator }   // Creator
        );

        const request = await getRequest(id);
        assert.equal(request.open, true, "The request should be open");
        assert.equal(await loanCreator.getApproved(id), false, "The request should not be approved");
        assert.equal(request.approved, false, "The request should not be approved");
        assert.equal(request.position, 0, "The loan its not approved");
        assert.equal(await loanCreator.getExpirationRequest(id), expiration);
        assert.equal(request.expiration.toNumber(), expiration);
        assert.equal(await loanCreator.getCurrency(id), 0x0);
        assert.equal(request.currency, 0x0);
        assert.equal(await loanCreator.getAmount(id), amount);
        assert.equal(request.amount, amount);
        assert.equal(await loanCreator.getCosigner(id), 0x0);
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, testModel.address);
        assert.equal(await loanCreator.getCreator(id), creator);
        assert.equal(request.creator, creator);
        assert.equal(await loanCreator.getOracle(id), 0x0);
        assert.equal(request.oracle, 0x0);
        assert.equal(await loanCreator.getBorrower(id), borrower);
        assert.equal(request.borrower, borrower);
        assert.equal(web3.toHex(request.nonce), Web3Utils.soliditySha3(creator, nonce));
        assert.equal(request.loanData[0], loanData[0]);
        assert.equal(request.loanData[1], loanData[1]);

        assert.equal(await loanCreator.canceledSettles(id), false);

        assert.equal(await loanCreator.getStatus(id), 0);
        assert.equal(await loanCreator.getDueTime(id), 0);
        // try request 2 identical loans
        Helper.tryCatchRevert(() => loanCreator.requestLoan(
            0x0,
            amount,
            testModel.address,
            0x0,
            borrower,
            nonce,
            expiration,
            loanData,
            { from: creator }
        ), "Request already exist");
        // The loan must be approved
        const newId = await loanCreator.calcFutureDebt(borrower, ++nonce);
        await loanCreator.requestLoan(
            0x0,
            amount,
            testModel.address,
            0x0,
            borrower,
            nonce,
            expiration,
            loanData,
            { from: borrower }
        );
        const newRequest = await getRequest(newId);
        assert.equal(newRequest.approved, true, "The request should be approved");
        assert.equal(await loanCreator.directory(newRequest.position), newId);
    });

    it("Should approve a request using approveRequest", async function() {
        const id = await loanCreator.calcFutureDebt(creator, ++nonce);
        await loanCreator.requestLoan( 0x0, 1000, testModel.address, 0x0, borrower, nonce, (await Helper.getBlockTime()) + 1000,
            [ Helper.toBytes32(1000), Helper.toBytes32((await Helper.getBlockTime()) + 1000) ], { from: creator }
        );
        // try approve a request without being the borrower
        Helper.tryCatchRevert(() => loanCreator.approveRequest(id, { from: creator }), "Only borrower can approve");
        // approve request
        await loanCreator.approveRequest(id, { from: borrower });

        const request = await getRequest(id);
        assert.equal(request.approved, true, "The request should be approved");
        assert.equal(request.position, await positionDirectory(id), "The loan its not approved");
        assert.equal(await loanCreator.directory(request.position), id);
    });

    it("Should lend a request using lend", async function() {
        let id = await loanCreator.calcFutureDebt(creator, ++nonce);
        await loanCreator.requestLoan(0x0, 1000, testModel.address, 0x0, borrower, nonce, (await Helper.getBlockTime()) + 1000,
            [ Helper.toBytes32(1000), Helper.toBytes32((await Helper.getBlockTime()) + 1000) ], { from: creator });
        // try lend a request without approve of the borrower
        Helper.tryCatchRevert(() => loanCreator.lend(id, [], 0x0, 0, [], { from: lender }), "The request is not approved by the borrower");
        // approve request
        await loanCreator.approveRequest(id, { from: borrower });
        await Helper.increaseTime(2000);
        // try lend a expired request
        Helper.tryCatchRevert(() => loanCreator.lend(id, [], 0x0, 0, [], { from: lender }), "The request is expired");
        // create a debt
        id = await loanCreator.calcFutureDebt(creator, ++nonce);
        const amount = 1000;
        await loanCreator.requestLoan(0x0, amount, testModel.address, 0x0, borrower, nonce, (await Helper.getBlockTime()) + 1000,
            [ Helper.toBytes32(amount), Helper.toBytes32((await Helper.getBlockTime()) + 1000) ], { from: creator });
        await loanCreator.approveRequest(id, { from: borrower });
        await rcn.approve(loanCreator.address, web3.toWei(100000), { from: accounts[9] });
        // try lend without tokens balance
        Helper.tryCatchRevert(() => loanCreator.lend(
            id, [], 0x0, 0, [], { from: accounts[9] }
        ), "Error sending tokens to borrower");
        await rcn.setBalance(lender, amount);
        await rcn.setBalance(borrower, 0);
        await rcn.approve(loanCreator.address, web3.toWei(100000), { from: lender });
        // lend
        await loanCreator.lend(
            id,                 // Index
            [],                 // OracleData
            0x0,                // Cosigner
            0,                  // Cosigner limit
            [],                 // Cosigner data
            { from: lender }    // Owner/Lender
        );
        assert.equal(await rcn.balanceOf(lender), 0, "The lender does not have to have tokens");
        assert.equal(await rcn.balanceOf(borrower), amount, "The borrower should have " + amount + " tokens");

        const debt = await getDebt(id);
        assert.equal(debt.error, false, "The debt should not have error");
        assert.equal(debt.currency, 0x0, "The debt should not have currency");
        assert.equal(debt.balance, 0, "The debt should not be balance");
        assert.equal(debt.model, testModel.address, "The model should be the testModel");
        assert.equal(debt.creator, loanCreator.address, "The creator should be the loanCreator");
        assert.equal(debt.oracle, 0x0, "The debt should not have oracle");

        assert.equal(await debtEngine.ownerOf(id), lender, "The lender should be the owner of the new ERC721");

        const request = await getRequest(id);
        assert.equal(request.loanData, 0);
        assert.equal(request.position, 0);

        // try lend a closed request
        Helper.tryCatchRevert(() => loanCreator.lend(id, [], 0x0, 0, [], { from: lender }), "Request is no longer open");
    });

    it("Should lend a request using settleLend", async function() {
        const id = await loanCreator.calcFutureDebt(creator, ++nonce);
        const amount = 1000;
        const expiration = (await Helper.getBlockTime()) + 1000;
        const requestData = [0x0, amount, testModel.address, 0x0, borrower, nonce, expiration, creator]
            .map(x => Helper.toBytes32(x));
        const loanData = [ requestData[1], requestData[6] ];

        // try settle lend with a expired data time
        const requestDataexpired = [0x0, amount, testModel.address, 0x0, borrower, nonce, expiration - 2000, creator].map(x => Helper.toBytes32(x));
        Helper.tryCatchRevert(() => loanCreator.settleLend(requestDataexpired, loanData, 0x0, 0, [], [], 0x0, 0x0),
            "Loan request is expired"
        );
        // try settle lend without borrower
        const requestDataBorrower0x0 = [0x0, amount, testModel.address, 0x0, 0x0, nonce, expiration, creator].map(x => Helper.toBytes32(x));
        Helper.tryCatchRevert(() => loanCreator.settleLend(requestDataBorrower0x0, loanData, 0x0, 0, [], [], 0x0, 0x0),
            "Borrower can't be 0x0"
        );
        // try settle lend without creator
        const requestDataCreator0x0 = [0x0, amount, testModel.address, 0x0, borrower, nonce, expiration, 0x0].map(x => Helper.toBytes32(x));
        Helper.tryCatchRevert(() => loanCreator.settleLend(requestDataCreator0x0, loanData, 0x0, 0, [], [], 0x0, 0x0),
            "Creator can't be 0x0"
        );

        const msg = await loanCreator.requestSignature(requestData, loanData);
        const creatorSig = await web3.eth.sign(creator, msg);
        const borrowerSig = await web3.eth.sign(borrower, msg);

        // try settle lend without tokens balance
        Helper.tryCatchRevert(() => loanCreator.settleLend(requestData, loanData, 0x0, 0, [], [], creatorSig, borrowerSig, { from: lender }),
            "Error sending tokens to borrower"
        );

        await rcn.setBalance(lender, amount);
        await rcn.setBalance(borrower, 0);
        await rcn.approve(loanCreator.address, web3.toWei(100000), { from: lender });

        await loanCreator.settleLend(
            requestData,     // Request data
            loanData,        // Loan data
            0x0,             // Cosigner
            0,               // Max cosigner cost
            [],              // Cosigner data
            [],              // Oracle data
            creatorSig,      // Creator signature
            borrowerSig,     // Borrower signature
            { from: lender } // Lender
        );

        const request = await getRequest(id);

        assert.equal(request.open, false, "The request should not be open");
        assert.equal(request.approved, true, "The request should be approved");
        assert.equal(request.position, 0, "The loan its not approved");
        assert.equal(request.expiration.toNumber(), expiration);
        assert.equal(request.currency, 0x0);
        assert.equal(request.amount, amount);
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, testModel.address);
        assert.equal(request.creator, creator);
        assert.equal(request.oracle, 0x0);
        assert.equal(request.borrower, borrower);
        assert.equal(web3.toHex(request.nonce), Web3Utils.soliditySha3(creator, nonce));
        assert.equal(request.loanData, 0x0);

        // try settle lend a request already exist
        Helper.tryCatchRevert(() => loanCreator.settleLend(requestData, loanData, 0x0, 0, [], [], creatorSig, borrowerSig, { from: lender }),
            "Request already exist"
        );
    });

    it("Should cancel a request using cancel", async function() {
        const amount = 1000;
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = [ Helper.toBytes32(amount), Helper.toBytes32(expiration) ];
        const id = await loanCreator.calcFutureDebt(creator, ++nonce);
        await loanCreator.requestLoan(
            0x0, amount, testModel.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }
        );
        // try cancel a request without being the borrower or the creator
        Helper.tryCatchRevert(() =>  loanCreator.cancel(id, { from: lender }), "Only borrower or creator can cancel a request");
        // creator cancel
        await loanCreator.cancel(id, { from: creator });
        let cancelRequest = await loanCreator.requests(id);
        assert.equal(cancelRequest[8], 0x0);
        assert.equal(cancelRequest[3], 0, "The loan its not approved");
        assert.equal(await loanCreator.getLoanData(id), 0x0);

        // borrower cancel
        await loanCreator.requestLoan(
            0x0, amount, testModel.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }
        );
        await loanCreator.cancel(id, { from: borrower });
        cancelRequest = await loanCreator.requests(id);
        assert.equal(cancelRequest[8], 0x0);
        assert.equal(cancelRequest[3], 0, "The loan its not approved");
        assert.equal(await loanCreator.getLoanData(id), 0x0)
    });

    it("Should cancel a request using settle cancel", async function() {
        const amount = 1000;
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = [ Helper.toBytes32(amount), Helper.toBytes32(expiration) ];
        let requestData = [0x0, amount, testModel.address, 0x0, borrower, ++nonce, expiration, creator]
            .map(x => Helper.toBytes32(x));
        await loanCreator.requestLoan(
            0x0, amount, testModel.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }
        );
        // try cancel a request without have the signature
        Helper.tryCatchRevert(() =>  loanCreator.settleCancel(requestData, loanData, { from: lender }), "Only borrower or creator can cancel a settle");
        // creator cancel
        await loanCreator.settleCancel(requestData, loanData, { from: creator });
        let signature = await loanCreator.requestSignature(requestData, loanData);
        assert.equal(await loanCreator.canceledSettles(signature), true);
        // borrower cancel
        requestData = [0x0, amount, testModel.address, 0x0, borrower, ++nonce, expiration, creator]
            .map(x => Helper.toBytes32(x));
        await loanCreator.requestLoan(
            0x0, amount, testModel.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }
        );
        await loanCreator.settleCancel(requestData, loanData, { from: borrower });
        signature = await loanCreator.requestSignature(requestData, loanData);
        assert.equal(await loanCreator.canceledSettles(signature), true);
    });
});
