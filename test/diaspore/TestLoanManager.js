const LoanManager = artifacts.require('./diaspore/LoanManager.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require('./utils/test/TestToken.sol');
const TestDebtEngine = artifacts.require('./diaspore/utils/test/TestDebtEngine.sol');
const TestCosigner = artifacts.require('./utils/test/TestCosigner.sol');
const TestRateOracle = artifacts.require('./utils/test/TestRateOracle.sol');
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
    let cosigner;
    let oracle;
    let loanApprover;
    const MAX_UINT256 = new BigNumber('2').pow(new BigNumber('256').sub(new BigNumber('1')));

    async function toEvent (promise, event) {
        return (await promise).logs.filter(x => x.event === event).map(x => x.args)[0];
    }

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

        internalSalt.should.be.bignumber.equal(controlInternalSalt, 'bug internalSalt');
        id.should.be.equal(controlId, 'bug calcId');
        return id;
    }

    async function calcSettleId (_amount, _borrower, _creator, _model, _oracle, _salt, _expiration, _data) {
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

    async function positionDirectory (id) {
        return (await loanManager.getDirectory()).indexOf(id);
    }

    async function getDebt (id) {
        const debt = await debtEngine.debts(id);
        if (debt[3] === 0x0) { throw new Error('Debt id: ' + id + ' does not exists'); }
        return {
            error: debt[0],
            balance: debt[1],
            model: debt[2],
            creator: debt[3],
            oracle: debt[4],
        };
    }

    before('Create engine and model', async function () {
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        loanManager = await LoanManager.new(debtEngine.address);
        model = await TestModel.new();
        await model.setEngine(debtEngine.address);
        loanApprover = await TestLoanApprover.new();
        cosigner = await TestCosigner.new(rcn.address);
        oracle = await TestRateOracle.new();
    });

    beforeEach('Reset all rcn balance', async function () {
        for (let i = 0; i < accounts.length; i++) {
            await rcn.setBalance(accounts[i], new BigNumber('0'));
            await rcn.approve(loanManager.address, new BigNumber('0'), { from: accounts[i] });
        }
        await rcn.setBalance(cosigner.address, new BigNumber('0'));
        await rcn.setBalance(loanManager.address, new BigNumber('0'));
        await rcn.setBalance(debtEngine.address, new BigNumber('0'));

        (await rcn.totalSupply()).should.be.bignumber.equal(new BigNumber('0'));
    });

    it('Try instance a LoanManager instance with token == 0x0', async function () {
        const testDebtEngine = await TestDebtEngine.new(0x0);

        await Helper.tryCatchRevert(
            () => LoanManager.new(testDebtEngine.address),
            'Error loading token'
        );
    });

    it('Should request a loan using requestLoan', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('1');
        const amount = new BigNumber('1031230');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));
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
                { t: 'uint64', v: expiration }
            )
        );

        assert.equal(requested._id, id);
        (requested._internalSalt).should.be.bignumber.equal(internalSalt);

        const request = await getRequest(id);
        assert.equal(request.open, true, 'The request should be open');
        assert.equal(await loanManager.getApproved(id), false, 'The request should not be approved');
        assert.equal(request.approved, false, 'The request should not be approved');
        assert.equal(await loanManager.isApproved(id), false, 'The request should not be approved');
        (request.position).should.be.bignumber.equal(new BigNumber('0'), 'The loan its not approved');
        (await loanManager.getExpirationRequest(id)).should.be.bignumber.equal(expiration);
        (request.expiration).should.be.bignumber.equal(expiration);
        assert.equal(await loanManager.getCurrency(id), 0x0);
        (await loanManager.getAmount(id)).should.be.bignumber.equal(amount);
        (request.amount).should.be.bignumber.equal(amount);
        assert.equal(await loanManager.getCosigner(id), 0x0);
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, model.address);
        assert.equal(await loanManager.getCreator(id), creator);
        assert.equal(request.creator, creator);
        assert.equal(await loanManager.getOracle(id), 0x0);
        assert.equal(request.oracle, 0x0);
        assert.equal(await loanManager.getBorrower(id), borrower);
        assert.equal(request.borrower, borrower);
        (request.salt).should.be.bignumber.equal(salt);
        assert.equal(request.loanData, loanData);
        assert.equal(await loanManager.canceledSettles(id), false);
        (await loanManager.getStatus(id)).should.be.bignumber.equal(new BigNumber('0'));
        (await loanManager.getDueTime(id)).should.be.bignumber.equal(new BigNumber('0'));
    });

    it('Try request loan with 0x0 as borrower', async function () {
        const creator = accounts[1];
        const borrower = Helper.address0x;
        const salt = new BigNumber('319');
        const amount = new BigNumber('143441230');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));
        const loanData = await model.encodeData(amount, expiration);

        await Helper.tryCatchRevert(
            () => loanManager.requestLoan(
                amount,
                model.address,
                Helper.address0x,
                borrower,
                salt,
                expiration,
                loanData,
                { from: creator }
            ),
            'The request should have a borrower'
        );
    });

    it('Request a loan should be fail if the model create return a diferent id', async function () {
        const testDebtEngine = await TestDebtEngine.new(rcn.address);
        const loanManager2 = await LoanManager.new(testDebtEngine.address);
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('23');
        const amount = new BigNumber('30');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('900'));
        const loanData = await model.encodeData(amount, expiration);

        const id = await loanManager2.calcId(
            amount,
            borrower,
            borrower,
            model.address,
            Helper.address0x,
            salt,
            expiration,
            loanData
        );

        await loanManager2.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager2.address, amount, { from: lender });

        await Helper.tryCatchRevert(
            () => loanManager2.lend(
                id,
                [],
                Helper.address0x,
                new BigNumber('0'),
                [],
                { from: lender }
            ),
            'Error creating the debt'
        );
    });

    it('Try request loan with 0x0 as borrower', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('11319');
        const amount = new BigNumber('441230');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));
        const loanData = await model.encodeData(new BigNumber('0'), expiration);

        await Helper.tryCatchRevert(
            () => loanManager.requestLoan(
                amount,
                model.address,
                Helper.address0x,
                borrower,
                salt,
                expiration,
                loanData,
                { from: creator }
            ),
            'The loan data is not valid'
        );
    });

    it('Try request 2 identical loans', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('19');
        const amount = new BigNumber('1431230');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));
        const loanData = await model.encodeData(amount, expiration);

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

        await Helper.tryCatchRevert(
            () => loanManager.requestLoan(
                amount,
                model.address,
                Helper.address0x,
                borrower,
                salt,
                expiration,
                loanData,
                { from: creator }
            ),
            'Request already exist'
        );
    });

    it('Should create a loan using requestLoan with the same borrower and creator', async function () {
        const borrower = accounts[2];
        const salt = new BigNumber('1');
        const amount = new BigNumber('1031230');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));
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

        const requested = await toEvent(
            loanManager.requestLoan(
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
        );

        const internalSalt = Web3Utils.hexToNumberString(
            Web3Utils.soliditySha3(
                { t: 'uint128', v: amount },
                { t: 'address', v: borrower },
                { t: 'address', v: borrower },
                { t: 'uint256', v: salt },
                { t: 'uint64', v: expiration }
            )
        );

        assert.equal(requested._id, id);
        (requested._internalSalt).should.be.bignumber.equal(internalSalt);

        const request = await getRequest(id);
        assert.equal(await loanManager.getApproved(id), true, 'The request should be approved');
        assert.equal(request.approved, true, 'The request should be approved');
        assert.equal(await loanManager.isApproved(id), true, 'The request should be approved');
        assert.equal(request.position, await loanManager.getDirectoryLength() - 1, 'The request position should be the last position of directory array');
        assert.equal(await loanManager.directory(request.position), id, 'The request should be in directory');

        assert.equal(request.open, true, 'The request should be open');
        (await loanManager.getExpirationRequest(id)).should.be.bignumber.equal(expiration);
        (request.expiration).should.be.bignumber.equal(expiration);
        assert.equal(await loanManager.getCurrency(id), 0x0);
        (await loanManager.getAmount(id)).should.be.bignumber.equal(amount);
        (request.amount).should.be.bignumber.equal(amount);
        assert.equal(await loanManager.getCosigner(id), 0x0);
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, model.address);
        assert.equal(await loanManager.getCreator(id), borrower);
        assert.equal(request.creator, borrower);
        assert.equal(await loanManager.getOracle(id), 0x0);
        assert.equal(request.oracle, 0x0);
        assert.equal(await loanManager.getBorrower(id), borrower);
        assert.equal(request.borrower, borrower);
        (request.salt).should.be.bignumber.equal(salt);
        assert.equal(request.loanData, loanData);
        assert.equal(await loanManager.canceledSettles(id), false);
        (await loanManager.getStatus(id)).should.be.bignumber.equal(new BigNumber('0'));
        (await loanManager.getDueTime(id)).should.be.bignumber.equal(new BigNumber('0'));
    });

    it('Should approve a request using approveRequest', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('13132123');
        const amount = new BigNumber('10230');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('11100'));
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

        const approved = await toEvent(
            loanManager.approveRequest(
                id, { from: borrower }
            ),
            'Approved'
        );

        assert.equal(approved._id, id);

        const request = await getRequest(id);
        assert.equal(request.approved, true, 'The request should be approved');
        (request.position).should.be.bignumber.equal((await positionDirectory(id)), 'The loan its not approved');
        assert.equal(await loanManager.directory(request.position), id);
    });

    it('Try approve a request without being the borrower', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('1312123');
        const amount = new BigNumber('130');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1100'));
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

        await Helper.tryCatchRevert(
            () => loanManager.approveRequest(
                id,
                { from: creator }
            ),
            'Only borrower can approve'
        );
    });

    it('Should lend a request using lend', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('23');
        const amount = new BigNumber('30');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('900'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const prevDirLength = await loanManager.getDirectoryLength();

        const lent = await toEvent(
            loanManager.lend(
                id,                 // Index
                [],                 // OracleData
                Helper.address0x,   // Cosigner
                new BigNumber('0'), // Cosigner limit
                [],                 // Cosigner data
                { from: lender }    // Owner/Lender
            ),
            'Lent'
        );
        assert.equal(lent._id, id);
        assert.equal(lent._lender, lender);
        lent._tokens.should.be.bignumber.equal(amount);

        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal(new BigNumber('0'));
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(new BigNumber('0'), 'The lender does not have to have tokens');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal(amount, 'The borrower should have ' + amount + ' tokens');

        const debt = await getDebt(id);
        assert.equal(debt.error, false, 'The debt should not have error');
        assert.equal(await loanManager.getCurrency(id), 0x0);
        (debt.balance).should.be.bignumber.equal(new BigNumber('0'), 'The debt should not be balance');
        assert.equal(debt.model, model.address, 'The model should be the model');
        assert.equal(debt.creator, loanManager.address, 'The creator should be the loanManager');
        assert.equal(debt.oracle, 0x0, 'The debt should not have oracle');

        assert.equal(await debtEngine.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
        assert.equal(await loanManager.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');

        const request = await getRequest(id);
        (request.position).should.be.bignumber.equal(new BigNumber('0'));
        assert.equal(await loanManager.getDirectoryLength(), prevDirLength - 1);
    });

    it('Try lend a loan without approve of the borrower', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('213');
        const amount = new BigNumber('300');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('9010'));
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
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: creator }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                Helper.address0x,
                new BigNumber('0'),
                [],
                { from: lender }
            ),
            'The request is not approved by the borrower'
        );
    });

    it('Try lend a expired loan', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('313');
        const amount = new BigNumber('440');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1010'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });

        // approve requests
        await loanManager.approveRequest(id, { from: borrower });
        await Helper.increaseTime(2000);

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                Helper.address0x,
                new BigNumber('0'),
                [],
                { from: lender }
            ),
            'The request is expired'
        );
    });

    it('Try lend a loan without tokens balance', async function () {
        const borrower = accounts[2];
        const salt = new BigNumber('763');
        const amount = new BigNumber('700');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('9010'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                Helper.address0x,
                new BigNumber('0'),
                [],
                { from: accounts[9] }
            ),
            'Error sending tokens to borrower'
        );
    });

    it('Try lend a closed loan', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('2223');
        const amount = new BigNumber('32231');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('3300'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });

        await loanManager.lend(
            id,                 // Index
            [],                 // OracleData
            Helper.address0x,   // Cosigner
            new BigNumber('0'), // Cosigner limit
            [],                 // Cosigner data
            { from: lender }    // Owner/Lender
        );

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                Helper.address0x,
                new BigNumber('0'),
                [],
                { from: lender }
            ),
            'Request is no longer open'
        );
    });

    it('Lend a loan with an oracle', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('213123');

        // 0.82711175222132156792 ETH = 4000.23333566612312 RCN
        const tokens = new BigNumber('400023333566612312000000');
        const equivalent = new BigNumber('82711175222132156792');
        const oracleData = await oracle.encodeRate(tokens, equivalent);

        const amountETH = new BigNumber('6545');
        const amountRCN = amountETH.mul(tokens).div(equivalent);

        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
        const loanData = await model.encodeData(amountETH, expiration);

        const id = await calcId(
            amountETH,
            borrower,
            borrower,
            model.address,
            oracle.address,
            salt,
            expiration,
            loanData
        );

        await loanManager.requestLoan(
            amountETH,
            model.address,
            oracle.address,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amountRCN);
        await rcn.approve(loanManager.address, amountRCN, { from: lender });

        await loanManager.lend(
            id,
            oracleData,
            Helper.address0x,
            new BigNumber('0'),
            [],
            { from: lender }
        );

        (await rcn.balanceOf(lender)).should.be.bignumber.equal('0');

        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal(Math.floor(amountRCN));

        const request = await getRequest(id);
        assert.equal(request.oracle, oracle.address);
        assert.equal(await loanManager.getCurrency(id), 0x0);
        assert.equal(request.cosigner, Helper.address0x);
        (request.salt).should.be.bignumber.equal(salt);
    });

    it('Use cosigner in lend', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('123123');
        const amount = new BigNumber('5545');
        const cosignerCost = new BigNumber((await cosigner.getDummyCost()).toString());
        const totalCost = cosignerCost.plus(new BigNumber(amount));
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, totalCost);
        await rcn.approve(loanManager.address, totalCost, { from: lender });
        const data = await cosigner.data();

        const cosigned = await toEvent(
            loanManager.lend(
                id,
                [],
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Cosigner limit
                data,               // Cosigner data
                { from: lender }
            ),
            'Cosigned'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal(cosignerCost);
        (await rcn.balanceOf(lender)).should.be.bignumber.equal('0');

        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal(amount);

        assert.equal(cosigned._id, id);
        assert.equal(cosigned._cosigner, cosigner.address);
        (cosigned._cost).should.be.bignumber.equal(cosignerCost);

        const request = await getRequest(id);
        assert.equal(request.cosigner, cosigner.address);
        (request.salt).should.be.bignumber.equal(salt);
    });

    it('Try lend a loan with cosigner and send 0x0 as id parameter of Cosign function', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber(1998);
        const amount = new BigNumber(90880);
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        await cosigner.setCustomData(new BigNumber('0'), new BigNumber('0'));
        const id0x0Data = await cosigner.customData();

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Cosigner limit
                id0x0Data,          // Cosigner data
                { from: lender }
            ),
            'Cosigner 0x0 is not valid'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try Cosign function the request with bad position', async function () {
        const borrower = accounts[2];
        const salt = new BigNumber(1998);
        const amount = new BigNumber(90880);
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('100'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await Helper.tryCatchRevert(
            () => loanManager.cosign(
                id,
                0
            ),
            'Request cosigned is invalid'
        );
    });

    it('Try lend a loan with cosigner cost very high', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber(546546);
        const amount = new BigNumber(11);
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        await cosigner.setCustomData(id, MAX_UINT256);

        const maxCostData = await cosigner.customData();
        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                cosigner.address,   // Cosigner
                new BigNumber('1'), // Cosigner limit
                maxCostData,        // Cosigner data
                { from: lender }
            ),
            'Cosigner cost exceeded'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try lend a loan with cosigner and Cosign function return false', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber(57476);
        const amount = new BigNumber(574);
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const badData = await cosigner.badData();

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Cosigner limit
                badData,            // Cosigner data
                { from: lender }
            ),
            'Cosign method returned false'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try lend when cosigner is not a cosigner contract', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber(42342);
        const amount = new BigNumber(44444);
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1600'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                accounts[8],        // Address as cosigner
                new BigNumber('0'),
                [],
                { from: lender }
            ),
            ''
        );

        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try lend a loan with cosigner and requestCosign dont callback to the engine with Cosign', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber(87868);
        const amount = new BigNumber(456345);
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1600'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const noCosignData = await cosigner.noCosignData();

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Cosigner limit
                noCosignData,       // Cosigner data
                { from: lender }
            ),
            'Cosigner didn\'t callback'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try lend a loan with cosigner and dont have balance to pay the cosign', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber(123123);
        const amount = new BigNumber(5545);
        const cosignerCost = new BigNumber((await cosigner.getDummyCost()).toString());
        const totalCost = cosignerCost.plus(new BigNumber(amount));
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, totalCost);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const data = await cosigner.data();

        await Helper.tryCatchRevert(
            () => loanManager.lend(
                id,
                [],
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Cosigner limit
                data,               // Cosigner data
                { from: lender }
            ),
            'Error paying cosigner'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(totalCost);
    });

    it('Should lend a request using settleLend', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('2763');
        const amount = new BigNumber('3320');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSig = await web3.eth.sign(creator, id);
        const borrowerSig = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });

        const settledLend = await toEvent(
            loanManager.settleLend(
                settleData,
                loanData,
                Helper.address0x,
                new BigNumber('0'),
                [],
                [],
                creatorSig,
                borrowerSig,
                { from: lender }
            ),
            'SettledLend'
        );

        assert.equal(settledLend._id, id);
        assert.equal(settledLend._lender, lender);
        assert.equal(settledLend._tokens.toString(), amount.toString());

        (await rcn.balanceOf(lender)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal(amount);

        const request = await getRequest(id);
        assert.equal(request.open, false, 'The request should not be open');
        assert.equal(request.approved, true, 'The request should be approved');
        (request.position).should.be.bignumber.equal(new BigNumber('0'), 'The loan its not approved');
        (request.expiration).should.be.bignumber.equal(expiration);
        assert.equal(await loanManager.getCurrency(id), 0x0);
        (request.amount).should.be.bignumber.equal(amount);
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, model.address);
        assert.equal(request.creator, creator);
        assert.equal(request.oracle, 0x0);
        assert.equal(request.borrower, borrower);
        (request.salt).should.be.bignumber.equal(salt);

        assert.equal(await debtEngine.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
        assert.equal(await loanManager.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
    });

    it('SettleLend a loan should be fail if the model create return a diferent id', async function () {
        const testDebtEngine = await TestDebtEngine.new(rcn.address);
        const loanManager2 = await LoanManager.new(testDebtEngine.address);

        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('2763');
        const amount = new BigNumber('3320');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
        const loanData = await model.encodeData(amount, expiration);

        const encodeData = await loanManager2.encodeRequest(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            creator,
            loanData
        );

        const settleData = encodeData[0];
        const id = encodeData[1];

        const creatorSig = await web3.eth.sign(creator, id);
        const borrowerSig = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager2.address, amount, { from: lender });

        await Helper.tryCatchRevert(
            () => loanManager2.settleLend(
                settleData,
                loanData,
                Helper.address0x,
                new BigNumber('0'),
                [],
                [],
                creatorSig,
                borrowerSig,
                { from: lender }
            ),
            'Error creating debt registry'
        );
    });

    it('settleLend a loan with an oracle', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('1122');

        // 0.82711175222132156792 ETH = 4000.23333566612312 RCN
        const tokens = new BigNumber('400023333566612312000000');
        const equivalent = new BigNumber('82711175222132156792');
        const oracleData = await oracle.encodeRate(tokens, equivalent);

        const amountETH = new BigNumber('3320');
        const amountRCN = amountETH.mul(tokens).div(equivalent);

        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
        const loanData = await model.encodeData(amountETH, expiration);

        const encodeData = await calcSettleId(
            amountETH,
            borrower,
            creator,
            model.address,
            oracle.address,
            salt,
            expiration,
            loanData
        );
        const settleData = encodeData[0];
        const id = encodeData[1];

        const creatorSig = await web3.eth.sign(creator, id);
        const borrowerSig = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amountRCN);
        await rcn.approve(loanManager.address, amountRCN, { from: lender });

        await loanManager.settleLend(
            settleData,
            loanData,
            Helper.address0x,
            new BigNumber('0'),
            [],
            oracleData,
            creatorSig,
            borrowerSig,
            { from: lender }
        );

        (await rcn.balanceOf(lender)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal(Math.floor(amountRCN));

        const request = await getRequest(id);
        assert.equal(request.open, false, 'The request should not be open');
        assert.equal(request.approved, true, 'The request should be approved');
        (request.position).should.be.bignumber.equal(new BigNumber('0'), 'The loan its not approved');
        (request.expiration).should.be.bignumber.equal(expiration);
        assert.equal(request.oracle, oracle.address);
        assert.equal(await loanManager.getCurrency(id), 0x0);
        (request.amount).should.be.bignumber.equal(Math.floor(amountETH));
        assert.equal(request.cosigner, 0x0);
        assert.equal(request.model, model.address);
        assert.equal(request.creator, creator);
        assert.equal(request.oracle, oracle.address);
        assert.equal(request.borrower, borrower);
        (request.salt).should.be.bignumber.equal(salt);

        assert.equal(await debtEngine.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
        assert.equal(await loanManager.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
    });

    it('Try settleLend with a expired data time', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('2763');
        const amount = new BigNumber('3320');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
        const loanData = await model.encodeData(amount, expiration);

        const encodeData = await calcSettleId(
            amount,
            borrower,
            creator,
            model.address,
            Helper.address0x,
            salt,
            expiration - 10000,
            loanData
        );

        const settleData = encodeData[0];
        const id = encodeData[1];

        const creatorSig = await web3.eth.sign(creator, id);
        const borrowerSig = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                Helper.address0x,
                new BigNumber('0'),
                [],
                [],
                creatorSig,
                borrowerSig,
                { from: lender }
            ),
            'Loan request is expired'
        );

        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
    });

    it('Try settleLend without approve tokens to loanManager', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('2763');
        const amount = new BigNumber('3320');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSig = await web3.eth.sign(creator, id);
        const borrowerSig = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                Helper.address0x,
                new BigNumber('0'),
                [],
                [],
                creatorSig,
                borrowerSig,
                { from: lender }
            ),
            'Error sending tokens to borrower'
        );

        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
    });

    it('Try settleLend a request already exist', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('2763');
        const amount = new BigNumber('3320');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSig = await web3.eth.sign(creator, id);
        const borrowerSig = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount.mul(2));
        await rcn.approve(loanManager.address, amount.mul(2), { from: lender });

        await loanManager.settleLend(
            settleData,
            loanData,
            Helper.address0x,
            new BigNumber('0'),
            [],
            [],
            creatorSig,
            borrowerSig,
            { from: lender }
        );

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                Helper.address0x,
                new BigNumber('0'),
                [],
                [],
                creatorSig,
                borrowerSig,
                { from: lender }
            ),
            'Request already exist'
        );

        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal(amount);
    });

    it('Use cosigner in settleLend', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('2732463');
        const amount = new BigNumber('355320');
        const cosignerCost = new BigNumber((await cosigner.getDummyCost()).toString());
        const totalCost = cosignerCost.plus(new BigNumber(amount));
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSigSL = await web3.eth.sign(creator, id);
        const borrowerSigSL = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, totalCost);
        await rcn.approve(loanManager.address, totalCost, { from: lender });
        const data = await cosigner.data();

        const cosigned = await toEvent(
            loanManager.settleLend(
                settleData,
                loanData,
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Max cosigner cost
                data,               // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            'Cosigned'
        );

        assert.equal(cosigned._id, id);
        assert.equal(cosigned._cosigner, cosigner.address);
        (cosigned._cost).should.be.bignumber.equal(cosignerCost);

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal(cosignerCost);
        (await rcn.balanceOf(lender)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal(amount);

        const request = await getRequest(id);
        assert.equal(request.cosigner, cosigner.address);
        (request.salt).should.be.bignumber.equal(salt);
    });

    it('Try settleLend with cosigner and send 0x0 as id parameter of Cosign function', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('273263');
        const amount = new BigNumber('32134');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSigSL = await web3.eth.sign(creator, id);
        const borrowerSigSL = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        await cosigner.setCustomData(new BigNumber('0'), new BigNumber('0'));
        const id0x0Data = await cosigner.customData();

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Max cosigner cost
                id0x0Data,          // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            'Cosigner 0x0 is not valid'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try settleLend with cosigner cost very high', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('432354');
        const amount = new BigNumber('66');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSigSL = await web3.eth.sign(creator, id);
        const borrowerSigSL = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        await cosigner.setCustomData(id, MAX_UINT256);
        const maxCostData = await cosigner.customData();

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                cosigner.address,   // Cosigner
                new BigNumber('1'), // Max cosigner cost
                maxCostData,        // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            'Cosigner cost exceeded'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try settleLend with cosigner and Cosign function return false', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('273263');
        const amount = new BigNumber('32134');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSigSL = await web3.eth.sign(creator, id);
        const borrowerSigSL = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const badData = await cosigner.badData();

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Max cosigner cost
                badData,            // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            'Cosign method returned false'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try settleLend when cosigner is not a cosigner contract', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('273263');
        const amount = new BigNumber('32134');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSigSL = await web3.eth.sign(creator, id);
        const borrowerSigSL = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                accounts[8],        // Address as cosigner
                new BigNumber('0'),
                [],
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            ''
        );

        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try settleLend a loan with cosigner and requestCosign dont callback to the engine with Cosign', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('273263');
        const amount = new BigNumber('32134');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSigSL = await web3.eth.sign(creator, id);
        const borrowerSigSL = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const noCosignData = await cosigner.noCosignData();

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Max cosigner cost
                noCosignData,       // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            'Cosigner didn\'t callback'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(amount);
    });

    it('Try settleLend a loan with cosigner and dont have balance to pay the cosign', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('4563');
        const amount = new BigNumber('74575');
        const cosignerCost = new BigNumber((await cosigner.getDummyCost()).toString());
        const totalCost = cosignerCost.plus(new BigNumber(amount));
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('7400'));
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
        const id = encodeData[1];

        const creatorSigSL = await web3.eth.sign(creator, id);
        const borrowerSigSL = await web3.eth.sign(borrower, id);

        await rcn.setBalance(lender, totalCost);
        await rcn.approve(loanManager.address, amount, { from: lender });
        const data = await cosigner.data();

        await Helper.tryCatchRevert(
            () => loanManager.settleLend(
                settleData,
                loanData,
                cosigner.address,   // Cosigner
                new BigNumber('0'), // Max cosigner cost
                data,               // Cosigner data
                [],
                creatorSigSL,
                borrowerSigSL,
                { from: lender }
            ),
            'Error paying cosigner'
        );

        (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(borrower)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(debtEngine.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(loanManager.address)).should.be.bignumber.equal('0');
        (await rcn.balanceOf(lender)).should.be.bignumber.equal(totalCost);
    });

    it('The creator should cancel a request using cancel', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('3434225');
        const amount = new BigNumber('55');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: creator }
        );

        const canceled = await toEvent(
            loanManager.cancel(
                id,
                { from: creator }
            ),
            'Canceled'
        );
        assert.equal(canceled._id, id);
        assert.equal(canceled._canceler, creator);

        const request = await loanManager.requests(id);

        assert.equal(request[0], 0);
        assert.equal(request[1], 0);
        assert.equal(request[2], 0);
        assert.equal(request[3], 0);
        assert.equal(request[4], 0);
        assert.equal(request[5], 0);
        assert.equal(request[6], 0);
        assert.equal(request[7], 0);
        assert.equal(request[8], 0);
        assert.equal(request[9], 0);
        assert.equal(request[10], 0);
        assert.equal(request[11], '0x');

        assert.equal(await loanManager.getLoanData(id), '0x');
    });

    it('The borrower should cancel a request using cancel', async function () {
        const borrower = accounts[2];
        const salt = new BigNumber('3522');
        const amount = new BigNumber('5000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        const dlength = await loanManager.getDirectoryLength();

        const canceled = await toEvent(
            loanManager.cancel(
                id,
                { from: borrower }
            ),
            'Canceled'
        );

        (await loanManager.getDirectoryLength()).should.be.bignumber.equal(dlength.toNumber() - 1);

        assert.equal(canceled._id, id);
        assert.equal(canceled._canceler, borrower);

        const request = await loanManager.requests(id);

        assert.equal(request[0], 0);
        assert.equal(request[1], 0);
        assert.equal(request[2], 0);
        assert.equal(request[3], 0);
        assert.equal(request[4], 0);
        assert.equal(request[5], 0);
        assert.equal(request[6], 0);
        assert.equal(request[7], 0);
        assert.equal(request[8], 0);
        assert.equal(request[9], 0);
        assert.equal(request[10], 0);
        assert.equal(request[11], '0x');

        assert.equal(await loanManager.getLoanData(id), '0x');
    });

    it('Try cancel a request without being the borrower or the creator', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('6000');
        const amount = new BigNumber('6000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: creator }
        );

        await Helper.tryCatchRevert(
            () => loanManager.cancel(
                id,
                { from: lender }
            ),
            'Only borrower or creator can cancel a request'
        );
    });

    it('Try cancel a closed request', async function () {
        const borrower = accounts[2];
        const lender = accounts[3];
        const salt = new BigNumber('33422');
        const amount = new BigNumber('4555');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1700'));
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

        await loanManager.requestLoan(
            amount,
            model.address,
            Helper.address0x,
            borrower,
            salt,
            expiration,
            loanData,
            { from: borrower }
        );

        await rcn.setBalance(lender, amount);
        await rcn.approve(loanManager.address, amount, { from: lender });

        await loanManager.lend(
            id,
            [],
            Helper.address0x,
            new BigNumber('0'),
            [],
            { from: lender }
        );

        await Helper.tryCatchRevert(
            () => loanManager.cancel(
                id,
                { from: lender }
            ),
            'Request is no longer open or not requested'
        );
    });

    it('The creator should cancel a request using settleCancel', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('2956');
        const amount = new BigNumber('9320');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('3400'));
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
        const id = encodeData[1];

        const settledCancel = await toEvent(
            loanManager.settleCancel(
                settleData,
                loanData,
                { from: creator }
            ),
            'SettledCancel'
        );
        assert.equal(settledCancel._id, id);
        assert.equal(settledCancel._canceler, creator);

        assert.equal(await loanManager.canceledSettles(id), true);
    });

    it('The borrower should cancel a request using settleCancel', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('564465');
        const amount = new BigNumber('9999');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('3400'));
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
        const id = encodeData[1];

        const settledCancel = await toEvent(
            loanManager.settleCancel(
                settleData,
                loanData,
                { from: borrower }
            ),
            'SettledCancel'
        );
        assert.equal(settledCancel._id, id);
        assert.equal(settledCancel._canceler, borrower);

        assert.equal(await loanManager.canceledSettles(id), true);
    });

    it('Try cancel a request without have the signature', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const otherAcc = accounts[7];
        const salt = new BigNumber('5345');
        const amount = new BigNumber('9977699');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('3400'));
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

        await Helper.tryCatchRevert(
            () => loanManager.settleCancel(
                settleData,
                loanData,
                { from: otherAcc }
            ),
            'Only borrower or creator can cancel a settle'
        );
    });

    it('Different loan managers should have different ids', async function () {
        const loanManager2 = await LoanManager.new(debtEngine.address);

        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('2');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('3');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        await Helper.tryCatchRevert(
            loanManager.internalSalt(
                0x2
            ),
            'Request does not exist'
        );
    });

    it('Should register approve using the borrower signature', async function () {
        const creator = accounts[1];
        const borrower = accounts[2];
        const salt = new BigNumber('4');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('5');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('6');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('4');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('5');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('6');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('7');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('8');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
        const salt = new BigNumber('7');
        const amount = new BigNumber('1000');
        const expiration = (new BigNumber((await Helper.getBlockTime()).toString())).plus(new BigNumber('1000'));

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
