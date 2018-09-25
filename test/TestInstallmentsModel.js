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

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 0, "First obligation should be 0");
    assert.equal((await model.getDueTime(id)).toNumber(), await Helper.getBlockTime() + 30 * 86400, "Next due time should be in 1 installments");
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 110, "Obligation on due time should be 110");
    assert.equal((await model.getObligation(id, await model.getDueTime(id) - 1))[0].toNumber(), 0, "Obligation before due time should be 0");

    await model.addPaid(id, 330);

    assert.equal(await model.getPaid(id), 330, "Paid amount should be 330");
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], 0, "Current obligation should be 0");
    assert.equal((await model.getDueTime(id)).toNumber(), await Helper.getBlockTime() + 4 * 30 * 86400, "Next due time should be in 4 installments");
  })

  it("Test pay loan in advance", async function() {
    let id = Helper.toBytes32(3);
    let data = [
        Helper.toBytes32(110),
        Helper.toBytes32(Helper.toInterestRate(240)),
        Helper.toBytes32(10),
        Helper.toBytes32(30 * 86400)
    ];

    await model.create(id, data);
    await model.addPaid(id, 4000);

    assert.equal(await model.getStatus(id), 2, "Status should be paid");
    assert.equal(await model.getPaid(id), 1100, "Paid should be cuota * installments");
  });

  it("Test pay loan single installment", async function() {
    let id = Helper.toBytes32(2);
    let data = [
        Helper.toBytes32(web3.toWei(110)),
        Helper.toBytes32(Helper.toInterestRate(20)),
        Helper.toBytes32(1),
        Helper.toBytes32(86400 * 360)
    ];

    await model.create(id, data);

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 0, "First obligation should be 0");
    assert.equal((await model.getDueTime(id)).toNumber(), await Helper.getBlockTime() + 360 * 86400, "Next due time should be in 1 installments");
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), web3.toWei(110), "Obligation on due time should be 110");
    assert.equal((await model.getObligation(id, await model.getDueTime(id) - 1))[0].toNumber(), 0, "Obligation before due time should be 0");

    await model.addPaid(id, web3.toWei(110));

    assert.equal(await model.getStatus(id), 2, "Status should be paid");
    assert.equal(await model.getPaid(id), web3.toWei(110), "Paid should be cuota * installments");
  });
})