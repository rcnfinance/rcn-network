const LoanManager = artifacts.require('./diaspore/LoanManager.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require('./utils/test/TestToken.sol');
const TestCosigner = artifacts.require('./examples/TestCosigner.sol');

const Helper = require('../Helper.js');
const Web3Utils = require('web3-utils');

const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-bignumber')(BigNumber))
    .should();

contract('Test LoanManager Diaspore', function (accounts) {
    let rcn;
    let debtEngine;
    let loanManager;
    let model;
    let cosigner;

    async function toEvent(promise, event) {
        return (await promise).logs.filter( x => x.event === event).map( x => x.args )[0];
    }
    async function getId (promise) {
        return (await toEvent(promise, 'Requested'))._id;
    }

    async function calcId (_amount, _borrower, _creator, _model, _oracle, _salt, _expiration, _data) {
        const _two = '0x02';
        const controlId = await loanManager.calcId(
            _amount,
            _borrower,
            _creator,
            model.address,
            _oracle,
            _salt,
            _expiration,
            _data
        );

        const controlInternalSalt = await loanManager.buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _salt,
            _expiration
        );

        const internalSalt = Web3Utils.hexToNumberString(
            Web3Utils.soliditySha3(
                { t: 'uint128', v: _amount },
                { t: 'address', v: _borrower },
                { t: 'address', v: _creator },
                { t: 'uint256', v: _salt },
                { t: 'uint64', v: _expiration }
            )
        );

        const id = Web3Utils.soliditySha3(
            { t: 'uint8', v: _two },
            { t: 'address', v: debtEngine.address },
            { t: 'address', v: loanManager.address },
            { t: 'address', v: model.address },
            { t: 'address', v: _oracle },
            { t: 'uint256', v: internalSalt },
            { t: 'bytes', v: _data }
        );

        internalSalt.should.be.bignumber.equal(controlInternalSalt, 'bug internalSalt');
        id.should.be.equal(controlId, 'bug calcId');
        return id;
    }

    async function calcSettleId(_amount, _borrower, _creator, _model, _oracle, _salt, _expiration, _data) {
        const _two = '0x02';
        const encodeData = await loanManager.encodeRequest(
            _amount,
            _model,
            _oracle,
            _borrower,
            _salt,
            _expiration,
            _creator,
            _data
        );
        const controlId = encodeData[1];
        const controlInternalSalt = await loanManager.buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _salt,
            _expiration
        );

        const internalSalt = Web3Utils.hexToNumberString(
            Web3Utils.soliditySha3(
                { t: 'uint128', v: _amount },
                { t: 'address', v: _borrower },
                { t: 'address', v: _creator },
                { t: 'uint256', v: _salt },
                { t: 'uint64', v: _expiration }
            )
        );

        const id = Web3Utils.soliditySha3(
            { t: 'uint8', v: _two },
            { t: 'address', v: debtEngine.address },
            { t: 'address', v: loanManager.address },
            { t: 'address', v: model.address },
            { t: 'address', v: _oracle },
            { t: 'uint256', v: internalSalt },
            { t: 'bytes', v: _data }
        );

        internalSalt.should.be.bignumber.equal(controlInternalSalt, 'bug internalSalt');
        id.should.be.equal(controlId, 'bug calcId');
        return encodeData;
    }

    function toBytes(target) {
        return target.toString().replace(new RegExp(',0x', 'g'), '');
    }

    async function getRequest (id) {
        const request = await loanManager.requests(id);
        if (request[9] === 0x0) { throw new Error('Request id: ' + id + ' does not exists'); }
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
        if (debt[3] === 0x0) { throw new Error('Debt id: ' + id + ' does not exists'); }
        return {
          error:   debt[0],
          balance: debt[1],
          model:   debt[2],
          creator: debt[3],
          oracle:  debt[4]
        }
    }

    before('Create engine and model', async function () {
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        loanManager = await LoanManager.new(debtEngine.address);
        model = await TestModel.new();
        await model.setEngine(debtEngine.address);
        cosigner = await TestCosigner.new(rcn.address);
    });

    it('Should create a loan using requestLoan', async function () {
        const creator  = accounts[1];
        const borrower = accounts[2];
        const salt = 1;
        const amount = 1031230;
        const expiration = (await Helper.getBlockTime()) + 1000;
        const loanData = await model.encodeData(amount, expiration);

        const id = await calcId(
            amount,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt,
            expiration,
            loanData
        );

        const requested = await toEvent(
            loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                Helper.address0x, // Oracle
                borrower,         // Borrower
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator } // Creator
            ),
            'Requested'
        );

        const internalSalt = Web3Utils.hexToNumberString(
            Web3Utils.soliditySha3(
                { t: 'uint128', v: amount },
                { t: 'address', v: borrower },
                { t: 'address', v: creator },
                { t: 'uint256', v: salt },
                { t: 'uint64',  v: expiration }
            )
        );

        assert.equal(requested._id, id);
        assert.equal(requested._internalSalt.toNumber(), internalSalt);

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
        assert.equal(request.salt.toNumber(), salt);
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
        const salt2 = 2;
        const amount2 = 1031230;
        const expiration2 = (await Helper.getBlockTime()) + 1000;
        const loanData2 = await model.encodeData(amount2, expiration2);
        const newId = await calcId(
            amount2,
            borrower,
            borrower,
            model.address,
            Helper.address0x,
            salt2,
            expiration2,
            loanData2
        );

        await loanManager.requestLoan(
            amount2,
            model.address,
            0x0,
            borrower,
            salt2,
            expiration2,
            loanData2,
            { from: borrower }
        );
        const newRequest = await getRequest(newId);
        assert.equal(newRequest.approved, true, "The request should be approved");
        assert.equal(await loanManager.directory(newRequest.position), newId);
    });

    it("Should approve a request using approveRequest", async function() {
        const creator  = accounts[1];
        const borrower = accounts[2];
        const salt = 13132123;
        const amount = 10230;
        const expiration = (await Helper.getBlockTime()) + 11100;
        const loanData = await model.encodeData(amount, expiration);

        const id = await calcId(
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
            amount,           // Amount
            model.address,    // Model
            Helper.address0x, // Oracle
            borrower,         // Borrower
            salt,             // salt
            expiration,       // Expiration
            loanData,         // Loan data
            { from: creator } // Creator
        );
        // try approve a request without being the borrower
        await Helper.tryCatchRevert(() => loanManager.approveRequest(id, { from: creator }), "Only borrower can approve");
        // approve request
        const approved = await toEvent(
            loanManager.approveRequest(
                id, { from: borrower }
            ),
            'Approved'
        );

        assert.equal(approved._id, id);

        const request = await getRequest(id);
        assert.equal(request.approved, true, "The request should be approved");
        assert.equal(request.position, await positionDirectory(id), "The loan its not approved");
        assert.equal(await loanManager.directory(request.position), id);
    });

    it("Should lend a request using lend", async function() {
        const creator  = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = 23;
        const amount = 30;
        const expiration = (await Helper.getBlockTime()) + 900;
        const loanData = await model.encodeData(amount, expiration);

        const id = await calcId(
            amount,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt,
            expiration,
            loanData
        );

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
        const salt2 = 5333;
        const amount2 = 530;
        const expiration2 = (await Helper.getBlockTime()) + 5900;
        const loanData2 = await model.encodeData(amount2, expiration2);

        const id2 = await calcId(
            amount2,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt2,
            expiration2,
            loanData2
        );

        await loanManager.requestLoan(amount2, model.address, 0x0, borrower, salt2,
            expiration2, loanData2, { from: creator });
        await loanManager.approveRequest(id2, { from: borrower });
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: accounts[9] });
        // try lend without tokens balance
        await Helper.tryCatchRevert(() => loanManager.lend(
            id2, [], 0x0, 0, [], { from: accounts[9] }
        ), "Error sending tokens to borrower");
        await rcn.setBalance(lender, amount2);
        await rcn.setBalance(borrower, 0);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });
        // lend
        await rcn.setBalance(lender, amount2);
        await rcn.approve(loanManager.address, amount2, { from: lender });
        const lent = await toEvent(
            loanManager.lend(
                id2,                 // Index
                [],                 // OracleData
                0x0,                // Cosigner
                0,                  // Cosigner limit
                [],                 // Cosigner data
                { from: lender }    // Owner/Lender
            ),
            'Lent'
        );
        assert.equal(lent._id, id2);
        assert.equal(lent._lender, lender);
        assert.equal(lent._tokens, amount2);

        assert.equal(await rcn.balanceOf(lender), 0, "The lender does not have to have tokens");
        assert.equal(await rcn.balanceOf(borrower), amount2, "The borrower should have " + amount2 + " tokens");

        const debt = await getDebt(id2);
        assert.equal(debt.error, false, "The debt should not have error");
        assert.equal(await loanManager.getCurrency(id2), 0x0);
        assert.equal(debt.balance, 0, "The debt should not be balance");
        assert.equal(debt.model, model.address, "The model should be the model");
        assert.equal(debt.creator, loanManager.address, "The creator should be the loanManager");
        assert.equal(debt.oracle, 0x0, "The debt should not have oracle");

        assert.equal(await debtEngine.ownerOf(id2), lender, "The lender should be the owner of the new ERC721");

        const request = await getRequest(id2);
        assert.equal(request.position, 0);

        // try lend a closed request
        await Helper.tryCatchRevert(() => loanManager.lend(id2, [], 0x0, 0, [], { from: lender }), "Request is no longer open");
    });

    it("Use cosigner in lend", async function() {
        const creator  = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = 2323;
        const amount = 330;
        const expiration = (await Helper.getBlockTime()) + 1700;
        const loanData = await model.encodeData(amount, expiration);

        const id = await calcId(
            amount,
            borrower,
            borrower,
            model.address,
            Helper.address0x,
            salt,
            expiration,
            loanData
        );

        await loanManager.requestLoan(amount, model.address, 0x0, borrower, salt,
            expiration, loanData, { from: borrower });
        await rcn.setBalance(lender, amount + 666);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });
        // Cosign return false
        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                cosigner.address,        // Cosigner
                0,                       // Cosigner limit
                toBytes([
                    Web3Utils.soliditySha3("return_false"),
                    Helper.toBytes32(0)
                ]), // Cosigner data
                { from: lender }
            ),
            "Cosign method returned false"
        );
        // Cosigner dont cosign
        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                cosigner.address,        // Cosigner
                0,                       // Cosigner limit
                toBytes([
                    Web3Utils.soliditySha3("return_true_no_cosign"),
                    Helper.toBytes32(0)
                ]), // Cosigner data
                { from: lender }
            ),
            "Cosigner didn't callback");
        // lend with cosigner
        const cosigned = await toEvent(
            loanManager.lend(
                id,
                [],
                cosigner.address,        // Cosigner
                0,                       // Cosigner limit
                toBytes([
                    Web3Utils.soliditySha3("test_oracle"),
                    Helper.toBytes32(amount)
                ]), // Cosigner data
                { from: lender }
            ),
            'Cosigned'
        );

        assert.equal(cosigned._id, id);
        assert.equal(cosigned._cosigner, cosigner.address);
        assert.equal(cosigned._cost.toNumber(), amount);

        const request = await getRequest(id);
        assert.equal(request.cosigner, cosigner.address);
        const internalSalt = Web3Utils.hexToNumberString(
            Web3Utils.soliditySha3(
                { t: 'uint128', v: amount },
                { t: 'address', v: borrower },
                { t: 'address', v: borrower },
                { t: 'uint256', v: salt },
                { t: 'uint64',  v: expiration }
            )
        );
        assert.equal(request.salt.toNumber(), salt);
    });

    it("Use cosigner in settleLend", async function() {
        const creator  = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = 2763;
        const amount = 3320;
        const expiration = (await Helper.getBlockTime()) + 7400;
        const loanData = await model.encodeData(amount, expiration);

        const encodeData = await calcSettleId(
            amount,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt,
            expiration,
            loanData
        );
        const settleData = encodeData[0];
        const idSettle = encodeData[1];

        const creatorSigSL = await web3.eth.sign(creator, idSettle);
        const borrowerSigSL = await web3.eth.sign(borrower, idSettle);

        await rcn.setBalance(lender, amount);
        await rcn.setBalance(borrower, 0);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });
        // Cosign return false
         await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                cosigner.address, // Cosigner
                0,                // Max cosigner cost
                toBytes([
                    Web3Utils.soliditySha3("return_false"),
                    Helper.toBytes32(0)
                ]),                // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            "Cosign method returned false"
        );
        // Cosigner dont cosign
        await Helper.tryCatchRevert(
            () => loanManager.settleLend(settleData, loanData,
                cosigner.address, // Cosigner
                0,                // Max cosigner cost
                toBytes([
                    Web3Utils.soliditySha3("return_true_no_cosign"),
                    Helper.toBytes32(0)
                ]),                // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            "Cosigner didn't callback"
        );

        // settleLend with cosigner
        const settledLend = await toEvent(
            loanManager.settleLend(
                settleData,
                loanData,
                cosigner.address, // Cosigner
                0,                // Max cosigner cost
                toBytes([
                    Web3Utils.soliditySha3("test_oracle"),
                    Helper.toBytes32(0)
                ]),                // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            'SettledLend'
        );

        assert.equal(settledLend._id, idSettle);
        assert.equal(settledLend._lender, lender);
        assert.equal(settledLend._tokens, amount);

        const settleRequest = await getRequest(idSettle);
        assert.equal(settleRequest.cosigner, cosigner.address);
        const internalSalt = Web3Utils.hexToNumberString(
            Web3Utils.soliditySha3(
                { t: 'uint128', v: amount },
                { t: 'address', v: borrower },
                { t: 'address', v: creator },
                { t: 'uint256', v: salt },
                { t: 'uint64',  v: expiration }
            )
        );
        assert.equal(settleRequest.salt.toNumber(), salt);
    });

    it("Should lend a request using settleLend", async function() {
        const creator  = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = 9999999999;
        const amount = 300000;
        const expiration = (await Helper.getBlockTime()) + 6265;
        const loanData = await model.encodeData(amount, expiration);

        const encodeData = await calcSettleId(
            amount,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt,
            expiration,
            loanData
        );
        const settleData = encodeData[0];
        const idSettle = encodeData[1];

        // try settle lend with a expired data time
        const requestDataExpired = (await calcSettleId(
            amount,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt,
            expiration - 10000,
            loanData
        ))[0];

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                requestDataExpired,
                loanData,
                Helper.address0x,
                0,
                [],
                [],
                0x0,
                0x0
            ),
            "Loan request is expired"
        );

        const creatorSig = await web3.eth.sign(creator, idSettle);
        const borrowerSig = await web3.eth.sign(borrower, idSettle);

        // try settle lend without tokens balance
        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                Helper.address0x,
                0,
                [],
                [],
                creatorSig,
                borrowerSig,
                { from: lender }
            ),
            "Error sending tokens to borrower"
        );

        await rcn.setBalance(lender, amount);
        await rcn.setBalance(borrower, 0);
        await rcn.approve(loanManager.address, web3.toWei(100000), { from: lender });

        await loanManager.settleLend(
            settleData,     // Request data
            loanData,        // Loan data
            0x0,             // Cosigner
            0,               // Max cosigner cost
            [],              // Cosigner data
            [],              // Oracle data
            creatorSig,      // Creator signature
            borrowerSig,     // Borrower signature
            { from: lender } // Lender
        );

        const request = await getRequest(idSettle);

        assert.equal(request.open, false, "The request should not be open");
        assert.equal(request.approved, true, "The request should be approved");
        assert.equal(request.position, 0, "The loan its not approved");
        assert.equal(request.expiration.toNumber(), expiration);
        assert.equal(await loanManager.getCurrency(idSettle), 0x0);
        assert.equal(request.amount, amount);
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, model.address);
        assert.equal(request.creator, creator);
        assert.equal(request.oracle, 0x0);
        assert.equal(request.borrower, borrower);
        const internalSalt = Web3Utils.hexToNumberString(
            Web3Utils.soliditySha3(
                { t: 'uint128', v: amount },
                { t: 'address', v: borrower },
                { t: 'address', v: creator },
                { t: 'uint256', v: salt },
                { t: 'uint64',  v: expiration }
            )
        );
        assert.equal(request.salt.toNumber(), salt);

        // try settle lend a request already exist
        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                0x0,
                0,
                [],
                [],
                creatorSig,
                borrowerSig,
                { from: lender }
            ),
            "Request already exist"
        );
    });

    it("Should cancel a request using cancel", async function() {
        const creator  = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = 3434225;
        const amount = 55;
        const expiration = (await Helper.getBlockTime()) + 1700;
        const loanData = await model.encodeData(amount, expiration);

        const id = await calcId(
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
            amount,
            model.address,
            0x0,
            borrower,
            salt,
            expiration,
            loanData,
            { from: creator }
        );
        // try cancel a request without being the borrower or the creator
        await Helper.tryCatchRevert(
            () => loanManager.cancel(
                id,
                { from: lender }
            ),
            "Only borrower or creator can cancel a request"
        );

        // creator cancel
        const canceled = await toEvent(
            loanManager.cancel(
                id,
                { from: borrower }
            ),
           'Canceled'
        );
        assert.equal(canceled._id, id);
        assert.equal(canceled._canceler, borrower);

        let cancelRequest = await loanManager.requests(id);

        assert.equal(cancelRequest[0], 0);
        assert.equal(cancelRequest[1], 0);
        assert.equal(cancelRequest[2], 0);
        assert.equal(cancelRequest[3], 0);
        assert.equal(cancelRequest[4], 0);
        assert.equal(cancelRequest[5], 0);
        assert.equal(cancelRequest[6], 0);
        assert.equal(cancelRequest[7], 0);
        assert.equal(cancelRequest[8], 0);
        assert.equal(cancelRequest[9], 0);
        assert.equal(cancelRequest[10], 0);
        assert.equal(cancelRequest[11], "0x");

        assert.equal(await loanManager.getLoanData(id), "0x");

        // borrower cancel
        await loanManager.requestLoan(
            amount,
            model.address,
            0x0,
            borrower,
            salt,
            expiration,
            loanData,
            { from: creator }
        );
        await loanManager.cancel(id, { from: borrower });
        cancelRequest = await loanManager.requests(id);
        assert.equal(cancelRequest[8], 0x0);
        assert.equal(cancelRequest[3], 0, "The loan its not approved");
        assert.equal(await loanManager.getLoanData(id), "0x");
    });

    it("Should cancel a request using settle cancel", async function() {
        const creator  = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = 2956;
        const amount = 9320;
        const expiration = (await Helper.getBlockTime()) + 3400;
        const loanData = await model.encodeData(amount, expiration);

        let encodeData = await calcSettleId(
            amount,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt,
            expiration,
            loanData
        );
        const settleData = encodeData[0];
        const idCreator = encodeData[1];

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: creator }
        );

        // try cancel a request without have the signature
        await Helper.tryCatchRevert(
            () =>  loanManager.settleCancel(
                settleData,
                loanData,
                { from: lender }
            ),
            "Only borrower or creator can cancel a settle"
        );

        // creator cancel
        const settledCancel = await toEvent(
            loanManager.settleCancel(
                settleData,
                loanData,
                { from: creator }
            ),
            'SettledCancel'
        );
        assert.equal(settledCancel._id, idCreator);
        assert.equal(settledCancel._canceler, creator);


        assert.equal(await loanManager.canceledSettles(idCreator), true);

        // borrower cancel
        encodeData = await calcSettleId(
            amount,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt + 1,
            expiration,
            loanData
        );
        const settleDataBorrower = encodeData[0];
        const idBorrower = encodeData[1];

        await loanManager.requestLoan(
            amount,
            model.address,
            0x0,
            borrower,
            salt + 1,
            expiration,
            loanData,
            { from: creator }
        );
        await loanManager.settleCancel(
            settleDataBorrower,
            loanData,
            { from: borrower }
        );
        assert.equal(await loanManager.canceledSettles(idBorrower), true);
    });

    it('Different loan managers should have different ids', async function () {
        const loanManager2 = await LoanManager.new(debtEngine.address);

        const creator = accounts[1];
        const borrower = accounts[2];

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 2;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

        const id1 = await getId(loanManager.requestLoan(
            amount,           // Amount
            model.address,    // Model
            Helper.address0x, // Oracle
            borrower,         // Borrower
            salt,             // salt
            expiration,       // Expiration
            loanData,         // Loan data
            { from: creator } // Creator
        ));

        const id2 = await getId(loanManager2.requestLoan(
            amount,           // Amount
            model.address,    // Model
            Helper.address0x, // Oracle
            borrower,         // Borrower
            salt,             // salt
            expiration,       // Expiration
            loanData,         // Loan data
            { from: creator } // Creator
        ));

        assert.notEqual(id1, id2);
    });

    it('Should return future internal salt', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 3;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

        const pInternalSalt = await loanManager.buildInternalSalt(
            amount,
            borrower,
            creator,
            salt,
            expiration
        );

        const id = await getId(loanManager.requestLoan(
            amount,           // Amount
            model.address,    // Model
            Helper.address0x, // Oracle
            borrower,         // Borrower
            salt,             // salt
            expiration,       // Expiration
            loanData,         // Loan data
            { from: creator } // Creator
        ));

        pInternalSalt.should.be.bignumber.equal(await loanManager.internalSalt(id));
    });

    it('Should fail internal salt if id does not exist', async function () {
        await Helper.tryCatchRevert(loanManager.internalSalt(0x2), 'Request does not exist');
    });
});
