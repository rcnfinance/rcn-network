const LoanEngineModel = artifacts.require("./diaspore/NanoLoanModel.sol");

contract('LoanEngineModel', function(accounts) {
  let model;

  before("Create model", async function(){
    model = await LoanEngineModel.new();
  })

  it("", async function(){
  })
})
