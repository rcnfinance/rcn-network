const NanoLoanModel = artifacts.require('NanoLoanModel');

const {
  time,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  expect,
  bn,
  STATUS_PAID,
  toInterestRate,
  toBytes32,
} = require('./Helper.js');

function maxUint (base) {
  return bn('2').pow(bn(base)).sub(bn('1'));
}

contract('NanoLoanModel', function (accounts) {
  let owner;
  let model;
  let idCounter = 0;

  const monthInSec = bn('30').mul(bn('86400'));
  const amount = bn('10000');
  const interestRate = toInterestRate(30);
  const interestRatePunitory = toInterestRate(60);
  const cancelableAt = monthInSec.div(bn('2'));

  const defaultParams = {
    amount: amount,
    interestRate: interestRate,
    interestRatePunitory: interestRatePunitory,
    duesIn: monthInSec,
    cancelableAt: cancelableAt,
  };
  let defaultData;

  before('Create model', async function () {
    owner = accounts[1];
    model = await NanoLoanModel.new({ from: owner });
    await model.setEngine(owner, { from: owner });
    assert.equal(await model.engine(), owner);
    defaultData = await model.encodeData(
      defaultParams.amount,
      defaultParams.interestRate,
      defaultParams.interestRatePunitory,
      defaultParams.duesIn,
      defaultParams.cancelableAt,
    );
  });

  it('Test get obligations functions', async function () {
    const id = toBytes32(idCounter++);
    // if the loan its no create the obligation should be 0
    expect(await model.getClosingObligation(id)).to.equal('0', 'should be 0');
    expect(await model.getEstimateObligation(id)).to.equal('0', 'should be 0');
    const obligation = await model.getObligation(id, 0);
    expect(obligation.amount).to.equal('0', 'should be 0');
    assert.equal(obligation.defined, true, 'should be false');
  });
  it('Test validate function', async function () {
    let data;
    // Try validate:
    // a wrong data length
    data = await model.encodeData(
      amount,
      interestRate,
      interestRatePunitory,
      monthInSec,
      cancelableAt,
    );

    await expectRevert(
      model.validate(
        data.slice(0, -2),
      ),
      'Invalid data length',
    );

    await expectRevert(
      model.validate(
        data + '00',
      ),
      'Invalid data length',
    );

    // a data with cancelable at more than dues in
    data = await model.encodeData(
      amount,
      interestRate,
      interestRatePunitory,
      1,
      2,
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'The cancelableAt should be less or equal than duesIn',
    );

    // a data with interest rate less than 1000
    data = await model.encodeData(
      amount,
      1000,
      interestRatePunitory,
      monthInSec,
      cancelableAt,
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'Interest rate too high',
    );

    // a data with interest rate punitory less than 1000
    data = await model.encodeData(
      amount,
      interestRate,
      1000,
      monthInSec,
      cancelableAt,
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'Punitory interest rate too high',
    );

    // a data with amount 0
    data = await model.encodeData(
      0,
      interestRate,
      interestRatePunitory,
      monthInSec,
      cancelableAt,
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'amount can\'t be 0',
    );

    // data with dues in equal 0
    data = await model.encodeData(
      amount,
      interestRate,
      interestRatePunitory,
      0,
      0,
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'duesIn should be not 0 or overflow now plus duesIn',
    );

    // data with Max value dues in to try make overflow
    data = await model.encodeData(
      amount,
      interestRate,
      interestRatePunitory,
      maxUint(64),
      cancelableAt,
    );
    await expectRevert.unspecified(
      model.validate(
        data,
      ),
    );
  });
  it('Test create function', async function () {
    const id = toBytes32(idCounter++);
    const tx = await model.create(id, defaultData, { from: owner });
    const timestamp = bn((await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp.toString());

    const config = await model.configs(id);
    expect(config.amount).to.equal(defaultParams.amount, 'The amount its wrong');
    expect(config.interestRate).to.equal(defaultParams.interestRate, 'The interest rate its wrong');
    expect(config.interestRatePunitory).to.equal(defaultParams.interestRatePunitory, 'The interest rate punitory its wrong');
    expect(config.dueTime).to.equal(timestamp.add(monthInSec), 'The dues in its wrong');
    assert.equal(config.id, id, 'The id its wrong');

    const state = await model.states(id);
    expect(state.paid).to.equal('0', 'The paid should be 0');
    expect(state.interest).to.equal('125', 'The interest should be 125');
    expect(state.punitoryInterest).to.equal('0', 'The punitoryInterest should be 0');
    // we need check the realDelta timestamp
    // expect(state.interestTimestamp).to.equal(timestamp.add(cancelableAt), 'The interestTimestamp should be the timestamp of block of create transaction plus the cancelable at');
    expect(state.status).to.equal('0', 'The status should not be paid');
  });
  it('Test addPaid without punitory', async function () {
    const id = toBytes32(idCounter++);
    /* const tx = */await model.create(id, defaultData, { from: owner });
    // const timestamp = bn((await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp.toString());

    await increaseTime(1000000);

    await model.addPaid(id, 1000, { from: owner });

    const state = await model.states(id);
    expect(state.paid).to.equal('1000', 'The paid should be 1000');
    expect(state.interest).to.equal('125', 'The interest should be 125');
    expect(state.punitoryInterest).to.equal('0', 'The punitoryInterest should be 0');
    // we need check the realDelta timestamp
    // expect(state.interestTimestamp).to.equal(timestamp.add(cancelableAt), 'The interestTimestamp should be the timestamp of block of create transaction plus the cancelable at');
    expect(state.status).to.equal('0', 'The status should not be paid');
  });
  it('Test pay total with interest and interestPunitory', async function () {
    const id = toBytes32(idCounter++);
    await model.create(id, defaultData, { from: owner });

    await increaseTime(monthInSec.toNumber() * 2);

    const interestTotal = amount.mul(bn('30')).div(bn('12')).div(bn('100')); // 250
    const interestPTotal = amount.add(interestTotal).mul(bn('60')).div(bn('12')).div(bn('100')); // 512.5
    const total = amount.add(interestTotal).add(interestPTotal); // 10762

    await model.addPaid(id, total, { from: owner });

    const state = await model.states(id);
    expect(state.paid).to.equal(total, 'The paid should be 10762');
    expect(state.interest).to.equal(interestTotal, 'The interest should be 250');
    expect(state.punitoryInterest).to.equal(interestPTotal, 'The punitoryInterest should be 512');
    // we need check the realDelta timestamp
    // assert.equal(state.interestTimestamp, timestamp.add(cancelableAt).toString(), 'The interestTimestamp should be the timestamp of block of create transaction plus the cancelable at');
    expect(state.status).to.equal(STATUS_PAID, 'The status should be paid');
  });
  //                                              amount, interest, pInterest, duesIn, d1, v1, d2, v2, d3, v3, d4, v4
  it('Test E1 28% Anual interest, 91 days', eTest(10000, 28, 42, 91, 30, 10233, 31, 10474, 91, 11469, 5, 11530));
  it('Test E2 28% Anual interest, 30 days', eTest(800000, 28, 42, 30, 10, 806222, 10, 812444, 30, 837768, 5, 842543));
  it('Test E3 27% Anual interest, 30 days', eTest(10000, 27, 40.5, 30, 10, 10075, 10, 10150, 30, 32865, 5, 38525));
  it('Test E4 40% Anual interest, 30 days', eTest(500000, 40, 60, 30, 10, 505555, 10, 511111, 30, 533888, 5, 538193));
  it('Test E5 40% Anual interest, 30 days', eTest(80000, 40, 60, 30, 10, 80889, 10, 81778, 30, 85422, 5, 86109));
  it('Test E6 42% Anual interest, 30 days', eTest(1000000, 42, 63, 30, 10, 1011667, 10, 1023333, 30, 1071225, 5, 1080281));
  it('Test E7 27% Anual interset, 30 days', eTest(70000, 27, 40.5, 30, 10, 70525, 10, 71050, 30, 230060, 5, 269681));
  it('Test E8 42% Anual interset, 30 days', eTest(500000, 42, 63, 30, 10, 505833, 10, 511667, 30, 535613, 5, 540140));
  it('Test E9 30% Anual interset, 30 days', eTest(300000, 30, 45, 30, 10, 302500, 10, 305000, 30, 315188, 5, 317108));
  // with punitory interest
  it('Test E10 30% Anual interset, 5 days', eTest(300000, 30, 30, 5, 10, 302505, 10, 305015, 30, 312546, 5, 313801));

  const sd = bn('86400');// seconds in a day
  function eTest (amount, interest, punitoryInterest, duesIn, d1, v1, d2, v2, d3, v3, d4, v4) {
    return async () => {
      // Create a new loan with the received params
      const id = toBytes32(idCounter++);
      const params = await model.encodeData(
        amount,                           // amount
        toInterestRate(interest),         // interest rate
        toInterestRate(punitoryInterest), // interest rate punitory
        bn(duesIn).mul(sd),               // dues in
        0,                                // cancelable at
      );
      await model.create(id, params, { from: owner });

      // forward time, d1 days
      await increaseTime(bn(d1).mul(sd).toNumber());

      // check that the interest accumulated it's close to the defined by the test
      await model.run(id);

      const d1PendingAmount = await model.getClosingObligation(id);
      const d1Diff = d1PendingAmount.sub(bn(v1));
      assert.isBelow(d1Diff.toNumber(), 2, 'The v1 should aprox the interest rate in the d1 timestamp');

      // forward time, d2 days
      await increaseTime(bn(d2).mul(sd).toNumber());

      // check that the interest accumulated it's close to the defined by the test
      const d2PendingAmount = await model.getClosingObligation(id);
      const d2Diff = d2PendingAmount.sub(bn(v2));
      assert.isBelow(d2Diff.toNumber(), 2, 'The v2 should aprox the interest rate in the d2 timestamp');

      // forward time, d3 days
      await increaseTime(bn(d3).mul(sd).toNumber());

      // check that the interest accumulated it's close to the defined by the test
      await model.run(id);
      const d3PendingAmount = await model.getClosingObligation(id);
      const d3Diff = d3PendingAmount.sub(bn(v3));
      assert.isBelow(d3Diff.toNumber(), 2, 'The v3 should aprox the interest rate in the d3 timestamp');

      // forward time, d4 days
      await increaseTime(bn(d4).mul(sd).toNumber());

      // check that the interest accumulated it's close to the defined by the test
      const d4PendingAmount = await model.getClosingObligation(id);
      const d4Diff = d4PendingAmount.sub(bn(v4));
      assert.isBelow(d4Diff.toNumber(), 2, 'The v4 should aprox the interest rate in the d4 timestamp');

      // pay total amount
      await model.addPaid(id, d4PendingAmount, { from: owner });

      const state = await model.states(id);
      expect(state.paid).to.equal(d4PendingAmount, 'The paid should be ' + d4PendingAmount.toString());
      expect(state.status).to.equal(STATUS_PAID, 'The status should be paid');
    };
  }
  it('get modelId', async function () {
    const nameModel = 'NanoLoanModel 1.0';
    const calcModelId = web3.utils.toTwosComplement(web3.utils.asciiToHex(nameModel));
    assert.equal(await model.modelId(), calcModelId);

    const modelId = 0x0000000000000000000000000000004e616e6f4c6f616e4d6f64656c20312e30;
    assert.equal(await model.modelId(), modelId);
  });
});
