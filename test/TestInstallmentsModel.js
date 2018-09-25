const InstallmentsDebtModel = artifacts.require("./diaspore/model/InstallmentsDebtModel.sol");
const Helper = require('./Helper.js');

contract('Installments model', function(accounts) {
  let model;

  before("Create the model", async function(){
    model = await InstallmentsDebtModel.new();
    await model.transferTo(accounts[1]);
    await model.setEngine(accounts[0], { from: accounts[1] });
  })

  it("Test pay debt in advance, partially", async function(){
    let id = Helper.toBytes32(6);
    let data = [
        Helper.toBytes32(110),
        Helper.toBytes32(Helper.toInterestRate(240)),
        Helper.toBytes32(10),
        Helper.toBytes32(30 * 86400)
    ];

    assert.isTrue(await model.validate(data), "Registry data should be valid");
    
    await model.create(id, data);

    // await model.advanceClock(id, targetClock);
    assert.equal((await model.getBaseDebt(id)).toNumber(), 110, "Base debt should be 1 installment");
    await model.addPaid(id, 330);

    assert.equal((await model.getPaid(id)).toNumber(), 330, "Paid amount should be 330");
    assert.equal((await model.getDebt(id)).toNumber(), 0, "Current debt should be 110");
  })
})