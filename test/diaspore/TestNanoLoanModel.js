const NanoLoanModel = artifacts.require("./diaspore/model/NanoLoanModel.sol");
const Helper = require('../Helper.js');

let owner;
let model;
let idCounter = 0;

const secondsInDay = 86400;
const monthInSec = 30 * secondsInDay;
const amount = 10000;
const interestRate = Helper.toInterestRate(30);
const interestRatePunitory = Helper.toInterestRate(60);

const defaulParams = [
  Helper.toBytes32(amount),               // amount
  Helper.toBytes32(interestRate),         // interest rate
  Helper.toBytes32(interestRatePunitory), // interest rate punitory
  Helper.toBytes32(monthInSec),           // dues in
  Helper.toBytes32(monthInSec)            // cancelable at
]

const STATUS_ONGOING = 1;
const STATUS_PAID = 2;

contract('NanoLoanModel', function(accounts) {
  before("Create model", async function(){
    owner = accounts[1];
    model = await NanoLoanModel.new( { from: owner} );
    await model.setEngine(owner, { from: owner} );
    assert.equal(await model.engine(), owner);
  })

  it("Test create function", async function() {
    const id = Helper.toBytes32(idCounter++);
    const tx = await model.create(id, defaulParams, { from: owner });
    const timestamp = (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp;
    const config = await model.configs(id);

    assert.equal(Helper.toBytes32(config[0]), defaulParams[0], "The amount its wrong");
    assert.equal(Helper.toBytes32(config[1]), defaulParams[1], "The interest rate its wrong");
    assert.equal(Helper.toBytes32(config[2]), defaulParams[2], "The interest rate punitory its wrong");
    assert.equal(config[3], timestamp + monthInSec, "The dues in its wrong");
    assert.equal(config[4], monthInSec, "The cancelable at its wrong");
    assert.equal(config[5], id, "The id its wrong");

    const state = await model.states(id);

    assert.equal(state[0].toString(), 0, "The paid should be 0");
    assert.equal(state[1].toString(), 0, "The interest should be 0");
    assert.equal(state[2].toString(), 0, "The punitoryInterest should be 0");
    assert.equal(state[3].toString(), timestamp, "The interestTimestamp should be the timestamp of block of create transaction");
    assert.equal(state[4].toString(), STATUS_ONGOING, "The status should be on going");
  });

  it("Test addPaid without punitory", async function() {
    const id = Helper.toBytes32(idCounter++);
    const txCreate = await model.create(id, defaulParams, { from: owner });
    const timestampCreate = (await web3.eth.getBlock(txCreate.receipt.blockNumber)).timestamp;
    await Helper.increaseTime(1000000);
    const txPaid = await model.addPaid(id, 1000, { from: owner });
    const timestampPaid = (await web3.eth.getBlock(txPaid.receipt.blockNumber)).timestamp;
    const state = await model.states(id);

    assert.equal(state[0].toString(), 1000, "The paid should be 1000");
    const newInterest = (Math.floor((100000 * amount * (timestampPaid - timestampCreate)) / interestRate));
    assert.equal(state[1].toString(), newInterest, "The interest should be 96");
    assert.equal(state[2].toString(), 0, "The punitoryInterest should be 0");
    const delta = (newInterest * interestRate) / (amount * 100000);
    assert.equal(state[3].toString(), timestampCreate + delta, "The interestTimestamp should be the timestamp of block of create transaction plus the delta");
    assert.equal(state[4].toString(), STATUS_ONGOING, "The status should be on going");
  });

  //                                               amount , interest      , punitoryInterest, duesIn , d1, v1     , d2, v2     , d3, v3
  it("Test E2 28% Anual interest, 91 days", e_test(10000  , 11108571428571, 7405714285714   , 7862400, 30, 10233  , 31, 10474  , 91, 11469));
  it("Test E3 28% Anual interest, 30 days", e_test(800000 , 11108571428571, 7405714285714   , 2592000, 10, 806222 , 10, 812444 , 30, 837768));
  it("Test E4 27% Anual interest, 30 days", e_test(10000  , 11520000000000, 7680000000000   , 2592000, 10, 10075  , 10, 10150  , 30, 10455));
  it("Test E5 40% Anual interest, 30 days", e_test(500000 , 7776000000000 , 5184000000000   , 2592000, 10, 505555 , 10, 511111 , 30, 533888));
  it("Test E6 40% Anual interest, 30 days", e_test(80000  , 7776000000000 , 5184000000000   , 2592000, 10, 80889  , 10, 81778  , 30, 85422));
  it("Test E7 42% Anual interest, 30 days", e_test(1000000, 7405714285714 , 4937142857142   , 2592000, 10, 1011667, 10, 1023333, 30, 1071225));
  it("Test E8 27% Anual interset, 30 days", e_test(70000  , 11520000000000, 7680000000000   , 2592000, 10, 70525  , 10, 71050  , 30, 73185));
  it("Test E9 42% Anual interset, 30 days", e_test(500000 , 7405714285714 , 4937142857142   , 2592000, 10, 505833 , 10, 511667 , 30, 535613));
  it("Test E10 30% Anual interset, 30 days", e_test(300000, 10368000000000, 6912000000000   , 2592000, 10, 302500 , 10, 305000 , 30, 315188));
  // with punitory interest
  it("Test E11 30% Anual interset,  5 days", e_test(300000, 10368000000000, 10368000000000  , 5*86400, 10, 302505 , 10, 305015 , 30, 312546));

  function e_test(amount, interest, punitoryInterest, duesIn, d1, v1, d2, v2, d3, v3) {
    return async() => {
      // Create a new loan with the received params
      const id = Helper.toBytes32(idCounter++);
      const params = [
        Helper.toBytes32(amount),           // amount
        Helper.toBytes32(interest),         // interest rate
        Helper.toBytes32(punitoryInterest), // interest rate punitory
        Helper.toBytes32(duesIn),           // dues in
        Helper.toBytes32(0)                 // cancelable at
      ]
      await model.create(id, params, { from: owner });

      // forward time, d1 days
      await Helper.increaseTime(d1 * secondsInDay);

      // check that the interest accumulated it's close to the defined by the test
      await model.run(id);

      let d1PendingAmount = await model.getClosingObligation(id);
      var d1Diff = Math.abs(d1PendingAmount.toNumber() - v1);
      assert.isBelow(d1Diff, 2, "The v1 should aprox the interest rate in the d1 timestamp");

      // forward time, d2 days
      await Helper.increaseTime(d2 * secondsInDay);

      // check that the interest accumulated it's close to the defined by the test
      await model.run(id);
      let d2PendingAmount = await model.getClosingObligation(id);
      var d2Diff = Math.abs(d2PendingAmount.toNumber() - v2);
      assert.isBelow(d2Diff, 2, "The v2 should aprox the interest rate in the d2 timestamp");

      // forward time, d3 days
      await Helper.increaseTime(d3 * secondsInDay);

      // check that the interest accumulated it's close to the defined by the test
      await model.run(id);
      let d3PendingAmount = await model.getClosingObligation(id);
      var d3Diff = Math.abs(d3PendingAmount.toNumber() - v3);
      assert.isBelow(d3Diff, 2, "The v3 should aprox the interest rate in the d3 timestamp");
    }
  };
})
