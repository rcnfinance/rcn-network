const InstallmentsDebtModel = artifacts.require("./diaspore/model/InstallmentsModel.sol");
const ModelDescriptor = artifacts.require("./diaspore/interfaces/ModelDescriptor.sol");
const Helper = require('./Helper.js');

contract('Installments model', function(accounts) {
  let model;

  async function ping() {
    try {
      await model.transferTo(await model.owner());
    } catch(ignored) {}
  }

  before("Create the model", async function(){
    model = await InstallmentsDebtModel.new();
    await model.transferTo(accounts[1]);
    await model.setEngine(accounts[0], { from: accounts[1] });
  })

  it("Should fail loans with same id", async function(){
    let id = Helper.toBytes32(7);
    let data = await model.encodeData(
      110,
      Helper.toInterestRate(240),
      10,
      30 * 86400,
      1
    );
    await model.create(id, data);
    await Helper.assertThrow(model.create(id, data));
  });

  it("Test pay debt in advance, partially", async function(){
    let id = Helper.toBytes32(6);
    let data = await model.encodeData(
      110,
      Helper.toInterestRate(240),
      10,
      30 * 86400,
      1
    );

    assert.isTrue(await model.validate(data), "Registry data should be valid");
    
    await model.create(id, data);

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 0, "First obligation should be 0");
    assert.equal((await model.getDueTime(id)).toNumber(), await Helper.getBlockTime() + 30 * 86400, "Next due time should be in 1 installments");
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 110, "Obligation on due time should be 110");
    assert.equal((await model.getObligation(id, await model.getDueTime(id) - 1))[0].toNumber(), 0, "Obligation before due time should be 0");

    await model.addPaid(id, 330);

    assert.equal(await model.getPaid(id), 330, "Paid amount should be 330");
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], 0, "Current obligation should be 0");
    await Helper.almostEqual(model.getDueTime(id), await Helper.getBlockTime() + 4 * 30 * 86400, "Next due time should be in 4 installments");
  })

  it("Test pay in advance", async function() {
    let id = Helper.toBytes32(3);
    let data = await model.encodeData(
      110,
      Helper.toInterestRate(240),
      10,
      30 * 86400,
      1
    );

    await model.create(id, data);
    await model.addPaid(id, 4000);

    assert.equal(await model.getStatus(id), 2, "Status should be paid");
    assert.equal(await model.getPaid(id), 1100, "Paid should be cuota * installments");
  });

  it("Test pay single installment", async function() {
    let id = Helper.toBytes32(2);
    let data = await model.encodeData(
      web3.toWei(110),
      Helper.toInterestRate(20),
      1,
      360 * 86400,
      1
    );

    await model.create(id, data);

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 0, "First obligation should be 0");
    assert.equal((await model.getDueTime(id)).toNumber(), await Helper.getBlockTime() + 360 * 86400, "Next due time should be in 1 installments");
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), web3.toWei(110), "Obligation on due time should be 110");
    assert.equal((await model.getObligation(id, await model.getDueTime(id) - 1))[0].toNumber(), 0, "Obligation before due time should be 0");

    await model.addPaid(id, web3.toWei(110));

    assert.equal(await model.getStatus(id), 2, "Status should be paid");
    assert.equal(await model.getPaid(id), web3.toWei(110), "Paid should be cuota * installments");
  });

  it("It should handle a loan with more than a installment", async function() {
    let id = Helper.toBytes32(900);
    let data = await model.encodeData(
      300,
      Helper.toInterestRate(240),
      3,
      30 * 86400,
      86400
    );

    await model.create(id, data);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 0, "First obligation should be 0");
    await Helper.almostEqual((await model.getDueTime(id)).toNumber(), await Helper.getBlockTime() + 30 * 86400, "Next due time should be in 1 installments");
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 300, "Obligation on due time should be 300");
    assert.equal(await model.getStatus(id), 1);
    
    await model.addPaid(id, 110);

    assert.equal(await model.getPaid(id), 110);
    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual(model.getDueTime(id), await Helper.getBlockTime() + 30 * 86400, "Next due time should be in 1 installments");
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 300 - 110, "Obligation on due time should be 300 - paid");

    await model.addPaid(id, 200);

    assert.equal(await model.getPaid(id), 310);
    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual((await model.getDueTime(id)).toNumber(), await Helper.getBlockTime() + 2 * 30 * 86400, "Next due time should be in 2 installments");
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 290, "Obligation on due time should be 300 - paid");

    await Helper.increaseTime(50 * 86400);
    await model.run(id);
    await Helper.increaseTime(5 * 86400);

    await model.addPaid(id, 1000);
    assert.equal(await model.getStatus(id), 2);
    assert.equal(await model.getPaid(id), 900);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 0);
  });

  it("It should handle a loan with more than a installment in advance, totally", async function() {
    let id = Helper.toBytes32(901);
    let data = await model.encodeData(
      110,
      Helper.toInterestRate(240),
      10,
      30 * 86400,
      1
    );

    await model.create(id, data);

    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 110);
    assert.equal(await model.getClosingObligation(id), 110 * 10);
    
    await model.addPaid(id, 4000);

    assert.equal(await model.getStatus(id), 2);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 0);
    assert.equal(await model.getClosingObligation(id), 0);
    assert.equal(await model.getPaid(id), 110 * 10);
  });

  it("It should handle a loan with more than a installment in advance, partially", async function(){
    let id = Helper.toBytes32(902);
    let data = await model.encodeData(
      110,
      Helper.toInterestRate(240),
      10,
      30 * 86400,
      86400
    );

    await model.create(id, data);

    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 110);
    assert.equal(await model.getClosingObligation(id), 110 * 10);

    await model.addPaid(id, 330);

    assert.equal(await model.getPaid(id), 330);
    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 110);

    await model.addPaid(id, 150);

    assert.equal(await model.getPaid(id), 330 + 150);
    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 70);

    await model.addPaid(id, 4000);

    assert.equal(await model.getPaid(id), 1100);
    assert.equal(await model.getStatus(id), 2);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 10 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 0);
  });

  it("It should calculate the interest like the test doc test 1", async function() {
    let id = Helper.toBytes32(904);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      86400
    );

    await model.create(id, data);

    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);
    assert.equal(await model.getClosingObligation(id), 99963 * 12);

    // Pay the full next installment in a couple of days
    await Helper.increaseTime(2 * 86400);
    await model.run(id);
    await Helper.increaseTime(5 * 86400);
    await model.run(id);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);
    assert.equal(await model.getPaid(id), 99963);

    // Wait a month and a week
    await Helper.increaseTime((30 + 7) * 86400);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Wait a month
    await Helper.increaseTime(30 * 86400);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Wait to the next payment, exactly
    await Helper.increaseTime(30 * 86400);

    // Wait to the next payment, exactly
    await Helper.increaseTime(16 * 86400);

    // Past the payment date by 5 days
    await Helper.increaseTime(5 * 86400);

    await model.run(id);

    // Ping contract
    await model.setEngine(accounts[0], { from: accounts[1] });

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * 86400, "", 5);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 100691);

    await model.addPaid(id, 100691);

    assert.equal(await model.getPaid(id), 100691 + 99963 + 99963 + 99963);
    assert.equal(await model.getStatus(id), 1);
  });

  it("It should calculate the interest like the test doc test 1 - alt run", async function() {
    let id = Helper.toBytes32(905);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      1
    );

    await model.create(id, data);

    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);
    assert.equal(await model.getClosingObligation(id), 99963 * 12);

    // Pay the full next installment in a couple of days
    await Helper.increaseTime(2 * 86400);
    await model.run(id);
    await Helper.increaseTime(5 * 86400);
    await model.run(id);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);
    assert.equal(await model.getPaid(id), 99963);

    // Wait a month and a week
    await Helper.increaseTime((30 + 7) * 86400);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Wait a month
    await Helper.increaseTime(30 * 86400);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Wait to the next payment, exactly
    await Helper.increaseTime(30 * 86400);

    // Wait to the next payment, exactly
    await Helper.increaseTime(16 * 86400);

    await model.run(id);

    // Past the payment date by 5 days
    await Helper.increaseTime(5 * 86400);

    // Ping contract
    await model.setEngine(accounts[0], { from: accounts[1] });

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * 86400, "", 5);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 100691);

    await model.addPaid(id, 100691);

    assert.equal(await model.getPaid(id), 100691 + 99963 + 99963 + 99963);
    assert.equal(await model.getStatus(id), 1);
  });

  it("It should calculate the interest like the test doc test 1 - alt run 2", async function() {
    let id = Helper.toBytes32(906);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      86400
    );

    await model.create(id, data);

    assert.equal(await model.getStatus(id), 1);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);
    assert.equal(await model.getClosingObligation(id), 99963 * 12);

    // Pay the full next installment in a couple of days
    await Helper.increaseTime(2 * 86400);
    await model.run(id);
    await Helper.increaseTime(5 * 86400);

    await ping();

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);
    assert.equal(await model.getPaid(id), 99963);

    // Wait a month and a week
    await Helper.increaseTime((30 + 7) * 86400);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Wait a month
    await Helper.increaseTime(30 * 86400);

    await model.addPaid(id, 99963);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Wait to the next payment, exactly
    await Helper.increaseTime(30 * 86400);

    await model.run(id);

    // Wait to the next payment, exactly
    await Helper.increaseTime(16 * 86400);

    // Past the payment date by 5 days
    await Helper.increaseTime(5 * 86400);

    await ping();
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * 86400, "", 5);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 100691);

    await model.addPaid(id, 100691);

    assert.equal(await model.getPaid(id), 100691 + 99963 + 99963 + 99963);
    assert.equal(await model.getStatus(id), 1);
  });

  it("It should calculate the interest like the test doc test 3", async function() {
    let id = Helper.toBytes32(907);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      86400
    );

    await model.create(id, data);

    await model.addPaid(id, 99963 * 3);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() +  4 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Pass 4 months to the next loan expire time
    await Helper.increaseTime(4 * 30 * 86400);

    // Pass 12 days from the due date
    await Helper.increaseTime(12 * 86400);
    await ping();

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 101712);

    await model.addPaid(id, 101712);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 0);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Advance to the next month
    await Helper.increaseTime(18 * 86400);

    // And to the next...
    await Helper.increaseTime(30 * 86400);

    // And to the next...
    await Helper.increaseTime(30 * 86400);

    await model.addPaid(id, 250000);

    // Advance to the next month
    await Helper.increaseTime(30 * 86400);
    await ping();

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 165727);

    await model.addPaid(id, 10 ** 18);
    assert.equal(await model.getPaid(id), 1217180);
    assert.equal(await model.getStatus(id), 2);
  })


  it("It should calculate the interest like the test doc test 3 - alt run 1", async function() {
    let id = Helper.toBytes32(908);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      1
    );

    await model.create(id, data);

    await model.addPaid(id, 99963 * 3);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() +  4 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Pass 4 months to the next loan expire time
    await Helper.increaseTime(2 * 30 * 86400);
    await model.run(id);
    await Helper.increaseTime(2 * 30 * 86400);

    // Pass 12 days from the due date
    await Helper.increaseTime(12 * 86400);
    await ping();

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 101712);

    await model.addPaid(id, 101712);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 0);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Advance to the next month
    await Helper.increaseTime(18 * 86400);

    // And to the next...
    await Helper.increaseTime(30 * 86400);

    await model.run(id);

    // And to the next...
    await Helper.increaseTime(30 * 86400);

    await model.addPaid(id, 250000);

    // Advance to the next month
    await Helper.increaseTime(30 * 86400);
    await ping();

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 165727);

    await model.addPaid(id, 10 ** 18);
    assert.equal(await model.getPaid(id), 1217180);
    assert.equal(await model.getStatus(id), 2);
  })

  it("It should calculate the interest like the test doc test 3 - alt run 2", async function() {
    let id = Helper.toBytes32(909);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      1
    );

    await model.create(id, data);

    await model.addPaid(id, 99963 * 3);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() +  4 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Pass 4 months to the next loan expire time
    await Helper.increaseTime(2 * 30 * 86400 - 2);
    await model.run(id);
    await Helper.increaseTime(2 * 30 * 86400 + 2);

    // Pass 12 days from the due date
    await Helper.increaseTime(12 * 86400);
    await ping();

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 101712);

    await model.addPaid(id, 101712);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 0);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    // Advance to the next month
    await Helper.increaseTime(18 * 86400);

    // And to the next...
    await Helper.increaseTime(30 * 86400);

    await model.run(id);

    // And to the next...
    await Helper.increaseTime(29 * 86400 + 10);
    await model.run(id);
    await Helper.increaseTime(86400 - 10);

    await model.addPaid(id, 250000);

    // Advance to the next month
    await Helper.increaseTime(30 * 86400);
    await ping();

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 165727);

    await model.addPaid(id, 10 ** 18);
    assert.equal(await model.getPaid(id), 1217180);
    assert.equal(await model.getStatus(id), 2);
  })

  it("It should calculate the interest like the test doc test 4", async function() {
    let id = Helper.toBytes32(910);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      1
    );

    await model.create(id, data);

    // Pay the next 4 months in advance
    await model.addPaid(id, 99963 * 4);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() +  5 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    assert.equal(await model.getPaid(id), 99963 * 4, "Paid should be the amount of 3 installments");

    // Lets stop the payments
    // Advance 4 months and take a look
    await Helper.increaseTime((4 + 4) * 30 * 86400);

    await ping();
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() -  3 * 30 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 426091);

    // Advance the last 4 months
    await Helper.increaseTime(4 * 30 * 86400);

    await ping();
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() -  7 * 30 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 922155);
    assert.equal(await model.getStatus(id), 1, "Loan should be ongoing");
  })

  it("It should calculate the interest like the test doc test 4 - alt run 1", async function() {
    let id = Helper.toBytes32(911);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      1
    );

    await model.create(id, data);

    // Pay the next 4 months in advance
    await model.addPaid(id, 99963 * 4);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() +  5 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    assert.equal(await model.getPaid(id), 99963 * 4, "Paid should be the amount of 3 installments");

    // Lets stop the payments
    // Advance 4 months and take a look
    await Helper.increaseTime((4 + 4) * 30 * 86400);

    await model.run(id);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() -  3 * 30 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 426091);

    // Advance the last 4 months
    await Helper.increaseTime(4 * 30 * 86400);

    await ping();
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() -  7 * 30 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 922155);
    assert.equal(await model.getStatus(id), 1, "Loan should be ongoing");
  })

  it("It should calculate the interest like the test doc test 4 - alt run 2", async function() {
    let id = Helper.toBytes32(912);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      1
    );

    await model.create(id, data);

    // Pay the next 4 months in advance
    await model.addPaid(id, 99963 * 4);

    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() +  5 * 30 * 86400);
    assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0].toNumber(), 99963);

    assert.equal(await model.getPaid(id), 99963 * 4, "Paid should be the amount of 3 installments");

    // Lets stop the payments
    // Advance 4 months and take a look
    await Helper.increaseTime((4 + 4) * 30 * 86400);

    await ping();
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() -  3 * 30 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 426091);

    // Advance the last 4 months
    await Helper.increaseTime(4 * 30 * 86400);

    await model.run(id);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() -  7 * 30 * 86400);
    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 922155);
    assert.equal(await model.getStatus(id), 1, "Loan should be ongoing");
  })
  it("Should ignored periods of time under the time unit", async function() {
    let id = Helper.toBytes32(913);
    let data = await model.encodeData(
      10000,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      86400 * 2
    );

    await model.create(id, data);
    
    await Helper.increaseTime(31 * 86400);

    await ping();

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 10000);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 86400);
    
    await model.run(id);

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 10000);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 86400);

    await Helper.increaseTime(3 * 86400);

    await ping();

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 10058);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 4 * 86400);
    
    await model.run(id);

    assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0].toNumber(), 10058);
    await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 4 * 86400);
  })

  it("It should provide information with the descriptor", async function() {
    let id = Helper.toBytes32(912);
    let data = await model.encodeData(
      99963,
      Helper.toInterestRate(35 * 1.5),
      12,
      30 * 86400,
      1
    );

    let descriptor = ModelDescriptor.at(await model.descriptor());
    
    assert.equal((await descriptor.simFirstObligation(data))[0], 99963);
    assert.equal((await descriptor.simFirstObligation(data))[1], 30 * 86400);
    assert.equal(await descriptor.simDuration(data), 12 * 30 * 86400);
    assert.equal(await descriptor.simPunitiveInterestRate(data), Helper.toInterestRate(35 * 1.5));
    assert.equal(await descriptor.simFrequency(data), 30 * 86400);
    assert.equal(await descriptor.simInstallments(data), 12);
  });
})