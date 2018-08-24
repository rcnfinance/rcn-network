const ReferenceOracle = artifacts.require("./examples/ReferenceOracle.sol");
const Helper = require("./helper.js");

const abiGetRateView = [{"constant":true,"inputs":[{"name":"currency","type":"bytes32"},{"name":"data","type":"bytes"}],"name":"getRate","outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}];

//global variables
//////////////////
// contracts
let oracle;
let oracleView;
// accounts
let user;
let admin;
// currencies
let BTC;

contract('ReferenceOracle', function(accounts) {
  before("Assign accounts", async function(){
    // set account addresses
    admin  = accounts[0];
    user   = accounts[1];
    hacker = accounts[2];
  });

  beforeEach("Create contracts and add delegate", async function(){
    oracle = await ReferenceOracle.new({ from: admin });
    oracleView = web3.eth.contract(abiGetRateView).at(oracle.address);
    await oracle.addDelegate( admin, { from: admin });
    // set currencies
    BTC = {
        id: "0x4254430000000000000000000000000000000000000000000000000000000000",
        rate: Helper.toBytes32(9999),
        decimals: Helper.toBytes32(8),
        timestamp: (await web3.eth.getBlock('latest')).timestamp
    }
  });

  it("Test: getRate()", async() => {
    // only view
    let vrs = await signGetRate(admin, BTC);
    let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
    let rate = await oracleView.getRate(BTC.id, data);
    assert.equal(web3.toDecimal(rate[0]), BTC.rate.toString());
    assert.equal(web3.toDecimal(rate[1]), BTC.decimals.toString());

    BTC.rate = Helper.toBytes32(500);
    vrs = await signGetRate(admin, BTC);
    data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
    rate = await oracleView.getRate(BTC.id, data);
    assert.equal(web3.toDecimal(rate[0]), BTC.rate.toString());
    assert.equal(web3.toDecimal(rate[1]), BTC.decimals.toString());

    let cache = await oracle.cache(BTC.id);
    for (var i = 0; i < cache.length; i++)
      assert.equal(cache[i].toString(), 0);
    // change cache
    BTC.rate = Helper.toBytes32(650);
    vrs = await signGetRate(admin, BTC);
    data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
    let tx = await oracle.getRate(BTC.id, data, {from: user});
    let args = tx.logs[0].args;
    assert.equal(tx.logs[0].event, 'DeliveredRate');
    assert.equal(args.requester, user);
    assert.equal(args.currency, BTC.id);
    assert.equal(args.signer, admin);
    assert.equal(args.requestTimestamp, BTC.timestamp);
    assert.equal(args.rate.toString(), web3.toDecimal(BTC.rate).toString());
    assert.equal(args.decimals.toString(), web3.toDecimal(BTC.decimals).toString());

    cache = await oracle.cache(BTC.id);
    assert.equal(cache[0].toString(), web3.toDecimal(BTC.timestamp).toString());
    assert.equal(cache[1].toString(), web3.toDecimal(BTC.rate).toString());
    assert.equal(cache[2].toString(), web3.toDecimal(BTC.decimals).toString());
  });

  it("Test: getRate() try hack", async() => {
    try { // try to sign with a non-delegated account
      let vrs = await signGetRate(hacker, BTC);
      let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
      await oracleView.getRate(BTC.id, data);
      assert(false, "throw was expected in line above.")
    } catch(e){
      assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
    }
    try { // try change rate sign
      let vrs = await signGetRate(admin, BTC);
      let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, Helper.toBytes32(1), BTC.decimals, vrs[0], vrs[1], vrs[2]]);
      await oracleView.getRate(BTC.id, data);
      assert(false, "throw was expected in line above.")
    } catch(e){
      assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
    }
    try { // try change decimals sign
      let vrs = await signGetRate(admin, BTC);
      let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, Helper.toBytes32(1), vrs[0], vrs[1], vrs[2]]);
      await oracleView.getRate(BTC.id, data);
      assert(false, "throw was expected in line above.")
    } catch(e){
      assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
    }
    try { // try change timestamp sign
      let vrs = await signGetRate(admin, BTC);
      let data = Helper.arrayToBytesOfBytes32([1, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
      await oracleView.getRate(BTC.id, data);
      assert(false, "throw was expected in line above.")
    } catch(e){
      assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
    }
    try { // try change timestamp sign
      let vrs = await signGetRate(admin, BTC);
      let data = Helper.arrayToBytesOfBytes32([BTC.timestamp + 1000, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
      await oracleView.getRate(BTC.id, data);
      assert(false, "throw was expected in line above.")
    } catch(e){
      assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
    }
  });

  async function signGetRate(signer, currency){
    let sign = [oracle.address, currency.id, currency.rate, currency.decimals, Helper.toBytes32(web3.toHex(currency.timestamp))];
    sign = web3.sha3(sign.map(x => x.slice(2)).join(""), {encoding:"hex"});

    const approveSignature = await web3.eth.sign(signer, sign).slice(2);
    const r = '0x' + approveSignature.slice(0, 64);
    const s = '0x' + approveSignature.slice(64, 128);
    const v = web3.toDecimal(approveSignature.slice(128, 130)) + 27;
    return [v, r, s];
  };
});
