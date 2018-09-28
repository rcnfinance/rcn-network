const NanoLoanModel = artifacts.require("./diaspore/model/NanoLoanModel.sol");
const Helper = require('../Helper.js');

let owner;
let model;

const monthInSec = 30 * 24 * 60 * 60;
const defaulParams = [
  Helper.toBytes32(10000),                      // amount
  Helper.toBytes32(Helper.toInterestRate(240)), // interest rate
  Helper.toBytes32(Helper.toInterestRate(480)), // interest rate punitory
  Helper.toBytes32(monthInSec),                 // dues in
  Helper.toBytes32(monthInSec)                  // cancelable at
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
    const id = Helper.toBytes32(1);
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

    assert.equal(state[0], 0, "The paid should be 0");
    assert.equal(state[1], 0, "The interest should be 0");
    assert.equal(state[2], 0, "The punitoryInterest should be 0");
    assert.equal(state[3], timestamp, "The interestTimestamp should be the timestamp of block of addPaid transaction");
    assert.equal(state[4], STATUS_ONGOING, "The status should be on going");
  });
})
