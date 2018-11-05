const LoanManager = artifacts.require('./diaspore/LoanManager.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require("./utils/test/TestToken.sol");
const TestCosigner = artifacts.require("./examples/TestCosigner.sol");

const Helper = require('../Helper.js');
const Web3Utils = require('web3-utils');

contract('Test LoanManager Diaspore', function(accounts) {
    let salt = 0;
    let rcn;
    let debtEngine;
    let loanManager;
    let model;
    let cosigner;
    const amount = 1000;

    const creator  = accounts[1];
    const borrower = accounts[2];
    const lender   = accounts[3];

    async function calcId(_creator, _data) {
        const _oracle = '0x0000000000000000000000000000000000000000';
        const _two = '0x02';
        const id = await loanManager.calcId( _creator, model.address, _oracle, ++salt, _data);
        const internalSalt = Web3Utils.hexToNumberString(Web3Utils.soliditySha3(_creator, salt));
        const localCalculateId = Web3Utils.soliditySha3(_two, debtEngine.address, loanManager.address,
            model.address, _oracle, internalSalt, _data);
        assert.equal(id, localCalculateId, "bug in loanManager.createId");
        return id;
    }

    function toBytes(target) {
        return target.toString().replace(new RegExp(',0x', 'g'), '');
    }

    async function getRequest(id){
        const request = await loanManager.requests(id);
        if ( request[9] == 0x0 )
          throw new Error("Request id: " + id + " does not exists");
        return {
          open:       request[0],
          approved:   request[1],
          position:   request[2],
          expiration: request[3],
          amount:     request[4],
          cosigner:   request[5],
          model:      request[6],
          creator:    request[7],
          oracle:     request[8],
          borrower:   request[9],
          salt:       request[10],
          loanData: await loanManager.getLoanData(id)
        }
    }

    async function positionDirectory(id){
        return (await loanManager.getDirectory()).indexOf(id);
    }

    async function getDebt(id){
        const debt = await debtEngine.debts(id);
        if ( debt[3] == 0x0 )
          throw new Error("Debt id: " + id + " does not exists");
        return {
          error:   debt[0],
          balance: debt[1],
          model:   debt[2],
          creator: debt[3],
          oracle:  debt[4]
        }
    }

    before("Create engine and model", async function(){
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        loanManager = await LoanManager.new(debtEngine.address);
        model = await TestModel.new();
        await model.setEngine(debtEngine.address);
        cosigner = await TestCosigner.new(rcn.address);
    });

    it("test events", async function() {
        function toEvent(tx, event) {
          return tx.logs.filter( x => x.event == event).map( x => x.args )[0];
        }

        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);

        const id = await createId(creator);

        // event Requested(bytes32 indexed _id, uint256 _nonce);
        const requested = toEvent(
            await loanManager.requestLoan(0x0, amount, model.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }),
            'Requested');
        assert.equal(requested._id, id);
        assert.equal(requested._nonce.toNumber(), nonce);

        //event Approved(bytes32 indexed _id);
        const approved = toEvent(
            await loanManager.approveRequest(id, { from: borrower }),
            'Approved');
        assert.equal(approved._id, id);

        //event Lent(bytes32 indexed _id, address _lender, uint256 _tokens);
        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const lent = toEvent(
            await loanManager.lend(id, [], 0x0, 0, [], { from: lender }),
            'Lent');
        assert.equal(lent._id, id);
        assert.equal(lent._lender, lender);
        assert.equal(lent._tokens, amount);

        //event Cosigned(bytes32 indexed _id, address _cosigner, uint256 _cost);
        const idCosign = await createId(borrower);
        const cosignAmount = 666;
        const expirationCosign = (await Helper.getBlockTime()) + 1000;
        const loanDataCosign = await model.encodeData(amount, expirationCosign);
        await loanManager.requestLoan(0x0, amount, model.address, 0x0, borrower, nonce,
            expirationCosign, loanDataCosign, { from: borrower });
        await rcn.setBalance(lender, amount + cosignAmount);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });
        const cosigned = toEvent(
            await loanManager.lend(idCosign, [], cosigner.address, 0, toBytes([ Web3Utils.soliditySha3("test_oracle"), Helper.toBytes32(cosignAmount)] ), { from: lender }),
            'Cosigned');
        assert.equal(cosigned._id, idCosign);
        assert.equal(cosigned._cosigner, cosigner.address);
        assert.equal(cosigned._cost, cosignAmount);

        //event Canceled(bytes32 indexed _id, address _canceler);
        const idCancel = await createId(borrower);
        const loanDataCancel = await model.encodeData(amount, expiration);
        await loanManager.requestLoan(0x0, amount, model.address, 0x0, borrower, nonce, expiration, loanDataCancel, { from: borrower });
        const canceled = toEvent(
            await loanManager.cancel(idCancel, { from: borrower }),
            'Canceled');
        assert.equal(canceled._id, idCancel);

        //event SettledLend(bytes32 indexed _id, bytes32 _sig, address _lender, uint256 _tokens);
        const idSettleLend = await createId(creator);
        const settleData = [0x0, amount, model.address, 0x0, borrower, nonce, expiration, creator]
            .map(x => Helper.toBytes32(x));
        const settleLoanData = await model.encodeData(settleData[1], settleData[6]);
        const msg = await loanManager.requestSignature(settleData, settleLoanData);
        const creatorSig = await web3.eth.sign(creator, msg);
        const borrowerSig = await web3.eth.sign(borrower, msg);
        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const settledLend = toEvent(
            await loanManager.settleLend(settleData, settleLoanData, 0x0, 0, [], [], creatorSig, borrowerSig, { from: lender } ),
            'SettledLend');
        assert.equal(settledLend._id, idSettleLend);
        const settleDataBytes = toBytes(settleData);
        assert.equal(settledLend._sig, Web3Utils.soliditySha3(loanManager.address, settleDataBytes, settleLoanData));
        assert.equal(settledLend._lender, lender);
        assert.equal(settledLend._tokens, amount);

        //event SettledCancel(bytes32 _sig, address _canceler);
        const idSettleCancel = await createId(creator);
        const settleDataC = [0x0, amount, model.address, 0x0, borrower, nonce, expiration, creator]
            .map(x => Helper.toBytes32(x));
        const settleLoanDataC = await model.encodeData(settleDataC[1], settleDataC[6]);
        const msgCancel = await loanManager.requestSignature(settleDataC, settleLoanDataC);
        const creatorSigC = await web3.eth.sign(creator, msgCancel);
        const borrowerSigC = await web3.eth.sign(borrower, msgCancel);
        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        await loanManager.settleLend(settleDataC, settleLoanDataC, 0x0, 0, [], [], creatorSigC, borrowerSigC, { from: lender } );
        const settledCancel = toEvent(
            await loanManager.settleCancel(settleDataC, settleLoanDataC, { from: creator } ),
            'SettledCancel');
        const settleDataBytesC = toBytes(settleDataC);
        assert.equal(settledCancel._sig, Web3Utils.soliditySha3(loanManager.address, settleDataBytesC, settleLoanDataC));
        assert.equal(settledCancel._canceler, creator);
    });

    it("Should request a loan using requestLoan", async function() {
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);
        const id = await calcId(creator, loanData);
        await loanManager.requestLoan(
            amount,           // Amount
            model.address,    // Model
            0x0,              // Oracle
            borrower,         // Borrower
            salt,             // salt
            expiration,       // Expiration
            loanData,         // Loan data
            { from: creator } // Creator
        );

        const request = await getRequest(id);
        assert.equal(request.open, true, "The request should be open");
        assert.equal(await loanManager.getApproved(id), false, "The request should not be approved");
        assert.equal(request.approved, false, "The request should not be approved");
        assert.equal(await loanManager.isApproved(id), false, "The request should not be approved");
        assert.equal(request.position, 0, "The loan its not approved");
        assert.equal(await loanManager.getExpirationRequest(id), expiration);
        assert.equal(request.expiration.toNumber(), expiration);
        assert.equal(await loanManager.getCurrency(id), 0x0);
        assert.equal(await loanManager.getAmount(id), amount);
        assert.equal(request.amount, amount);
        assert.equal(await loanManager.getCosigner(id), 0x0);
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, model.address);
        assert.equal(await loanManager.getCreator(id), creator);
        assert.equal(request.creator, creator);
        assert.equal(await loanManager.getOracle(id), 0x0);
        assert.equal(request.oracle, 0x0);
        assert.equal(await loanManager.getBorrower(id), borrower);
        assert.equal(request.borrower, borrower);
        assert.equal(request.salt.toNumber(), Web3Utils.hexToNumberString(Web3Utils.soliditySha3(creator, salt)));
        assert.equal(request.loanData[0], loanData[0]);
        assert.equal(request.loanData[1], loanData[1]);
        assert.equal(await loanManager.canceledSettles(id), false);
        assert.equal(await loanManager.getStatus(id), 0);
        assert.equal(await loanManager.getDueTime(id), 0);
        // try request 2 identical loans
        await Helper.tryCatchRevert(() => loanManager.requestLoan(
            amount,
            model.address,
            0x0,
            borrower,
            salt,
            expiration,
            loanData,
            { from: creator }
        ), "Request already exist");
        // The loan must be approved
        const newId = await calcId(borrower, loanData);
        await loanManager.requestLoan(
            amount,
            model.address,
            0x0,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );
        const newRequest = await getRequest(newId);
        assert.equal(newRequest.approved, true, "The request should be approved");
        assert.equal(await loanManager.directory(newRequest.position), newId);
    });

    it("Should approve a request using approveRequest", async function() {
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);
        const id = await calcId(creator, loanData);
        await loanManager.requestLoan(amount, model.address, 0x0, borrower, salt,
            expiration, loanData, { from: creator }
        );
        // try approve a request without being the borrower
        await Helper.tryCatchRevert(() => loanManager.approveRequest(id, { from: creator }), "Only borrower can approve");
        // approve request
        await loanManager.approveRequest(id, { from: borrower });

        const request = await getRequest(id);
        assert.equal(request.approved, true, "The request should be approved");
        assert.equal(request.position, await positionDirectory(id), "The loan its not approved");
        assert.equal(await loanManager.directory(request.position), id);
    });

    it("Should lend a request using lend", async function() {
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);
        let id = await calcId(creator, loanData);
        await loanManager.requestLoan(amount, model.address, 0x0, borrower, salt,
            expiration, loanData, { from: creator });
        // try lend a request without approve osf the borrower
        await Helper.tryCatchRevert(() => loanManager.lend(id, [], 0x0, 0, [], { from: lender }), "The request is not approved by the borrower");
        // approve requests
        await loanManager.approveRequest(id, { from: borrower });
        await Helper.increaseTime(2000);
        // try lend a expired requests
        await Helper.tryCatchRevert(() => loanManager.lend(id, [], 0x0, 0, [], { from: lender }), "The request is expired");
        // create a debts
        const amount2 = 2000;
        const expiration2 = (await Helper.getBlockTime()) + 1500;
        const loanData2 = await model.encodeData(amount, expiration2);
        id = await calcId(creator, loanData2);
        await loanManager.requestLoan(amount2, model.address, 0x0, borrower, salt,
            expiration2, loanData2, { from: creator });
        await loanManager.approveRequest(id, { from: borrower });
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: accounts[9] });
        // try lend without tokens balance
        await Helper.tryCatchRevert(() => loanManager.lend(
            id, [], 0x0, 0, [], { from: accounts[9] }
        ), "Error sending tokens to borrower");
        await rcn.setBalance(lender, amount2);
        await rcn.setBalance(borrower, 0);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });
        // lend
        await loanManager.lend(
            id,                 // Index
            [],                 // OracleData
            0x0,                // Cosigner
            0,                  // Cosigner limit
            [],                 // Cosigner data
            { from: lender }    // Owner/Lender
        );
        assert.equal(await rcn.balanceOf(lender), 0, "The lender does not have to have tokens");
        assert.equal(await rcn.balanceOf(borrower), amount2, "The borrower should have " + amount2 + " tokens");

        const debt = await getDebt(id);
        assert.equal(debt.error, false, "The debt should not have error");
        assert.equal(await loanManager.getCurrency(id), 0x0);
        assert.equal(debt.balance, 0, "The debt should not be balance");
        assert.equal(debt.model, model.address, "The model should be the model");
        assert.equal(debt.creator, loanManager.address, "The creator should be the loanManager");
        assert.equal(debt.oracle, 0x0, "The debt should not have oracle");

        assert.equal(await debtEngine.ownerOf(id), lender, "The lender should be the owner of the new ERC721");

        const request = await getRequest(id);
        assert.equal(request.loanData, "0x");
        assert.equal(request.position, 0);

        // try lend a closed request
        await Helper.tryCatchRevert(() => loanManager.lend(id, [], 0x0, 0, [], { from: lender }), "Request is no longer open");
    });

    it("Use cosigner in lend", async function() {
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);
        const id = await calcId(borrower, loanData);
        await loanManager.requestLoan(amount, model.address, 0x0, borrower, salt,
            expiration, loanData, { from: borrower });
        await rcn.setBalance(lender, amount + 666);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });
        // Cosign return false
        await Helper.tryCatchRevert(() => loanManager.lend(id,[],
                cosigner.address,        // Cosigner
                0,                       // Cosigner limit
                toBytes([
                    Web3Utils.soliditySha3("return_false"),
                    Helper.toBytes32(0)]
                ), // Cosigner data
                { from: lender }
            ),
            "Cosign method returned false");
        // Cosigner dont cosign
        await Helper.tryCatchRevert(() => loanManager.lend(id,[],
                cosigner.address,        // Cosigner
                0,                       // Cosigner limit
                toBytes([
                    Web3Utils.soliditySha3("return_true_no_cosign"),
                    Helper.toBytes32(0)]
                ), // Cosigner data
                { from: lender }
            ),
            "Cosigner didn't callback");
        // lend with cosigner
        await loanManager.lend(id,[],
            cosigner.address,        // Cosigner
            0,                       // Cosigner limit
            toBytes([
                Web3Utils.soliditySha3("test_oracle"),
                Helper.toBytes32(666)]
            ), // Cosigner data
            { from: lender }
        );

        const request = await getRequest(id);
        assert.equal(request.cosigner, cosigner.address);
        const internalSalt = Web3Utils.hexToNumberString(Web3Utils.soliditySha3(borrower, salt));
        assert.equal(request.salt.toNumber(), internalSalt);
    });

    it("Use cosigner in settleLend", async function() {
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);
        const idSettle = await calcId(creator, loanData);
        const settleData = [amount, model.address, 0x0, borrower, salt, expiration, creator]
            .map(x => Helper.toBytes32(x));
        const settleLoanData = await model.encodeData(settleData[0], settleData[5]);

        const creatorSigSL = await web3.eth.sign(creator, idSettle);
        const borrowerSigSL = await web3.eth.sign(borrower, idSettle);

        await rcn.setBalance(lender, amount);
        await rcn.setBalance(borrower, 0);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });
        // Cosign return false
        await Helper.tryCatchRevert(() => loanManager.settleLend(settleData, settleLoanData,
            cosigner.address, // Cosigner
            0,                // Max cosigner cost
            toBytes([
                Web3Utils.soliditySha3("return_false"),
                Helper.toBytes32(0)]
            ),                // Cosigner data
            [], creatorSigSL, borrowerSigSL, { from: lender }
        ),
        "Cosign method returned false");
        // Cosigner dont cosign
        await Helper.tryCatchRevert(() => loanManager.settleLend(settleData, settleLoanData,
                cosigner.address, // Cosigner
                0,                // Max cosigner cost
                toBytes([
                    Web3Utils.soliditySha3("return_true_no_cosign"),
                    Helper.toBytes32(0)]
                ),                // Cosigner data
                [], creatorSigSL, borrowerSigSL, { from: lender }
            ),
            "Cosigner didn't callback");
        // settleLend with cosigner
        await loanManager.settleLend(settleData, settleLoanData,
            cosigner.address, // Cosigner
            0,                // Max cosigner cost
            toBytes([
                Web3Utils.soliditySha3("test_oracle"),
                Helper.toBytes32(0)]
            ),                // Cosigner data
            [], creatorSigSL, borrowerSigSL, { from: lender }
        );

        const settleRequest = await getRequest(idSettle);
        assert.equal(settleRequest.cosigner, cosigner.address);
        const internalSalt = Web3Utils.hexToNumberString(Web3Utils.soliditySha3(creator, salt));
        assert.equal(settleRequest.salt.toNumber(), internalSalt);
    });

    it("Should lend a request using settleLend", async function() {
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);
        const id = await calcId(creator, loanData);
        const requestData = [amount, model.address, 0x0, borrower, salt, expiration, creator]
            .map(x => Helper.toBytes32(x));

        // try settle lend with a expired data time
        const requestDataexpired = [amount, model.address, 0x0, borrower, salt, expiration - 2000, creator].map(x => Helper.toBytes32(x));
        await Helper.tryCatchRevert(() => loanManager.settleLend(requestDataexpired, loanData, 0x0, 0, [], [], 0x0, 0x0),
            "Loan request is expired"
        );
        // try settle lend without borrower
        const requestDataBorrower0x0 = [amount, model.address, 0x0, 0x0, salt, expiration, creator].map(x => Helper.toBytes32(x));
        await Helper.tryCatchRevert(() => loanManager.settleLend(requestDataBorrower0x0, loanData, 0x0, 0, [], [], 0x0, 0x0),
            "Borrower can't be 0x0"
        );
        // try settle lend without creator
        const requestDataCreator0x0 = [amount, model.address, 0x0, borrower, salt, expiration, 0x0].map(x => Helper.toBytes32(x));
        await Helper.tryCatchRevert(() => loanManager.settleLend(requestDataCreator0x0, loanData, 0x0, 0, [], [], 0x0, 0x0),
            "Creator can't be 0x0"
        );

        const creatorSig = await web3.eth.sign(creator, id);
        const borrowerSig = await web3.eth.sign(borrower, id);

        // try settle lend without tokens balance
        await Helper.tryCatchRevert(() => loanManager.settleLend(requestData, loanData, 0x0, 0, [], [], creatorSig, borrowerSig, { from: lender }),
            "Error sending tokens to borrower"
        );

        await rcn.setBalance(lender, amount);
        await rcn.setBalance(borrower, 0);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });

        await loanManager.settleLend(
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
        assert.equal(await loanManager.getCurrency(id), 0x0);
        assert.equal(request.amount, amount);
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, model.address);
        assert.equal(request.creator, creator);
        assert.equal(request.oracle, 0x0);
        assert.equal(request.borrower, borrower);
        const internalSalt = Web3Utils.hexToNumberString(Web3Utils.soliditySha3(creator, salt));
        assert.equal(request.salt.toNumber(), internalSalt);
        assert.equal(request.loanData, "0x");

        // try settle lend a request already exist
        await Helper.tryCatchRevert(() => loanManager.settleLend(requestData, loanData, 0x0, 0, [], [], creatorSig, borrowerSig, { from: lender }),
            "Request already exist"
        );
    });

    it("Should cancel a request using cancel", async function() {
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);
        const id = await loanManager.calcFutureDebt(creator, ++nonce);
        await loanManager.requestLoan(
            0x0, amount, model.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }
        );
        // try cancel a request without being the borrower or the creator
        await Helper.tryCatchRevert(() => loanManager.cancel(id, { from: lender }), "Only borrower or creator can cancel a request");

        // creator cancel
        await loanManager.cancel(id, { from: creator });
        let cancelRequest = await loanManager.requests(id);
        assert.equal(cancelRequest[8], 0x0);
        assert.equal(cancelRequest[3], 0, "The loan its not approved");
        assert.equal(await loanManager.getLoanData(id), "0x");

        // borrower cancel
        await loanManager.requestLoan(
            0x0, amount, model.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }
        );
        await loanManager.cancel(id, { from: borrower });
        cancelRequest = await loanManager.requests(id);
        assert.equal(cancelRequest[8], 0x0);
        assert.equal(cancelRequest[3], 0, "The loan its not approved");
        assert.equal(await loanManager.getLoanData(id), "0x")
    });

    it("Should cancel a request using settle cancel", async function() {
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);
        let requestData = [0x0, amount, model.address, 0x0, borrower, ++nonce, expiration, creator]
            .map(x => Helper.toBytes32(x));
        await loanManager.requestLoan(
            0x0, amount, model.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }
        );
        // try cancel a request without have the signature
        await Helper.tryCatchRevert(() =>  loanManager.settleCancel(requestData, loanData, { from: lender }), "Only borrower or creator can cancel a settle");
        // creator cancel
        await loanManager.settleCancel(requestData, loanData, { from: creator });
        let signature = await loanManager.requestSignature(requestData, loanData);
        assert.equal(await loanManager.canceledSettles(signature), true);
        // borrower cancel
        requestData = [0x0, amount, model.address, 0x0, borrower, ++nonce, expiration, creator]
            .map(x => Helper.toBytes32(x));
        await loanManager.requestLoan(
            0x0, amount, model.address, 0x0, borrower, nonce, expiration, loanData, { from: creator }
        );
        await loanManager.settleCancel(requestData, loanData, { from: borrower });
        signature = await loanManager.requestSignature(requestData, loanData);
        assert.equal(await loanManager.canceledSettles(signature), true);
    });
});
