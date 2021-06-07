const LoanManager = artifacts.require('LoanManager');
const TestModel = artifacts.require('TestModel');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestDebtEngine = artifacts.require('TestDebtEngine');
const TestCosigner = artifacts.require('TestCosigner');
const TestRateOracle = artifacts.require('TestRateOracle');
const TestLoanApprover = artifacts.require('TestLoanApprover');
const TestLoanCallback = artifacts.require('TestLoanCallback');

const {
    constants,
    time,
    expectRevert,
} = require('@openzeppelin/test-helpers');

const {
    expect,
    bn,
    STATUS_ONGOING,
    STATUS_REQUEST,
    toEvents,
    toBytes32,
} = require('./Helper.js');

const MAX_UINT256 = bn('2').pow(bn('256')).sub(bn('1'));

contract('Test LoanManager Diaspore', function (accounts) {
    let rcn;
    let debtEngine;
    let loanManager;
    let model;
    let cosigner;
    let oracle;
    let loanApprover;

    async function toFee (amount) {
        const feePerc = await debtEngine.fee();
        const BASE = await debtEngine.BASE();

        return amount.mul(feePerc).div(BASE);
    }

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Requested');
        assert.ok(event);
        return event.args._id;
    }

    async function calcId (_amount, _borrower, _creator, _model, _oracle, _salt, _expiration, _data, _callback = constants.ZERO_ADDRESS) {
        const _two = '0x02';
        const controlId = await loanManager.calcId(
            _amount,
            _borrower,
            _creator,
            model.address,
            _oracle,
            _callback,
            _salt,
            _expiration,
            _data,
        );

        const controlInternalSalt = await loanManager.buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _callback,
            _salt,
            _expiration,
        );

        const internalSalt = web3.utils.hexToNumberString(
            web3.utils.soliditySha3(
                { t: 'uint128', v: _amount },
                { t: 'address', v: _borrower },
                { t: 'address', v: _creator },
                { t: 'address', v: _callback },
                { t: 'uint256', v: _salt },
                { t: 'uint64', v: _expiration },
            ),
        );

        const id = web3.utils.soliditySha3(
            { t: 'uint8', v: _two },
            { t: 'address', v: debtEngine.address },
            { t: 'address', v: loanManager.address },
            { t: 'address', v: model.address },
            { t: 'address', v: _oracle },
            { t: 'uint256', v: internalSalt },
            { t: 'bytes', v: _data },
        );

        expect(internalSalt).to.eq.BN(controlInternalSalt, 'bug internalSalt');
        assert.equal(id, controlId, 'bug calcId');
        return id;
    }

    async function calcSettleId (
        _amount,
        _borrower,
        _creator,
        _model,
        _oracle,
        _salt,
        _expiration,
        _data,
        _callback = constants.ZERO_ADDRESS,
    ) {
        const _two = '0x02';
        const encodeData = await loanManager.encodeRequest(
            _amount,
            _model,
            _oracle,
            _borrower,
            _callback,
            _salt,
            _expiration,
            _creator,
            _data,
        );
        const controlId = encodeData[1];
        const controlInternalSalt = await loanManager.buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _callback,
            _salt,
            _expiration,
        );

        const internalSalt = web3.utils.hexToNumberString(
            web3.utils.soliditySha3(
                { t: 'uint128', v: _amount },
                { t: 'address', v: _borrower },
                { t: 'address', v: _creator },
                { t: 'address', v: _callback },
                { t: 'uint256', v: _salt },
                { t: 'uint64', v: _expiration },
            ),
        );

        const id = web3.utils.soliditySha3(
            { t: 'uint8', v: _two },
            { t: 'address', v: debtEngine.address },
            { t: 'address', v: loanManager.address },
            { t: 'address', v: model.address },
            { t: 'address', v: _oracle },
            { t: 'uint256', v: internalSalt },
            { t: 'bytes', v: _data },
        );

        expect(internalSalt).to.eq.BN(controlInternalSalt, 'bug internalSalt');
        assert.equal(id, controlId, 'bug calcId');
        return encodeData;
    }

    function calcSignature (_id, _message) {
        return web3.utils.soliditySha3(
            { t: 'bytes32', v: _id },
            { t: 'string', v: _message },
        );
    }

    before('Create engine and model', async function () {
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address, accounts[5], 100);
        loanManager = await LoanManager.new(debtEngine.address);
        model = await TestModel.new();
        await model.setEngine(debtEngine.address);
        loanApprover = await TestLoanApprover.new();
        cosigner = await TestCosigner.new(rcn.address);
        oracle = await TestRateOracle.new();
    });

    beforeEach('Reset all rcn balance', async function () {
        for (let i = 0; i < accounts.length; i++) {
            await rcn.setBalance(accounts[i], 0);
            await rcn.approve(loanManager.address, 0, { from: accounts[i] });
        }
        await rcn.setBalance(cosigner.address, 0);
        await rcn.setBalance(loanManager.address, 0);
        await rcn.setBalance(debtEngine.address, 0);
        await rcn.setBalance(loanApprover.address, 0);

        expect(await rcn.totalSupply()).to.eq.BN(0);
    });

    describe('Constructor', function () {
        it('Try instance a LoanManager instance with token == 0x0', async function () {
            const testDebtEngine = await TestDebtEngine.new(constants.ZERO_ADDRESS);

            await expectRevert(
                () => LoanManager.new(testDebtEngine.address),
                'Error loading token',
            );
        });
    });
    describe('Getters', function () {
        it('The getters legacy(uint256) and actual(bytes32) should be equals', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('13132123');
            const amount = bn('1');
            const expiration = (await time.latest()) + 11100;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                creator,
                model.address,
                oracle.address,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                oracle.address,   // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            );

            await loanManager.approveRequest(id, { from: borrower });

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            await cosigner.setCustomData(id, bn('0'));

            await loanManager.lend(
                id,
                await oracle.encodeRate(bn('1'), bn('1')),
                cosigner.address,
                0,
                await cosigner.customData(),
                [],
                { from: lender },
            );

            assert.equal(await loanManager.getBorrower(id), borrower);
            assert.equal(await loanManager.methods['getBorrower(bytes32)'](id), borrower);

            assert.equal(await loanManager.getCreator(id), creator);
            assert.equal(await loanManager.methods['getCreator(bytes32)'](id), creator);

            assert.equal(await loanManager.getOracle(id), oracle.address);
            assert.equal(await loanManager.methods['getOracle(bytes32)'](id), oracle.address);

            assert.equal(await loanManager.getCosigner(id), cosigner.address);
            assert.equal(await loanManager.methods['getCosigner(bytes32)'](id), cosigner.address);

            assert.equal(await loanManager.getCurrency(id), constants.ZERO_BYTES32);
            assert.equal(await loanManager.methods['getCurrency(bytes32)'](id), constants.ZERO_BYTES32);

            expect(await loanManager.getAmount(id)).to.eq.BN('1');
            expect(await loanManager.methods['getAmount(bytes32)'](id)).to.eq.BN('1');

            expect(await loanManager.getExpirationRequest(id)).to.eq.BN(expiration);
            expect(await loanManager.methods['getExpirationRequest(bytes32)'](id)).to.eq.BN(expiration);

            assert.isTrue(await loanManager.getApproved(id));
            assert.isTrue(await loanManager.methods['getApproved(bytes32)'](id));

            expect(await loanManager.getDueTime(id)).to.eq.BN(expiration);
            expect(await loanManager.methods['getDueTime(bytes32)'](id)).to.eq.BN(expiration);

            const obligation = await loanManager.getObligation(id, expiration);
            expect(obligation.amount).to.eq.BN(amount);
            expect(obligation.fee).to.eq.BN(await toFee(amount));
            assert.isTrue(obligation.defined);
            const obligation32 = await loanManager.methods['getObligation(bytes32,uint64)'](id, expiration);
            expect(obligation32.amount).to.eq.BN(amount);
            expect(obligation32.fee).to.eq.BN(await toFee(amount));
            assert.isTrue(obligation32.defined);

            const closingObligation = await loanManager.getClosingObligation(id);
            expect(closingObligation.amount).to.eq.BN(amount);
            expect(closingObligation.fee).to.eq.BN(await toFee(amount));
            const closingObligation32 = await loanManager.methods['getClosingObligation(bytes32)'](id);
            expect(closingObligation32.amount).to.eq.BN(amount);
            expect(closingObligation32.fee).to.eq.BN(await toFee(amount));

            const estimateObligation = await loanManager.getEstimateObligation(id);
            expect(estimateObligation.amount).to.eq.BN(amount);
            expect(estimateObligation.fee).to.eq.BN(await toFee(amount));
            const estimateObligation32 = await loanManager.methods['getEstimateObligation(bytes32)'](id);
            expect(estimateObligation32.amount).to.eq.BN(amount);
            expect(estimateObligation32.fee).to.eq.BN(await toFee(amount));

            assert.equal(await loanManager.getLoanData(id), loanData);
            assert.equal(await loanManager.methods['getLoanData(bytes32)'](id), loanData);

            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await loanManager.methods['getStatus(bytes32)'](id)).to.eq.BN(STATUS_ONGOING);

            assert.equal(await loanManager.ownerOf(id), lender);
            assert.equal(await loanManager.methods['ownerOf(bytes32)'](id), lender);
        });
    });
    describe('Function internalSalt', function () {
        it('Should return future internal salt', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('3');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const pInternalSalt = await loanManager.buildInternalSalt(
                amount,
                borrower,
                creator,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
            );

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            expect(await loanManager.internalSalt(id)).to.eq.BN(pInternalSalt);
        });
        it('Should fail internal salt if id does not exist', async function () {
            await expectRevert(
                loanManager.internalSalt(
                    web3.utils.padLeft('0x2', 32),
                ),
                'Request does not exist',
            );
        });
    });
    describe('Function requestLoan', function () {
        it('Should request a loan using requestLoan', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('1');
            const amount = bn('1031230');
            const expiration = (await time.latest()) + 1000;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const Requested = await toEvents(
                loanManager.requestLoan(
                    amount,           // Amount
                    model.address,    // Model
                    constants.ZERO_ADDRESS,        // Oracle
                    borrower,         // Borrower
                    constants.ZERO_ADDRESS,        // Callback
                    salt,             // salt
                    expiration,       // Expiration
                    loanData,         // Loan data
                    { from: creator }, // Creator
                ),
                'Requested',
            );

            assert.equal(Requested._id, id);
            expect(Requested._amount).to.eq.BN(amount);
            assert.equal(Requested._model, model.address);
            assert.equal(Requested._creator, creator);
            assert.equal(Requested._oracle, constants.ZERO_ADDRESS);
            assert.equal(Requested._borrower, borrower);
            expect(Requested._salt).to.eq.BN(salt);
            assert.equal(Requested._loanData, loanData);
            expect(Requested._expiration).to.eq.BN(expiration);

            const request = await loanManager.requests(id);
            assert.isTrue(request.open, 'The request should be open');
            assert.isFalse(await loanManager.getApproved(id), 'The request should not be approved');
            assert.isFalse(request.approved, 'The request should not be approved');
            expect(await loanManager.getExpirationRequest(id)).to.eq.BN(expiration);
            expect(request.expiration).to.eq.BN(expiration);
            assert.equal(await loanManager.getCurrency(id), 0x0);
            expect(await loanManager.getAmount(id)).to.eq.BN(amount);
            expect(request.amount).to.eq.BN(amount);
            assert.equal(await loanManager.getCosigner(id), 0x0);
            assert.equal(request.cosigner, constants.ZERO_ADDRESS);
            assert.equal(request.model, model.address);
            assert.equal(await loanManager.getCreator(id), creator);
            assert.equal(request.creator, creator);
            assert.equal(await loanManager.getOracle(id), constants.ZERO_ADDRESS);
            assert.equal(request.oracle, constants.ZERO_ADDRESS);
            assert.equal(await loanManager.getBorrower(id), borrower);
            assert.equal(request.borrower, borrower);
            expect(request.salt).to.eq.BN(salt);
            assert.equal(request.loanData, loanData);
            assert.isFalse(await loanManager.canceledSettles(id));
            expect(await loanManager.getStatus(id)).to.eq.BN('0');
            expect(await loanManager.getDueTime(id)).to.eq.BN('0');
        });
        it('Different loan managers should have different ids', async function () {
            const loanManager2 = await LoanManager.new(debtEngine.address);

            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('2');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id1 = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            const id2 = await getId(loanManager2.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            assert.notEqual(id1, id2);
        });
        it('Try request loan with constants.ZERO_ADDRESS as borrower', async function () {
            const creator = accounts[1];
            const borrower = constants.ZERO_ADDRESS;
            const salt = bn('319');
            const amount = bn('143441230');
            const expiration = (await time.latest()) + 1000;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            await expectRevert(
                () => loanManager.requestLoan(
                    amount,
                    model.address,
                    constants.ZERO_ADDRESS,
                    borrower,
                    constants.ZERO_ADDRESS,
                    salt,
                    expiration,
                    loanData,
                    { from: creator },
                ),
                'The request should have a borrower',
            );
        });
        it('Request a loan should be fail if the model create return a diferent id', async function () {
            const testDebtEngine = await TestDebtEngine.new(rcn.address);
            const loanManager2 = await LoanManager.new(testDebtEngine.address);
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('23');
            const amount = bn('30');
            const expiration = (await time.latest()) + 900;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await loanManager2.calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager2.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager2.address, amount, { from: lender });

            await expectRevert(
                () => loanManager2.lend(
                    id,
                    [],
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    { from: lender },
                ),
                'Error creating the debt',
            );
        });
        it('Try request loan with constants.ZERO_ADDRESS as borrower', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('11319');
            const amount = bn('441230');
            const expiration = (await time.latest()) + 1000;
            const loanData = await model.encodeData(0, expiration, 0, expiration);

            await expectRevert(
                () => loanManager.requestLoan(
                    amount,
                    model.address,
                    constants.ZERO_ADDRESS,
                    borrower,
                    constants.ZERO_ADDRESS,
                    salt,
                    expiration,
                    loanData,
                    { from: creator },
                ),
                'The loan data is not valid',
            );
        });
        it('Try request 2 identical loans', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('19');
            const amount = bn('1431230');
            const expiration = (await time.latest()) + 1000;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: creator },
            );

            await expectRevert(
                () => loanManager.requestLoan(
                    amount,
                    model.address,
                    constants.ZERO_ADDRESS,
                    borrower,
                    constants.ZERO_ADDRESS,
                    salt,
                    expiration,
                    loanData,
                    { from: creator },
                ),
                'Request already exist',
            );
        });
        it('Try request again a canceled request', async function () {
            const borrower = accounts[2];
            const creator = accounts[4];
            const salt = bn('33422');
            const amount = bn('4555');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: creator },
            );

            // Sign loan id
            const signature = await web3.eth.sign(id, borrower);

            await loanManager.registerApproveRequest(
                id,
                signature,
                { from: creator },
            );

            await loanManager.cancel(
                id,
                { from: borrower },
            );

            await expectRevert(
                () => loanManager.requestLoan(
                    amount,
                    model.address,
                    constants.ZERO_ADDRESS,
                    borrower,
                    constants.ZERO_ADDRESS,
                    salt,
                    expiration,
                    loanData,
                    { from: creator },
                ),
                'The debt was canceled',
            );
        });
        it('Should create a loan using requestLoan with the same borrower and creator', async function () {
            const borrower = accounts[2];
            const salt = bn('1');
            const amount = bn('1031230');
            const expiration = (await time.latest()) + 1000;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const Requested = await toEvents(
                loanManager.requestLoan(
                    amount,            // Amount
                    model.address,     // Model
                    constants.ZERO_ADDRESS,         // Oracle
                    borrower,          // Borrower
                    constants.ZERO_ADDRESS,         // Callback
                    salt,              // salt
                    expiration,        // Expiration
                    loanData,          // Loan data
                    { from: borrower }, // Creator
                ),
                'Requested',
            );

            assert.equal(Requested._id, id);
            expect(Requested._amount).to.eq.BN(amount);
            assert.equal(Requested._model, model.address);
            assert.equal(Requested._creator, borrower);
            assert.equal(Requested._oracle, constants.ZERO_ADDRESS);
            assert.equal(Requested._borrower, borrower);
            expect(Requested._salt).to.eq.BN(salt);
            assert.equal(Requested._loanData, loanData);
            expect(Requested._expiration).to.eq.BN(expiration);

            const request = await loanManager.requests(id);
            assert.isTrue(await loanManager.getApproved(id), 'The request should be approved');
            assert.isTrue(request.approved, 'The request should be approved');

            assert.isTrue(request.open, 'The request should be open');
            expect(await loanManager.getExpirationRequest(id)).to.eq.BN(expiration);
            expect(request.expiration).to.eq.BN(expiration);
            assert.equal(await loanManager.getCurrency(id), constants.ZERO_BYTES32);
            expect(await loanManager.getAmount(id)).to.eq.BN(amount);
            expect(request.amount).to.eq.BN(amount);
            assert.equal(await loanManager.getCosigner(id), constants.ZERO_ADDRESS);
            assert.equal(request.cosigner, constants.ZERO_ADDRESS);
            assert.equal(request.model, model.address);
            assert.equal(await loanManager.getCreator(id), borrower);
            assert.equal(request.creator, borrower);
            assert.equal(await loanManager.getOracle(id), constants.ZERO_ADDRESS);
            assert.equal(request.oracle, constants.ZERO_ADDRESS);
            assert.equal(await loanManager.getBorrower(id), borrower);
            assert.equal(request.borrower, borrower);
            expect(request.salt).to.eq.BN(salt);
            assert.equal(request.loanData, loanData);
            assert.isFalse(await loanManager.canceledSettles(id));
            expect(await loanManager.getStatus(id)).to.eq.BN('0');
            expect(await loanManager.getDueTime(id)).to.eq.BN('0');
        });
    });
    describe('Function approveRequest', function () {
        it('Should approve a request using approveRequest', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('13132123');
            const amount = bn('10230');
            const expiration = (await time.latest()) + 11100;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            );

            const approved = await toEvents(
                loanManager.approveRequest(
                    id, { from: borrower },
                ),
                'Approved',
            );

            assert.equal(approved._id, id);

            const request = await loanManager.requests(id);
            assert.isTrue(request.approved, 'The request should be approved');
        });
        it('Try approve a request without being the borrower', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('1312123');
            const amount = bn('130');
            const expiration = (await time.latest()) + 1100;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            );

            await expectRevert(
                () => loanManager.approveRequest(
                    id,
                    { from: creator },
                ),
                'Only borrower can approve',
            );
        });
    });
    describe('Function registerApproveRequest', function () {
        it('Should register approve using the borrower signature', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('4');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            // Sign loan id
            const signature = await web3.eth.sign(calcSignature(id, 'sign approve request'), borrower);

            const events = await toEvents(
                loanManager.registerApproveRequest(
                    id,
                    signature,
                    { from: accounts[2] },
                ),
                'Approved',
                'ApprovedBySignature',
            );

            assert.equal(events[0]._id, id);
            assert.equal(events[1]._id, id);
            assert.isTrue(await loanManager.getApproved(id));

            const request = await loanManager.requests(id);
            assert.isTrue(request.approved);

            // Should add the entry to the directory
        });
        it('Should ignore approve with wrong borrower signature', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('5');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            // Sign loan id
            const signature = await web3.eth.sign(calcSignature(toBytes32(accounts[3]), 'sign approve request'), borrower);

            const receipt = await loanManager.registerApproveRequest(
                id,
                signature,
                { from: accounts[2] },
            );
            assert.isFalse(await loanManager.getApproved(id));

            const request = await loanManager.requests(id);
            assert.isFalse(request.approved);

            const event = receipt.logs.find(l => l.event === 'Approved');
            assert.notOk(event);
        });
        it('Should ignore a second approve using registerApprove', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('6');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            // Sign loan id
            const signature = await web3.eth.sign(calcSignature(id, 'sign approve request'), borrower);

            const Approved = await toEvents(
                loanManager.registerApproveRequest(
                    id,
                    signature,
                    { from: accounts[2] },
                ),
                'Approved',
            );

            assert.equal(Approved._id, id);
            assert.isTrue(await loanManager.getApproved(id));

            const receipt2 = await loanManager.registerApproveRequest(
                id,
                signature,
                { from: accounts[2] },
            );
            assert.isTrue(await loanManager.getApproved(id));

            const event2 = receipt2.logs.find(l => l.event === 'Approved');
            assert.notOk(event2);

            // Should add the entry to the directory once
        });
        it('Should register approve using the borrower callback', async function () {
            const creator = accounts[1];
            const borrower = loanApprover.address;
            const salt = bn('4');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            // Set expected id
            await loanApprover.setExpectedApprove(id);

            const receipt = await loanManager.registerApproveRequest(
                id,
                [],
                { from: accounts[2] },
            );

            assert.isTrue(await loanManager.getApproved(id));

            const event = receipt.logs.find(l => l.event === 'Approved');
            assert.equal(event.args._id, id);
        });
        it('Should ignore approve if borrower callback reverts', async function () {
            const creator = accounts[1];
            const borrower = loanApprover.address;
            const salt = bn('5');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            await loanApprover.setErrorBehavior(0);

            const receipt = await loanManager.registerApproveRequest(
                id,
                [],
                { from: accounts[2] },
            );
            assert.isFalse(await loanManager.getApproved(id));

            const event = receipt.logs.find(l => l.event === 'Approved');
            assert.notOk(event);
        });
        it('Should ignore approve if borrower callback returns false', async function () {
            const creator = accounts[1];
            const borrower = loanApprover.address;
            const salt = bn('6');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            await loanApprover.setErrorBehavior(1);

            const receipt = await loanManager.registerApproveRequest(
                id,
                [],
                { from: accounts[2] },
            );
            assert.isFalse(await loanManager.getApproved(id));

            const event = receipt.logs.find(l => l.event === 'Approved');
            assert.notOk(event);
        });
        it('Should ignore approve if borrower callback returns wrong value', async function () {
            const creator = accounts[1];
            const borrower = loanApprover.address;
            const salt = bn('7');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            await loanApprover.setErrorBehavior(2);

            const receipt = await loanManager.registerApproveRequest(
                id,
                [],
                { from: accounts[2] },
            );
            assert.isFalse(await loanManager.getApproved(id));

            const event = receipt.logs.find(l => l.event === 'Approved');
            assert.notOk(event);
        });
        it('Should ignore a second approve using registerApprove and callbacks', async function () {
            const creator = accounts[1];
            const borrower = loanApprover.address;
            const salt = bn('1561561');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            await loanApprover.setExpectedApprove(id);
            const Approved = await toEvents(
                loanManager.registerApproveRequest(
                    id,
                    [],
                    { from: accounts[2] },
                ),
                'Approved',
            );

            assert.equal(Approved._id, id);
            assert.isTrue(await loanManager.getApproved(id));

            const receipt2 = await loanManager.registerApproveRequest(
                id,
                [],
                { from: accounts[2] },
            );
            assert.isTrue(await loanManager.getApproved(id));

            const event2 = receipt2.logs.find(l => l.event === 'Approved');
            assert.notOk(event2);
        });
        it('Should not call callback if the borrower contract does not implements loan approver', async function () {
            const creator = accounts[1];
            const borrower = debtEngine.address;
            const salt = bn('7');
            const amount = bn('1000');
            const expiration = (await time.latest()) + 1000;

            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await getId(loanManager.requestLoan(
                amount,           // Amount
                model.address,    // Model
                constants.ZERO_ADDRESS,        // Oracle
                borrower,         // Borrower
                constants.ZERO_ADDRESS,        // Callback
                salt,             // salt
                expiration,       // Expiration
                loanData,         // Loan data
                { from: creator }, // Creator
            ));

            const receipt = await loanManager.registerApproveRequest(
                id,
                [],
                { from: accounts[2] },
            );
            assert.isFalse(await loanManager.getApproved(id));

            const event = receipt.logs.find(l => l.event === 'Approved');
            assert.notOk(event);
        });
    });
    describe('Function lend and cosign(internal function)', function () {
        it('Should lend a request using lend', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('23');
            const amount = bn('30');
            const expiration = (await time.latest()) + 900;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            const lent = await toEvents(
                loanManager.lend(
                    id,              // Index
                    [],              // OracleData
                    constants.ZERO_ADDRESS,       // Cosigner
                    '0',             // Cosigner limit
                    [],              // Cosigner data
                    [],              // Callback data
                    { from: lender }, // Owner/Lender
                ),
                'Lent',
            );
            assert.equal(lent._id, id);
            assert.equal(lent._lender, lender);
            expect(lent._tokens).to.eq.BN(amount);

            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN('0', 'The lender does not have to have tokens');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amount, 'The borrower should have ' + amount.toString() + ' tokens');

            const debt = await debtEngine.debts(id);
            assert.isFalse(debt.error, 'The debt should not have error');
            assert.equal(await loanManager.getCurrency(id), constants.ZERO_BYTES32);
            expect(debt.balance).to.eq.BN('0', 'The debt should not be balance');
            assert.equal(debt.model, model.address, 'The model should be the model');
            assert.equal(debt.creator, loanManager.address, 'The creator should be the loanManager');
            assert.equal(debt.oracle, constants.ZERO_ADDRESS, 'The debt should not have oracle');

            assert.equal(await debtEngine.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
            assert.equal(await loanManager.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
        });
        it('Cosigner should fail if charges when limit is set to 0', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('19982229');
            const amount = bn('90880');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            await cosigner.setCustomData(id, bn('1'));
            const id0x0Data = await cosigner.customData();

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,   // Cosigner
                    '0',                // Cosigner limit
                    id0x0Data,          // Cosigner data
                    [],                 // Callback data
                    { from: lender },
                ),
                'Cosigner cost exceeded',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try lend a loan without approve of the borrower', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('213');
            const amount = bn('300');
            const expiration = (await time.latest()) + 9010;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: creator },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    { from: lender },
                ),
                'The request is not approved by the borrower',
            );
        });
        it('Try lend a expired loan', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('313');
            const amount = bn('440');
            const expiration = (await time.latest()) + 1010;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            // approve requests
            await loanManager.approveRequest(id, { from: borrower });
            await time.increase(2000);

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    { from: lender },
                ),
                'The request is expired',
            );
        });
        it('Try lend a loan without tokens balance', async function () {
            const borrower = accounts[2];
            const salt = bn('763');
            const amount = bn('700');
            const expiration = (await time.latest()) + 9010;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    { from: accounts[9] },
                ),
                'ERC20: transfer amount exceeds balance',
            );
        });
        it('Try lend a closed loan', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2223');
            const amount = bn('32231');
            const expiration = (await time.latest()) + 3300;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await loanManager.lend(
                id,                 // Index
                [],                 // OracleData
                constants.ZERO_ADDRESS,          // Cosigner
                '0',                // Cosigner limit
                [],                 // Cosigner data
                [],                 // Callback data
                { from: lender },    // Owner/Lender
            );

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    { from: lender },
                ),
                'Request is no longer open',
            );
        });
        it('Lend a loan with an oracle', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('213123');
            // 0.82711175222132156792 ETH = 4000.23333566612312 RCN
            const tokens = bn('400023333566612312000000');
            const equivalent = bn('82711175222132156792');

            const oracleData = await oracle.encodeRate(tokens, equivalent);

            const amountETH = bn('6545');
            const amountRCN = amountETH.mul(tokens).div(equivalent);

            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amountETH, expiration, 0, expiration);

            const id = await calcId(
                amountETH,
                borrower,
                borrower,
                model.address,
                oracle.address,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amountETH,
                model.address,
                oracle.address,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amountRCN);
            await rcn.approve(loanManager.address, amountRCN, { from: lender });

            await loanManager.lend(
                id,
                oracleData,
                constants.ZERO_ADDRESS,
                '0',
                [],
                [],
                { from: lender },
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN('0', 'The lender does not have to have tokens');
            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amountRCN);

            const request = await loanManager.requests(id);
            assert.equal(request.oracle, oracle.address);
            assert.equal(await loanManager.getCurrency(id), constants.ZERO_BYTES32);
            assert.equal(request.cosigner, constants.ZERO_ADDRESS);
            expect(request.salt).to.eq.BN(salt);
        });
        it('Use cosigner in lend', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('123123');
            const amount = bn('5545');
            const cosignerCost = await cosigner.getDummyCost();
            const totalCost = cosignerCost.add(amount);
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, totalCost);
            await rcn.approve(loanManager.address, totalCost, { from: lender });
            const data = await cosigner.data();

            const cosigned = await toEvents(
                loanManager.lend(
                    id,
                    [],
                    cosigner.address,   // Cosigner
                    cosignerCost,       // Cosigner limit
                    data,               // Cosigner data
                    [],                 // Callback data
                    { from: lender },
                ),
                'Cosigned',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN(cosignerCost);
            expect(await rcn.balanceOf(lender)).to.eq.BN('0', 'The lender does not have to have tokens');

            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amount, 'The borrower should have ' + amount.toString() + ' tokens');

            assert.equal(cosigned._id, id);
            assert.equal(cosigned._cosigner, cosigner.address);
            expect(cosigned._cost).to.eq.BN(cosignerCost);

            const request = await loanManager.requests(id);
            assert.equal(request.cosigner, cosigner.address);
            expect(request.salt).to.eq.BN(salt);
        });
        it('Try lend a loan with cosigner and send 0x0 as id parameter of Cosign function', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('1998');
            const amount = bn('90880');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            await cosigner.setCustomData(constants.ZERO_BYTES32, '0');
            const id0x0Data = await cosigner.customData();

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,   // Cosigner
                    '0',                // Cosigner limit
                    id0x0Data,          // Cosigner data
                    [],                 // Callback data
                    { from: lender },
                ),
                'Cosigner 0x0 is not valid',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try lend a loan with cosigner cost very high', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('546546');
            const amount = bn('11');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            await cosigner.setCustomData(id, MAX_UINT256);

            const maxCostData = await cosigner.customData();
            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,   // Cosigner
                    bn('1'),            // Cosigner limit
                    maxCostData,        // Cosigner data
                    [],                 // Callback data
                    { from: lender },
                ),
                'Cosigner cost exceeded',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try lend a loan with cosigner and Cosign function return false', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('57476');
            const amount = bn('574');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            const badData = await cosigner.badData();

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,   // Cosigner
                    '0',                // Cosigner limit
                    badData,            // Cosigner data
                    [],                 // Callback data
                    { from: lender },
                ),
                'Cosign method returned false',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try lend when cosigner is not a cosigner contract', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('42342');
            const amount = bn('44444');
            const expiration = (await time.latest()) + 1600;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    accounts[8],        // Address as cosigner
                    '0',
                    [],
                    [],
                    { from: lender },
                ),
                '',
            );

            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try lend a loan with cosigner and requestCosign dont callback to the engine with Cosign', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('87868');
            const amount = bn('456345');
            const expiration = (await time.latest()) + 1600;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            const noCosignData = await cosigner.noCosignData();

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,   // Cosigner
                    '0',                // Cosigner limit
                    noCosignData,       // Cosigner data
                    [],                 // Callback data
                    { from: lender },
                ),
                'Cosigner didn\'t callback',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try lend a loan with cosigner and dont have balance to pay the cosign', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('123123');
            const amount = bn('5545');
            const cosignerCost = await cosigner.getDummyCost();
            const totalCost = cosignerCost.add(amount);
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, totalCost);
            await rcn.approve(loanManager.address, amount, { from: lender });
            const data = await cosigner.data();

            await expectRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,   // Cosigner
                    MAX_UINT256,        // Cosigner limit
                    data,               // Cosigner data
                    [],                 // Callback data
                    { from: lender },
                ),
                'ERC20: transfer amount exceeds allowance',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(totalCost);
        });
    });
    describe('Function cancel', function () {
        it('The creator should cancel a request using cancel', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('3434225');
            const amount = bn('55');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: creator },
            );

            const canceled = await toEvents(
                loanManager.cancel(
                    id,
                    { from: creator },
                ),
                'Canceled',
            );
            assert.equal(canceled._id, id);
            assert.equal(canceled._canceler, creator);

            const request = await loanManager.requests(id);
            assert.isFalse(request.open);
            assert.isFalse(request.approved);
            expect(request.expiration).to.eq.BN('0');
            expect(request.amount).to.eq.BN('0');
            assert.equal(request.cosigner, constants.ZERO_ADDRESS);
            assert.equal(request.model, constants.ZERO_ADDRESS);
            assert.equal(request.creator, constants.ZERO_ADDRESS);
            assert.equal(request.oracle, constants.ZERO_ADDRESS);
            assert.equal(request.borrower, constants.ZERO_ADDRESS);
            expect(request.salt).to.eq.BN('0');
            assert.equal(request.loanData, null);

            assert.isTrue(await loanManager.canceledSettles(id));
            assert.equal(await loanManager.getLoanData(id), null);
        });
        it('The borrower should cancel a request using cancel', async function () {
            const borrower = accounts[2];
            const salt = bn('3522');
            const amount = bn('5000');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            const canceled = await toEvents(
                loanManager.cancel(
                    id,
                    { from: borrower },
                ),
                'Canceled',
            );

            assert.equal(canceled._id, id);
            assert.equal(canceled._canceler, borrower);

            const request = await loanManager.requests(id);
            assert.isFalse(request.open);
            assert.isFalse(request.approved);
            expect(request.expiration).to.eq.BN('0');
            expect(request.amount).to.eq.BN('0');
            assert.equal(request.cosigner, constants.ZERO_ADDRESS);
            assert.equal(request.model, constants.ZERO_ADDRESS);
            assert.equal(request.creator, constants.ZERO_ADDRESS);
            assert.equal(request.oracle, constants.ZERO_ADDRESS);
            assert.equal(request.borrower, constants.ZERO_ADDRESS);
            expect(request.salt).to.eq.BN('0');
            assert.equal(request.loanData, null);

            assert.isTrue(await loanManager.canceledSettles(id));
            assert.equal(await loanManager.getLoanData(id), null);
        });
        it('Try cancel a request without being the borrower or the creator', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('6000');
            const amount = bn('6000');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: creator },
            );

            await expectRevert(
                () => loanManager.cancel(
                    id,
                    { from: lender },
                ),
                'Only borrower or creator can cancel a request',
            );
        });
        it('Try cancel a closed request', async function () {
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('33422');
            const amount = bn('4555');
            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await loanManager.lend(
                id,
                [],
                constants.ZERO_ADDRESS,
                '0',
                [],
                [],
                { from: lender },
            );

            await expectRevert(
                () => loanManager.cancel(
                    id,
                    { from: lender },
                ),
                'Request is no longer open or not requested',
            );
        });
    });
    describe('Function settleLend and cosign(internal function)', function () {
        it('Should lend a request using settleLend', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            const settledLend = await toEvents(
                loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'SettledLend',
            );

            assert.equal(settledLend._id, id);
            assert.equal(settledLend._lender, lender);
            expect(settledLend._tokens).to.eq.BN(amount);

            expect(await rcn.balanceOf(lender)).to.eq.BN('0', 'The lender does not have to have tokens');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amount, 'The borrower should have ' + amount.toString() + ' tokens');

            const request = await loanManager.requests(id);
            assert.isFalse(request.open, 'The request should not be open');
            assert.isTrue(request.approved, 'The request should be approved');
            expect(request.expiration).to.eq.BN(expiration);
            assert.equal(await loanManager.getCurrency(id), 0x0);
            expect(request.amount).to.eq.BN(amount);
            assert.equal(request.cosigner, 0x0);
            assert.equal(request.model, model.address);
            assert.equal(request.creator, creator);
            assert.equal(request.oracle, constants.ZERO_ADDRESS);
            assert.equal(request.borrower, borrower);
            expect(request.salt).to.eq.BN(salt);

            assert.equal(await debtEngine.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
            assert.equal(await loanManager.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
        });
        it('Should settleLend a loan using LoanApproverContract as creator', async function () {
            const creator = loanApprover.address;
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('20');
            const amount = bn('33622');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            const events = await toEvents(
                loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    [],
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'CreatorByCallback',
                'BorrowerBySignature',
            );

            assert.equal(events[0]._id, id);
            assert.equal(events[1]._id, id);

            expect(await rcn.balanceOf(lender)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(creator)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amount, 'The borrower should have ' + amount.toString() + ' tokens');
        });
        it('Try should settleLend a loan using LoanApproverContract as borrower and return wrong id', async function () {
            const creator = accounts[1];
            const borrower = loanApprover.address;
            const lender = accounts[3];
            const salt = bn('2011');
            const amount = bn('666');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    [],
                    [],
                    { from: lender },
                ),
                'Borrower contract rejected the loan',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(creator)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
        });
        it('Try should settleLend a loan using LoanApproverContract as creator and return wrong id', async function () {
            const creator = loanApprover.address;
            const borrower = accounts[1];
            const lender = accounts[3];
            const salt = bn('33');
            const amount = bn('666');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    [],
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'Creator contract rejected the loan',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(creator)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
        });
        it('Should settleLend a loan using LoanApproverContract as borrower', async function () {
            const creator = accounts[1];
            const borrower = loanApprover.address;
            const lender = accounts[3];
            const salt = bn('20');
            const amount = bn('33622');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            const events = await toEvents(
                loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    [],
                    [],
                    { from: lender },
                ),
                'BorrowerByCallback',
                'CreatorBySignature',
            );

            assert.equal(events[0]._id, id);
            assert.equal(events[1]._id, id);

            expect(await rcn.balanceOf(lender)).to.eq.BN('0', 'The lender does not have to have tokens');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(creator)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amount, 'The borrower should have ' + amount.toString() + ' tokens');
        });
        it('Should settleLend a loan using LoanApproverContract as creator and borrower', async function () {
            const creator = loanApprover.address;
            const borrower = loanApprover.address;
            const lender = accounts[3];
            const salt = bn('20');
            const amount = bn('33622');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            const borrowerByCallback = await toEvents(
                loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    [],
                    [],
                    [],
                    { from: lender },
                ),
                'BorrowerByCallback',
            );

            assert.equal(borrowerByCallback._id, id);

            expect(await rcn.balanceOf(lender)).to.eq.BN('0', 'The lender does not have to have tokens');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amount, 'The borrower should have ' + amount.toString() + ' tokens');
        });
        it('Try settleLend a canceled settle by the borrower', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2');
            const amount = bn('33622');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            await loanManager.settleCancel(
                settleData,
                loanData,
                { from: borrower },
            );

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'Settle was canceled',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
        });
        it('Try settleLend a canceled settle by the creator', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2');
            const amount = bn('33622');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            await loanManager.settleCancel(
                settleData,
                loanData,
                { from: creator },
            );

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'Settle was canceled',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
        });
        it('Try settleLend without borrower signature', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('20');
            const amount = bn('33622');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    [],
                    [],
                    { from: lender },
                ),
                'Invalid borrower signature',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
        });
        it('Try settleLend without creator signature', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('20');
            const amount = bn('33622');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    [],
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'Invalid creator signature',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
        });
        it('SettleLend a loan should be fail if the model create return a diferent id', async function () {
            function calcSignature (_loanManager, _id, _message) {
                return web3.utils.soliditySha3(
                    { t: 'bytes32', v: _id },
                    { t: 'string', v: _message },
                );
            }

            const testDebtEngine = await TestDebtEngine.new(rcn.address);
            const loanManager2 = await LoanManager.new(testDebtEngine.address);

            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await loanManager2.encodeRequest(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                creator,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(loanManager2.address, id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(loanManager2.address, id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager2.address, amount, { from: lender });

            await expectRevert(
                () => loanManager2.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'Error creating debt registry',
            );
        });
        it('settleLend a loan with an oracle', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('1122');

            // 0.82711175222132156792 ETH = 4000.23333566612312 RCN
            const tokens = bn('400023333566612312000000');
            const equivalent = bn('82711175222132156792');
            const oracleData = await oracle.encodeRate(tokens, equivalent);

            const amountETH = bn('3320');
            const amountRCN = amountETH.mul(tokens).div(equivalent);

            const expiration = (await time.latest()) + 1700;
            const loanData = await model.encodeData(amountETH, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amountETH,
                borrower,
                creator,
                model.address,
                oracle.address,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amountRCN);
            await rcn.approve(loanManager.address, amountRCN, { from: lender });

            await loanManager.settleLend(
                settleData,
                loanData,
                constants.ZERO_ADDRESS,
                '0',
                [],
                oracleData,
                creatorSig,
                borrowerSig,
                [],
                { from: lender },
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN('0', 'The lender does not have to have tokens');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amountRCN);

            const request = await loanManager.requests(id);
            assert.isFalse(request.open, 'The request should not be open');
            assert.isTrue(request.approved, 'The request should be approved');
            expect(request.expiration).to.eq.BN(expiration);
            assert.equal(request.oracle, oracle.address);
            expect(request.amount).to.eq.BN(amountETH);
            assert.equal(request.cosigner, constants.ZERO_ADDRESS);
            assert.equal(request.model, model.address);
            assert.equal(request.creator, creator);
            assert.equal(request.oracle, oracle.address);
            assert.equal(request.borrower, borrower);
            expect(request.salt).to.eq.BN(salt);

            assert.equal(await loanManager.getCurrency(id), constants.ZERO_BYTES32);
            assert.equal(await debtEngine.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
            assert.equal(await loanManager.ownerOf(id), lender, 'The lender should be the owner of the new ERC721');
        });
        it('Try settleLend with a expired data time', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration - 10000,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'Loan request is expired',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
        });
        it('Try settleLend without approve tokens to loanManager', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'ERC20: transfer amount exceeds allowance',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
        });
        it('Try settleLend a request already exist', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount.mul(bn('2')));
            await rcn.approve(loanManager.address, amount.mul(bn('2')), { from: lender });

            await loanManager.settleLend(
                settleData,
                loanData,
                constants.ZERO_ADDRESS,
                '0',
                [],
                [],
                creatorSig,
                borrowerSig,
                [],
                { from: lender },
            );

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ),
                'Request already exist',
            );

            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amount, 'The borrower should have ' + amount.toString() + ' tokens');
        });
        it('Use cosigner in settleLend', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2732463');
            const amount = bn('355320');
            const cosignerCost = await cosigner.getDummyCost();
            const totalCost = cosignerCost.add(amount);
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, totalCost);
            await rcn.approve(loanManager.address, totalCost, { from: lender });
            const data = await cosigner.data();

            const cosigned = await toEvents(
                loanManager.settleLend(
                    settleData,
                    loanData,
                    cosigner.address,   // Cosigner
                    cosignerCost,       // Cosigner cost
                    data,               // Cosigner data
                    [],
                    creatorSigSL,
                    borrowerSigSL,
                    [],
                    { from: lender },
                ),
                'Cosigned',
            );

            assert.equal(cosigned._id, id);
            assert.equal(cosigned._cosigner, cosigner.address);
            expect(cosigned._cost).to.eq.BN(cosignerCost);

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN(cosignerCost);
            expect(await rcn.balanceOf(lender)).to.eq.BN('0', 'The lender does not have to have tokens');
            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN(amount, 'The borrower should have ' + amount.toString() + ' tokens');

            const request = await loanManager.requests(id);
            assert.equal(request.cosigner, cosigner.address);
            expect(request.salt).to.eq.BN(salt);
        });
        it('Try settleLend with cosigner and send 0x0 as id parameter of Cosign function', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('273263');
            const amount = bn('32134');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            await cosigner.setCustomData(constants.ZERO_BYTES32, '0');
            const id0x0Data = await cosigner.customData();

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    cosigner.address, // Cosigner
                    0,                // Cosigner cost
                    id0x0Data,        // Cosigner data
                    [],
                    creatorSigSL,
                    borrowerSigSL,
                    [],
                    { from: lender },
                ),
                'Cosigner 0x0 is not valid',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try settleLend with cosigner cost very high', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('432354');
            const amount = bn('66');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            await cosigner.setCustomData(id, MAX_UINT256);
            const maxCostData = await cosigner.customData();

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    cosigner.address, // Cosigner
                    bn(1),            // Cosigner cost
                    maxCostData,      // Cosigner data
                    [],
                    creatorSigSL,
                    borrowerSigSL,
                    [],
                    { from: lender },
                ),
                'Cosigner cost exceeded',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try settleLend with cosigner and Cosign function return false', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('273263');
            const amount = bn('32134');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            const badData = await cosigner.badData();

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    cosigner.address,   // Cosigner
                    '0', // Cosigner cost
                    badData,            // Cosigner data
                    [],
                    creatorSigSL,
                    borrowerSigSL,
                    [],
                    { from: lender },
                ),
                'Cosign method returned false',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try settleLend when cosigner is not a cosigner contract', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('273263');
            const amount = bn('32134');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    accounts[8],        // Address as cosigner
                    '0',
                    [],
                    [],
                    creatorSigSL,
                    borrowerSigSL,
                    [],
                    { from: lender },
                ),
                '',
            );

            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try settleLend a loan with cosigner and requestCosign dont callback to the engine with Cosign', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('273263');
            const amount = bn('32134');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });
            const noCosignData = await cosigner.noCosignData();

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    cosigner.address,   // Cosigner
                    '0', // Cosigner cost
                    noCosignData,       // Cosigner data
                    [],
                    creatorSigSL,
                    borrowerSigSL,
                    [],
                    { from: lender },
                ),
                'Cosigner didn\'t callback',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(amount);
        });
        it('Try settleLend a loan with cosigner and dont have balance to pay the cosign', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('4563');
            const amount = bn('74575');
            const cosignerCost = await cosigner.getDummyCost();
            const totalCost = cosignerCost.add(amount);
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const creatorSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSigSL = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, totalCost);
            await rcn.approve(loanManager.address, amount, { from: lender });
            const data = await cosigner.data();

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    cosigner.address,   // Cosigner
                    MAX_UINT256,        // Max cosigner cost
                    data,               // Cosigner data
                    [],
                    creatorSigSL,
                    borrowerSigSL,
                    [],
                    { from: lender },
                ),
                'ERC20: transfer amount exceeds allowance',
            );

            expect(await rcn.balanceOf(cosigner.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(borrower)).to.eq.BN('0');
            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(loanManager.address)).to.eq.BN('0');
            expect(await rcn.balanceOf(lender)).to.eq.BN(totalCost);
        });
    });
    describe('Function settleCancel', function () {
        it('The creator should cancel a request using settleCancel', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('2956');
            const amount = bn('9320');
            const expiration = (await time.latest()) + 3400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );
            const settleData = encodeData[0];
            const id = encodeData[1];

            const settledCancel = await toEvents(
                loanManager.settleCancel(
                    settleData,
                    loanData,
                    { from: creator },
                ),
                'SettledCancel',
            );
            assert.equal(settledCancel._id, id);
            assert.equal(settledCancel._canceler, creator);

            assert.isTrue(await loanManager.canceledSettles(id));
        });
        it('The borrower should cancel a request using settleCancel', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const salt = bn('564465');
            const amount = bn('9999');
            const expiration = (await time.latest()) + 3400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            const settledCancel = await toEvents(
                loanManager.settleCancel(
                    settleData,
                    loanData,
                    { from: borrower },
                ),
                'SettledCancel',
            );
            assert.equal(settledCancel._id, id);
            assert.equal(settledCancel._canceler, borrower);

            assert.isTrue(await loanManager.canceledSettles(id));
        });
        it('Try cancel a request without have the signature', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const otherAcc = accounts[7];
            const salt = bn('5345');
            const amount = bn('9977699');
            const expiration = (await time.latest()) + 3400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
            );

            const settleData = encodeData[0];

            await expectRevert(
                () => loanManager.settleCancel(
                    settleData,
                    loanData,
                    { from: otherAcc },
                ),
                'Only borrower or creator can cancel a settle',
            );
        });
    });
    describe('Loan callback', function () {
        it('Should call loan callback', async function () {
            const callback = await TestLoanCallback.new();
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('99123');
            const amount = bn('30');
            const expiration = (await time.latest()) + 900;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                callback.address,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);

            const lent = await toEvents(
                loanManager.lend(
                    id,                 // Index
                    [],                 // OracleData
                    constants.ZERO_ADDRESS,   // Cosigner
                    '0',                // Cosigner limit
                    [],                 // Cosigner data
                    [],                 // Callback data
                    { from: lender },    // Owner/Lender
                ),
                'Lent',
            );

            assert.equal(lent._id, id);
            assert.equal(lent._lender, lender);
            expect(lent._tokens).to.eq.BN(amount);
            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            assert.equal(await loanManager.getCallback(id), callback.address);

            assert.equal(await callback.caller(), loanManager.address);
        });
        it('Should send callback data to callback', async function () {
            const callback = await TestLoanCallback.new();
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('99123');
            const amount = bn('30');
            const expiration = (await time.latest()) + 900;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);
            const callbackData = web3.utils.randomHex(120);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                callback.address,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);
            await callback.setRequireData(callbackData);

            const lent = await toEvents(
                loanManager.lend(
                    id,                 // Index
                    [],                 // OracleData
                    constants.ZERO_ADDRESS,   // Cosigner
                    '0',                // Cosigner limit
                    [],                 // Cosigner data
                    callbackData,       // Callback data
                    { from: lender },    // Owner/Lender
                ),
                'Lent',
            );

            assert.equal(lent._id, id);
            assert.equal(lent._lender, lender);
            expect(lent._tokens).to.eq.BN(amount);
            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            assert.equal(await loanManager.getCallback(id), callback.address);

            assert.equal(await callback.caller(), loanManager.address);
        });
        it('Should fail if callback returns false', async function () {
            const callback = await TestLoanCallback.new();
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('99123');
            const amount = bn('30');
            const expiration = (await time.latest()) + 900;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                callback.address,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);
            await callback.setReturn(false);

            await expectRevert(
                () => loanManager.lend(
                    id,                 // Index
                    [],                 // OracleData
                    constants.ZERO_ADDRESS,   // Cosigner
                    '0',                // Cosigner limit
                    [],                 // Cosigner data
                    [],                 // Callback data
                    { from: lender },    // Owner/Lender
                ), 'Rejected by loan callback',
            );

            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_REQUEST);
            assert.equal(await callback.caller(), constants.ZERO_ADDRESS);
            assert.equal(await loanManager.getCallback(id), callback.address);
        });
        it('Should fail if callback reverts', async function () {
            const callback = await TestLoanCallback.new();
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('99123');
            const amount = bn('30');
            const expiration = (await time.latest()) + 900;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                callback.address,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);

            await expectRevert(
                () => loanManager.lend(
                    id,              // Index
                    [],              // OracleData
                    constants.ZERO_ADDRESS,       // Cosigner
                    '0',             // Cosigner limit
                    [],              // Cosigner data
                    '0x01',          // Callback data
                    { from: lender }, // Owner/Lender
                ),
                'callback: wrong data',
            );

            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_REQUEST);
            assert.equal(await callback.caller(), constants.ZERO_ADDRESS);
            assert.equal(await loanManager.getCallback(id), callback.address);
        });
        it('Should call loan callback on settleLend', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);
            const callback = await TestLoanCallback.new();

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            // Sign loan id
            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount.mul(bn('2')));
            await rcn.approve(loanManager.address, amount.mul(bn('2')), { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);

            await loanManager.settleLend(
                settleData,
                loanData,
                constants.ZERO_ADDRESS,
                '0',
                [],
                [],
                creatorSig,
                borrowerSig,
                [],
                { from: lender },
            );

            assert.equal(await callback.caller(), loanManager.address);
            assert.equal(await loanManager.getCallback(id), callback.address);
            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_ONGOING);
        });
        it('Should send callback data to callback on settleLend', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);
            const callback = await TestLoanCallback.new();
            const callbackdata = web3.utils.randomHex(260);

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            // Sign loan id
            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount.mul(bn('2')));
            await rcn.approve(loanManager.address, amount.mul(bn('2')), { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);
            await callback.setRequireData(callbackdata);

            await loanManager.settleLend(
                settleData,
                loanData,
                constants.ZERO_ADDRESS,
                '0',
                [],
                [],
                creatorSig,
                borrowerSig,
                callbackdata,
                { from: lender },
            );

            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            assert.equal(await loanManager.getCallback(id), callback.address);
            assert.equal(await callback.caller(), loanManager.address);
        });
        it('Should fail if callback returns false on settleLend', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);
            const callback = await TestLoanCallback.new();

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            // Sign loan id
            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount.mul(bn('2')));
            await rcn.approve(loanManager.address, amount.mul(bn('2')), { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);
            await callback.setReturn(false);

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ), 'Rejected by loan callback',
            );

            expect(await loanManager.getStatus(id)).to.not.eq.BN(STATUS_ONGOING);
            assert.equal(await loanManager.getCallback(id), constants.ZERO_ADDRESS);
        });
        it('Should fail if callback reverts on settleLend', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);
            const callback = await TestLoanCallback.new();

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            // Sign loan id
            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount.mul(bn('2')));
            await rcn.approve(loanManager.address, amount.mul(bn('2')), { from: lender });

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ), 'callback: wrong id',
            );

            expect(await loanManager.getStatus(id)).to.not.eq.BN(STATUS_ONGOING);
            assert.equal(await loanManager.getCallback(id), constants.ZERO_ADDRESS);
        });
        it('Should limit gas usage on callback', async function () {
            const callback = await TestLoanCallback.new();
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('991231');
            const amount = bn('30');
            const expiration = (await time.latest()) + 900;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                callback.address,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);
            await callback.setBurnGas(300001);

            await expectRevert(
                () => loanManager.lend(
                    id,                 // Index
                    [],                 // OracleData
                    constants.ZERO_ADDRESS,   // Cosigner
                    '0',                // Cosigner limit
                    [],                 // Cosigner data
                    [],                 // Callback data
                    { from: lender },    // Owner/Lender
                ), 'Returned error: VM Exception while processing transaction: revert', '',
            );

            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_REQUEST);
            assert.equal(await callback.caller(), constants.ZERO_ADDRESS);
            assert.equal(await loanManager.getCallback(id), callback.address);
        });
        it('Should limit gas usage on callback using settleLend', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);
            const callback = await TestLoanCallback.new();

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            // Sign loan id
            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount.mul(bn('2')));
            await rcn.approve(loanManager.address, amount.mul(bn('2')), { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);
            await callback.setBurnGas(300001);

            await expectRevert(
                () => loanManager.settleLend(
                    settleData,
                    loanData,
                    constants.ZERO_ADDRESS,
                    '0',
                    [],
                    [],
                    creatorSig,
                    borrowerSig,
                    [],
                    { from: lender },
                ), 'Returned error: VM Exception while processing transaction: revert', '',
            );

            expect(await loanManager.getStatus(id)).to.not.eq.BN(STATUS_ONGOING);
            assert.equal(await loanManager.getCallback(id), constants.ZERO_ADDRESS);
        });
        it('Should allow low gas usage on callback', async function () {
            const callback = await TestLoanCallback.new();
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('99123');
            const amount = bn('30');
            const expiration = (await time.latest()) + 900;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);

            const id = await calcId(
                amount,
                borrower,
                borrower,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            await loanManager.requestLoan(
                amount,
                model.address,
                constants.ZERO_ADDRESS,
                borrower,
                callback.address,
                salt,
                expiration,
                loanData,
                { from: borrower },
            );

            await rcn.setBalance(lender, amount);
            await rcn.approve(loanManager.address, amount, { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);
            await callback.setBurnGas(250000);

            const lent = await toEvents(
                loanManager.lend(
                    id,                 // Index
                    [],                 // OracleData
                    constants.ZERO_ADDRESS,   // Cosigner
                    '0',                // Cosigner limit
                    [],                 // Cosigner data
                    [],                 // Callback data
                    { from: lender },    // Owner/Lender
                ),
                'Lent',
            );

            assert.equal(lent._id, id);
            assert.equal(lent._lender, lender);
            expect(lent._tokens).to.eq.BN(amount);
            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            assert.equal(await loanManager.getCallback(id), callback.address);

            assert.equal(await callback.caller(), loanManager.address);
        });
        it('Should allow low gas usage on callback using settleLend', async function () {
            const creator = accounts[1];
            const borrower = accounts[2];
            const lender = accounts[3];
            const salt = bn('2763');
            const amount = bn('3320');
            const expiration = (await time.latest()) + 7400;
            const loanData = await model.encodeData(amount, expiration, 0, expiration);
            const callback = await TestLoanCallback.new();

            const encodeData = await calcSettleId(
                amount,
                borrower,
                creator,
                model.address,
                constants.ZERO_ADDRESS,
                salt,
                expiration,
                loanData,
                callback.address,
            );

            const settleData = encodeData[0];
            const id = encodeData[1];

            // Sign loan id
            const creatorSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as creator'), creator);
            const borrowerSig = await web3.eth.sign(calcSignature(id, 'sign settle lend as borrower'), borrower);

            await rcn.setBalance(lender, amount.mul(bn('2')));
            await rcn.approve(loanManager.address, amount.mul(bn('2')), { from: lender });

            await callback.setRequireId(id);
            await callback.setRequireLender(lender);
            await callback.setBurnGas(250000);

            await loanManager.settleLend(
                settleData,
                loanData,
                constants.ZERO_ADDRESS,
                '0',
                [],
                [],
                creatorSig,
                borrowerSig,
                [],
                { from: lender },
            );

            expect(await loanManager.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            assert.equal(await loanManager.getCallback(id), callback.address);
            assert.equal(await callback.caller(), loanManager.address);
        });
    });
});
