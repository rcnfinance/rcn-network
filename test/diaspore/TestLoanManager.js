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
        const internalSalt = Web3Utils.hexToNumberString(Web3Utils.soliditySha3(creator, salt));
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

    it("Should create a loan using requestLoan", async function() {
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
    });
});
