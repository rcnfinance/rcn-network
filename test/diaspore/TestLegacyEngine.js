const TestToken = artifacts.require("./utils/TestToken.sol");
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const LegacyEngine = artifacts.require("./diaspore/LegacyEngine.sol");
const NanoLoanModel = artifacts.require("./diaspore/model/NanoLoanModel.sol");
const Helper = require('../Helper.js');

const REQUESTED = 'Requested';

contract('LegacyEngine', function(accounts) {

    let rcn;
    let debtEngine;
    let legacyEngine;

    const secondsInDay = 86400;
    const monthInSec = 30 * secondsInDay;
    const amount = 10000;
    const interestRate = Helper.toInterestRate(30);
    const interestRatePunitory = Helper.toInterestRate(60);

    const defaultParams = [
      amount,                    // amount
      interestRate,              // interest rate
      interestRatePunitory,      // interest rate punitory
      monthInSec,                // dues in
      Math.floor(monthInSec / 2) // cancelable at
    ]

    async function readRequested(recepit, event) {
        return toEvents(recepit.logs, event)[0]._nonce;
    }

    function toEvents(logs, event) {
        return logs.filter( x => x.event == event).map( x => toEvent(x) );
    }

    function toEvent(log) {
        if(log.event == REQUESTED) {
          return {
            _id: log.args._id,
            _nonce: log.args._nonce.toString()
            };
        }
        console.log('-----------Event not found------------');
      }

    beforeEach("Create engine and token", async function(){

        rcn = await TestToken.new();
        console.log("RCN Token: ", rcn.address);

        debtEngine = await DebtEngine.new(rcn.address);
        console.log("Debt Engine: ", debtEngine.address);

        owner = accounts[1];
        model = await NanoLoanModel.new( { from: owner} );
        await model.setEngine(debtEngine.address, { from: owner} );
        assert.equal(await model.engine(), debtEngine.address);
        console.log("Nano Loan Model: ", model.address);

        legacyEngine = await LegacyEngine.new(debtEngine.address, model.address, { from:owner });
        console.log("Legacy Engine: ",legacyEngine.address);
    })

    it("It should create a loan. ", async() => {

        const futureDebt = await legacyEngine.createLoan(
            0x0,              // oracle
            accounts[2],      // borrower
            0x0,              // currency
            defaultParams[0], // amount
            defaultParams[1], // interestRate
            defaultParams[2], // interestRatePunitory
            defaultParams[3], // dues in
            defaultParams[4], // cancelableAt
            10 * 10**20,      // expire time
            "metadata1", { from: owner })
            assert.equal(await readRequested(futureDebt, REQUESTED), 0);

        const futureDebt2 = await legacyEngine.createLoan(
            0x0,              // oracle
            accounts[2],      // borrower
            0x0,              // currency
            defaultParams[0], // amount
            defaultParams[1], // interestRate
            defaultParams[2], // interestRatePunitory
            defaultParams[3], // dues in
            defaultParams[4], // cancelableAt
            10 * 10**20,      // expire time
            "metadata2", { from: owner })
        assert.equal(await readRequested(futureDebt2, REQUESTED), 1);

    })

    it("It should creating two identical loans", async() => {

        const futureDebt = await legacyEngine.createLoan(
            0x0,              // oracle
            accounts[2],      // borrower
            0x0,              // currency
            defaultParams[0], // amount
            defaultParams[1], // interestRate
            defaultParams[2], // interestRatePunitory
            defaultParams[3], // dues in
            defaultParams[4], // cancelableAt
            10 * 10**20,      // expire time
            "metadata1", { from: owner })
        assert.equal(await readRequested(futureDebt, REQUESTED), 0);

        const futureDebt2 = await legacyEngine.createLoan(
            0x0,              // oracle
            accounts[2],      // borrower
            0x0,              // currency
            defaultParams[0], // amount
            defaultParams[1], // interestRate
            defaultParams[2], // interestRatePunitory
            defaultParams[3], // dues in
            defaultParams[4], // cancelableAt
            10 * 10**20,      // expire time
            "metadata1", { from: owner })
        assert.equal(await readRequested(futureDebt2, REQUESTED), 1);
    })

    it("It should verified loan creator", async() => {

        const futureDebt = await legacyEngine.createLoan(
            0x0,              // oracle
            accounts[2],      // borrower
            0x0,              // currency
            defaultParams[0], // amount
            defaultParams[1], // interestRate
            defaultParams[2], // interestRatePunitory
            defaultParams[3], // dues in
            defaultParams[4], // cancelableAt
            10 * 10**20,      // expire time
            "metadata1", { from: owner })
        assert.equal(await readRequested(futureDebt, REQUESTED), 0);
        assert.equal(await legacyEngine.getCreator(await toEvents(futureDebt.logs, REQUESTED)[0]._id), owner);

    })

})
