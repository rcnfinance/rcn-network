const NanoLoanModel = artifacts.require("./diaspore/model/NanoLoanModel.sol");
const Helper = require('../Helper.js');

let owner;
let model;


contract('NanoLoanModel', function(accounts) {
  before("Create model", async function(){
    owner = accounts[1];
    model = await NanoLoanModel.new( { from: owner} );
    await model.setEngine(owner, { from: owner} );
    assert.equal(await model.engine(), owner);
  })

  it("", async function(){

  })
})
