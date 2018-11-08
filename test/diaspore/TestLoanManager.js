const LoanManager = artifacts.require('./diaspore/LoanManager.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require('./utils/test/TestToken.sol');
const TestLoanApprover = artifacts.require('./diaspore/utils/test/TestLoanApprover.sol');

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
    let loanApprover;

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Requested');
        assert.ok(event);
        return event.args._id;
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

        internalSalt.should.be.bignumber.equal(controlInternalSalt, 'bug internalsalt');
        id.should.be.equal(controlId, 'bug calcId');
        return id;
    }

    async function getRequest (id) {
        const request = await loanManager.requests(id);
        if (request[9] === 0x0) { throw new Error('Request id: ' + id + ' does not exists'); }
        return {
            open: request[0],
            approved: request[1],
            position: request[2],
            expiration: request[3],
            amount: request[4],
            cosigner: request[5],
            model: request[6],
            creator: request[7],
            oracle: request[8],
            borrower: request[9],
            salt: request[10],
            loanData: await loanManager.getLoanData(id),
        };
    }

    before('Create engine and model', async function () {
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        loanManager = await LoanManager.new(debtEngine.address);
        model = await TestModel.new();
        await model.setEngine(debtEngine.address);
        loanApprover = await TestLoanApprover.new();
    });

    it('Should create a loan using requestLoan', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 1;
        const amount = 1000;

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

        const request = await getRequest(id);

        assert.equal(await loanManager.getCurrency(id), 0x0);
        assert.equal(await loanManager.directory(request.position), 0);
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

        const id2 = await getId(await loanManager2.requestLoan(
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

    it('Should register approve using the borrower signature', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 4;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        // Sign loan id
        const signature = await web3.eth.sign(borrower, id);

        const receipt = await loanManager.registerApproveRequest(id, signature, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), true);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.equal(event.args._id, id);

        // Should add the entry to the directory
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength.toNumber() + 1);
        (await loanManager.directory(dlength)).should.be.bignumber.equal(id);
    });

    it('Should ignore approve with wrong borrower signature', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 5;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        // Sign loan id
        const signature = await web3.eth.sign(borrower, Helper.toBytes32(accounts[3]));

        const receipt = await loanManager.registerApproveRequest(id, signature, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), false);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.notOk(event);

        // Should not add the entry to the directory
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength);
    });

    it('Should ignore a second approve using registerApprove', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 6;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        // Sign loan id
        const signature = await web3.eth.sign(borrower, id);

        const receipt = await loanManager.registerApproveRequest(id, signature, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), true);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.equal(event.args._id, id);

        const receipt2 = await loanManager.registerApproveRequest(id, signature, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), true);

        const event2 = receipt2.logs.find(l => l.event === 'Approved');
        assert.notOk(event2);

        // Should add the entry to the directory once
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength.toNumber() + 1);
        (await loanManager.directory(dlength)).should.be.bignumber.equal(id);
    });

    it('Should register approve using the borrower callback', async function () {
        const creator = accounts[1];
        const borrower = loanApprover.address;

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 4;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        // Set expected id
        await loanApprover.setExpectedApprove(id);

        const receipt = await loanManager.registerApproveRequest(id, 0x0, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), true);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.equal(event.args._id, id);

        // Should add the entry to the directory
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength.toNumber() + 1);
        (await loanManager.directory(dlength)).should.be.bignumber.equal(id);
    });

    it('Should ignore approve if borrower callback reverts', async function () {
        const creator = accounts[1];
        const borrower = loanApprover.address;

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 5;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        await loanApprover.setErrorBehavior(0);

        const receipt = await loanManager.registerApproveRequest(id, 0x0, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), false);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.notOk(event);

        // Should not add the entry to the directory
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength);
    });

    it('Should ignore approve if borrower callback returns false', async function () {
        const creator = accounts[1];
        const borrower = loanApprover.address;

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 6;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        await loanApprover.setErrorBehavior(1);

        const receipt = await loanManager.registerApproveRequest(id, 0x0, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), false);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.notOk(event);

        // Should not add the entry to the directory
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength);
    });

    it('Should ignore approve if borrower callback returns wrong value', async function () {
        const creator = accounts[1];
        const borrower = loanApprover.address;

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 7;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        await loanApprover.setErrorBehavior(2);

        const receipt = await loanManager.registerApproveRequest(id, 0x0, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), false);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.notOk(event);

        // Should not add the entry to the directory
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength);
    });

    it('Should ignore a second approve using registerApprove and callbacks', async function () {
        const creator = accounts[1];
        const borrower = loanApprover.address;

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 8;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        await loanApprover.setExpectedApprove(id);

        const receipt = await loanManager.registerApproveRequest(id, 0x0, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), true);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.equal(event.args._id, id);

        const receipt2 = await loanManager.registerApproveRequest(id, 0x0, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), true);

        const event2 = receipt2.logs.find(l => l.event === 'Approved');
        assert.notOk(event2);

        // Should add the entry to the directory once
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength.toNumber() + 1);
        (await loanManager.directory(dlength)).should.be.bignumber.equal(id);
    });

    it('Should not call callback if the borrower contract does not implements loan approver', async function () {
        const creator = accounts[1];
        const borrower = debtEngine.address;

        const expiration = (await Helper.getBlockTime()) + 1000;

        const salt = 7;
        const amount = 1000;

        const loanData = await model.encodeData(amount, expiration);

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

        const dlength = await loanManager.getDirectoryLength();

        const receipt = await loanManager.registerApproveRequest(id, 0x0, { from: accounts[2] });
        assert.equal(await loanManager.isApproved(id), false);

        const event = receipt.logs.find(l => l.event === 'Approved');
        assert.notOk(event);

        // Should not add the entry to the directory
        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength);
    });
});
