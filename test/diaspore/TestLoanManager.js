const LoanManager = artifacts.require('./diaspore/LoanManager.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require('./utils/test/TestToken.sol');

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

        await getRequest(id);

        assert.equal(await loanManager.getCurrency(id), 0x0);
    });
});
