const InstallmentsDebtModel = artifacts.require('InstallmentsModel');
const ModelDescriptor = artifacts.require('ModelDescriptor');

const {
  constants,
  time,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  expect,
  bn,
  STATUS_PAID,
  STATUS_ONGOING,
  toInterestRate,
  getTxTime,
  almostEqual,
} = require('./Helper.js');

contract('Installments model test', function (accounts) {
  let model;
  // Accounts
  const accountEngine = accounts[1];
  const owner = accounts[2];
  const creator = accounts[3];

  const secInDay = bn(86400);
  const secInMonth = secInDay.mul(bn(30));
  const secInYear = secInMonth.mul(bn(12));

  before('Create the model', async function () {
    model = await InstallmentsDebtModel.new({ from: owner });
    await model.setEngine(accountEngine, { from: owner });
  });

  async function _getClosingObligation (id) {
    const config = await model.configs(id);
    const state = await model.states(id);
    const currentClock = bn(await getNow()).sub(config.lentTime);

    let interest;
    if (state.clock.gte(currentClock)) {
      interest = state.interest;
    } else {
      interest = (await _runAdvanceClock(id, currentClock)).interest;
    }

    const debt = config.cuota.mul(config.installments).add(interest);
    return debt.gt(state.paid) ? debt.sub(state.paid) : bn(0);
  }

  async function getObligation (id, timestamp) {
    timestamp = bn(timestamp);
    const config = await model.configs(id);
    const state = await model.states(id);

    if (timestamp.lt(config.lentTime)) {
      return { amount: bn(0), defined: true };
    }

    const currentClock = timestamp.sub(config.lentTime);

    const base = await _baseDebt(id, currentClock);

    let interest = state.interest;
    let defined = true;

    if (state.clock.lt(currentClock)) {
      interest = (await _runAdvanceClock(id, currentClock)).interest;
      defined = state.interest.eq(interest);
    }

    const debt = base.add(interest);
    return { amount: debt.gt(state.paid) ? debt.sub(state.paid) : bn(0), defined: defined };
  }

  async function _runAdvanceClock (id, targetClock) {
    const config = await model.configs(id);
    const state = await model.states(id);

    // Advance clock to lentTime if never advanced before
    let clock = state.clock;
    let interest = state.interest;

    let delta;
    let installmentCompleted;

    do {
      const targetDelta = targetClock.sub(clock);

      const nextInstallmentDelta = config.duration.sub(state.clock.mod(config.duration));
      if (nextInstallmentDelta.lte(targetDelta) && state.clock.div(config.duration).lt(config.installments)) {
        delta = nextInstallmentDelta;
        installmentCompleted = true;
      } else {
        delta = targetDelta;
        installmentCompleted = false;
      }

      const runningDebt = (await _baseDebt(id, targetDelta)).sub(state.paidBase);
      const dividend = bn(100000).mul(delta.div(config.timeUnit)).mul(runningDebt);
      const divisor = config.interestRate.div(config.timeUnit);
      const newInterest = dividend.div(divisor);

      if (installmentCompleted || newInterest.gt(bn(0))) {
        clock = clock.add(delta);
        interest = interest.add(newInterest);
      } else {
        break;
      }
    } while (clock.lt(targetClock));

    return { interest: interest, clock: clock };
  }

  async function _baseDebt (id, clock) {
    const config = await model.configs(id);
    const installment = clock.div(config.duration);
    return installment.lt(config.installments) ? installment.mul(config.cuota) : config.installments.mul(config.cuota);
  }

  it('Function setEngine', async function () {
    const auxModel = await InstallmentsDebtModel.new({ from: owner });
    const engine = web3.utils.toChecksumAddress(web3.utils.randomHex(20));

    assert.equal(await auxModel.engine(), ethers.constants.AddressZero);
    assert.isTrue(await auxModel.isOperator(ethers.constants.AddressZero));
    assert.isFalse(await auxModel.isOperator(owner));
    assert.isFalse(await auxModel.isOperator(engine));

    expectEvent(
      await auxModel.setEngine(engine, { from: owner }),
      '_setEngine',
      { _engine: engine },
    );

    assert.equal(await auxModel.engine(), engine);
    assert.isTrue(await auxModel.isOperator(engine));
    assert.isFalse(await auxModel.isOperator(owner));
  });
  it('Function validate', async function () {
    let data;

    data = await model.encodeData(
      1, // cuota
      2, // interestRate
      1, // installments
      1, // duration
      1, // timeUnit
    );
    assert.isTrue(await model.validate(data));

    // Try validate:
    // a wrong data length
    data = await model.encodeData(
      1, // cuota
      2, // interestRate
      1, // installments
      1, // duration
      1, // timeUnit
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

    // a data with cuota equal 0
    data = await model.encodeData(
      0, // cuota
      2, // interestRate
      1, // installments
      1, // duration
      1, // timeUnit
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'Cuota can\'t be 0',
    );

    // a data with installments equal 0
    data = await model.encodeData(
      1, // cuota
      2, // interestRate
      0, // installments
      1, // duration
      1, // timeUnit
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'Installments can\'t be 0',
    );

    // a data with timeUnit equal 0
    data = await model.encodeData(
      1, // cuota
      2, // interestRate
      1, // installments
      1, // duration
      0, // timeUnit
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'Time unit can\'t be 0',
    );

    // a data with timeUnit lower than duration
    data = await model.encodeData(
      1, // cuota
      2, // interestRate
      1, // installments
      0, // duration
      1, // timeUnit
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'Time unit must be lower or equal than installment duration',
    );

    // a data with timeUnit equal to interestRate
    data = await model.encodeData(
      1, // cuota
      1, // interestRate
      1, // installments
      1, // duration
      1, // timeUnit
    );
    await expectRevert(
      model.validate(
        data,
      ),
      'Interest rate by time unit is too low',
    );
  });
  it('Function getDueTime', async function () {
    const id = web3.utils.randomHex(32);
    const data = await model.encodeData(
      110, // cuota
      toInterestRate(240), // interestRate
      10, // installments
      secInMonth, // duration
      1, // timeUnit
    );

    expect(await model.getDueTime(id)).to.equal(0);

    const lentTime = await getTxTime(model.create(id, data, { from: accountEngine }));

    let dueTime = bn(secInMonth).add(lentTime);
    expect(await model.getDueTime(id)).to.equal(dueTime);

    const lastPayment = bn(secInMonth.mul(bn(2)));
    await increaseTime(secInDay.mul(bn(5)));
    await model.addPaid(id, 110, { from: accountEngine });

    dueTime = lastPayment.sub(lastPayment.mod(bn(secInMonth))).add(lentTime);
    expect(await model.getDueTime(id)).to.equal(dueTime);
  });
  it('Function getObligation', async function () {
    const id = web3.utils.randomHex(32);
    const cuota = bn(110);
    const data = await model.encodeData(
      cuota, // cuota
      toInterestRate(240), // interestRate
      10, // installments
      secInMonth, // duration
      1, // timeUnit
    );

    const lentTime = await getTxTime(model.create(id, data, { from: accountEngine }));

    let obligation = await model.getObligation(id, 0);
    let calculateObligation = await getObligation(id, 0);
    expect(obligation[0]).to.equal(calculateObligation.amount);
    assert.equal(obligation[1], calculateObligation.defined);
    assert.isTrue(obligation[1]);

    obligation = await model.getObligation(id, lentTime.add(secInMonth));
    calculateObligation = await getObligation(id, lentTime.add(secInMonth));
    expect(obligation[0]).to.equal(calculateObligation.amount);
    assert.equal(obligation[1], calculateObligation.defined);
    assert.isTrue(obligation[1]);

    obligation = await model.getObligation(id, lentTime.add(secInMonth.mul(bn(2))));
    calculateObligation = await getObligation(id, lentTime.add(secInMonth.mul(bn(2))));
    expect(obligation[0]).to.equal(calculateObligation.amount);
    assert.equal(obligation[1], calculateObligation.defined);
    assert.isFalse(obligation[1]);

    await increaseTime(secInMonth);

    obligation = await model.getObligation(id, lentTime.add(secInMonth.mul(bn(2))));
    calculateObligation = await getObligation(id, lentTime.add(secInMonth.mul(bn(2))));
    expect(obligation[0]).to.equal(calculateObligation.amount);
    assert.equal(obligation[1], calculateObligation.defined);
    assert.isFalse(obligation[1]);

    await model.addPaid(id, calculateObligation.amount, { from: accountEngine });

    obligation = await model.getObligation(id, lentTime.add(secInMonth.mul(bn(2))));
    calculateObligation = await getObligation(id, lentTime.add(secInMonth.mul(bn(2))));
    expect(obligation[0]).to.equal(calculateObligation.amount);
    assert.equal(obligation[1], calculateObligation.defined);
    assert.isTrue(obligation[1]);

    await model.addPaid(id, cuota.mul(bn(10)), { from: accountEngine });

    obligation = await model.getObligation(id, lentTime.add(secInMonth.mul(bn(2))));
    calculateObligation = await getObligation(id, lentTime.add(secInMonth.mul(bn(2))));
    expect(obligation[0]).to.equal(calculateObligation.amount);
    assert.equal(obligation[1], calculateObligation.defined);
    assert.isTrue(obligation[1]);
  });
  it('Function _getClosingObligation, getClosingObligation and getEstimateObligation', async function () {
    const id = web3.utils.randomHex(32);
    const cuota = bn(110);
    const data = await model.encodeData(
      cuota, // cuota
      toInterestRate(240), // interestRate
      10, // installments
      secInMonth, // duration
      1, // timeUnit
    );

    await model.create(id, data, { from: accountEngine });
    // clock >= currentClock
    let calculateObligation = await _getClosingObligation(id);
    expect(await model.getClosingObligation(id)).to.equal(calculateObligation);
    expect(await model.getEstimateObligation(id)).to.equal(calculateObligation);

    await increaseTime(secInMonth.mul(bn(2)));
    // clock < currentClock
    calculateObligation = await _getClosingObligation(id);
    expect(await model.getClosingObligation(id)).to.equal(calculateObligation);
    expect(await model.getEstimateObligation(id)).to.equal(calculateObligation);

    // pay getClosingObligation
    await model.addPaid(id, await model.getClosingObligation(id), { from: accountEngine });
    calculateObligation = await _getClosingObligation(id);
    expect(await model.getClosingObligation(id)).to.equal(calculateObligation);
    expect(await model.getEstimateObligation(id)).to.equal(calculateObligation);
  });
  it('Function modelId', async function () {
    const nameModel = 'InstallmentsModel A 0.0.2';
    const calcModelId = web3.utils.toTwosComplement(web3.utils.asciiToHex(nameModel));
    assert.equal(await model.modelId(), calcModelId);

    const modelId = 0x00000000000000496e7374616c6c6d656e74734d6f64656c204120302e302e32;
    assert.equal(await model.modelId(), modelId);
  });
  it('Function addDebt must always revert', async function () {
    await expectRevert(
      model.addDebt(
        web3.utils.randomHex(20),
        0,
        { from: accountEngine },
      ),
      'Not implemented!',
    );
  });
  describe('Functions onlyOwner', function () {
    it('Function setDescriptor', async function () {
      await expectRevert(
        model.setDescriptor(
          web3.utils.randomHex(20),
          { from: creator },
        ),
        'Ownable: caller is not the owner',
      );
    });
    it('Function setEngine', async function () {
      await expectRevert(
        model.setEngine(
          web3.utils.randomHex(20),
          { from: creator },
        ),
        'Ownable: caller is not the owner',
      );
    });
  });
  describe('Functions onlyEngine', function () {
    it('Function create', async function () {
      await expectRevert(
        model.create(
          ethers.constants.HashZero,
          [],
          { from: creator },
        ),
        'Only engine allowed',
      );
    });
    it('Function addPaid', async function () {
      await expectRevert(
        model.addPaid(
          ethers.constants.HashZero,
          1,
          { from: creator },
        ),
        'Only engine allowed',
      );
    });
    it('Function addDebt', async function () {
      await expectRevert(
        model.addDebt(
          ethers.constants.HashZero,
          1,
          { from: creator },
        ),
        'Only engine allowed',
      );
    });
  });
  describe('Functions getStatus', function () {
    it('Get status of a loan', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        110, // cuota
        toInterestRate(240), // interestRate
        10, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(1); // Ongoing status

      await model.addPaid(id, 110 * 10, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(2); // Ongoing status
    });
    it('Try get status of inexists loan', async function () {
      await expectRevert(
        model.getStatus(
          web3.utils.randomHex(32),
        ),
        'The registry does not exist',
      );
    });
  });
  describe('Functions setDescriptor, descriptor and ModelDescriptor interface functions', function () {
    it('Change descriptor', async function () {
      const auxModel = await InstallmentsDebtModel.new({ from: owner });

      assert.equal(await auxModel.descriptor(), auxModel.address);

      const descriptor = web3.utils.toChecksumAddress(web3.utils.randomHex(20));

      expectEvent(
        await auxModel.setDescriptor(descriptor, { from: owner }),
        '_setDescriptor',
        { _descriptor: descriptor },
      );

      assert.equal(await auxModel.descriptor(), descriptor);
    });
    it('It should provide information with the descriptor', async function () {
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      expect(await model.simTotalObligation(data)).to.equal(99963 * 12);

      const descriptor = await ModelDescriptor.at(await model.descriptor());

      expect((await descriptor.simFirstObligation(data))[0]).to.equal('99963');
      expect((await descriptor.simFirstObligation(data))[1]).to.equal(secInMonth);
      expect(await descriptor.simDuration(data)).to.equal(bn(12).mul(bn(secInMonth.toString())));
      expect(await descriptor.simPunitiveInterestRate(data)).to.equal(toInterestRate(35 * 1.5));
      expect(await descriptor.simFrequency(data)).to.equal(secInMonth);
      expect(await descriptor.simInstallments(data)).to.equal(12);
    });
  });
  describe('Function create', function () {
    it('Create a loan', async function () {
      const id = web3.utils.randomHex(32);
      const cuota = bn(110);
      const interestRate = bn(toInterestRate(240));
      const installments = bn(10);
      const duration = secInMonth;
      const timeUnit = bn(1);
      const data = await model.encodeData(
        cuota, // cuota
        interestRate, // interestRate
        installments, // installments
        duration, // duration
        timeUnit, // timeUnit
      );

      const receipt = await model.create(
        id,
        data,
        { from: accountEngine },
      );
      const createdTime = await getTxTime(receipt);

      expectEvent(receipt, 'Created', { _id: id });
      expectEvent(receipt, '_setClock', { _id: id, _to: duration });

      expect(await model.getFrequency(id)).to.equal(duration);
      expect(await model.getInstallments(id)).to.equal(installments);
      expect(await model.getPaid(id)).to.equal(0);
      expect(await model.getStatus(id)).to.equal(1); // Ongoing status
      const finalTime = createdTime.add(duration.mul(installments));
      expect(await model.getFinalTime(id)).to.equal(finalTime);
      const dueTime = duration.add(createdTime);
      expect(await model.getDueTime(id)).to.equal(dueTime);

      const configs = await model.configs(id);
      expect(configs.installments).to.equal(installments);
      expect(configs.timeUnit).to.equal(timeUnit);
      expect(configs.duration).to.equal(duration);
      expect(configs.lentTime).to.equal(createdTime);
      expect(configs.cuota).to.equal(cuota);
      expect(configs.interestRate).to.equal(interestRate);

      const states = await model.states(id);
      expect(states.status).to.equal(0);
      expect(states.clock).to.equal(duration);
      expect(states.lastPayment).to.equal(0);
      expect(states.paid).to.equal(0);
      expect(states.paidBase).to.equal(0);
      expect(states.interest).to.equal(0);
    });
    it('Try create two loans with the same id', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        110, // cuota
        toInterestRate(240), // interestRate
        10, // installments
        secInMonth, // duration
        1, // timeUnit
      );
      await model.create(id, data, { from: accountEngine });

      await expectRevert(
        model.create(
          id,
          data,
          { from: accountEngine },
        ),
        'Entry already exist',
      );
    });
  });
  describe('Function addPaid', function () {
    it('AddPaid to a loan', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        110, // cuota
        toInterestRate(240), // interestRate
        10, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      const prevConfigs = await model.configs(id);
      const prevStates = await model.states(id);
      const paidAmount = 1;

      const receipt = await model.addPaid(
        id,
        paidAmount,
        { from: accountEngine },
      );

      expectEvent(receipt, '_setPaidBase', { _id: id, _paidBase: bn(1) });
      expectEvent(receipt, 'AddedPaid', { _id: id, _paid: bn(1) });

      expect(await model.getPaid(id)).to.equal(paidAmount);

      const configs = await model.configs(id);
      expect(configs.installments).to.equal(prevConfigs.installments);
      expect(configs.timeUnit).to.equal(prevConfigs.timeUnit);
      expect(configs.duration).to.equal(prevConfigs.duration);
      expect(configs.lentTime).to.equal(prevConfigs.lentTime);
      expect(configs.cuota).to.equal(prevConfigs.cuota);
      expect(configs.interestRate).to.equal(prevConfigs.interestRate);

      const states = await model.states(id);
      expect(states.status).to.equal(prevStates.status);
      expect(states.clock).to.equal(prevStates.clock);
      expect(states.lastPayment).to.equal(prevStates.clock);
      expect(states.paid).to.equal(paidAmount);
      expect(states.paidBase).to.equal(paidAmount);
      expect(states.clock).to.equal(prevStates.clock);
      expect(states.interest).to.equal(prevStates.interest);
    });
    it('Test pay debt in advance, partially', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        110, // cuota
        toInterestRate(240), // interestRate
        10, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      assert.isTrue(await model.validate(data), 'Registry data should be valid');

      await model.create(id, data, { from: accountEngine });

      expect((await model.getObligation(id, await getNow()))[0]).to.equal(0, 'First obligation should be 0');
      expect(await model.getDueTime(id)).to.equal((await getNow()).add(secInMonth), 'Next due time should be in 1 installments');
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal(110, 'Obligation on due time should be 110');
      expect((await model.getObligation(id, (await model.getDueTime(id)).sub(bn(1))))[0]).to.equal(0, 'Obligation before due time should be 0');

      await model.addPaid(id, 330, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal('330', 'Paid amount should be 330');
      expect((await model.getObligation(id, await getNow()))[0]).to.equal(0, 'Current obligation should be 0');
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(4))), 'Next due time should be in 4 installments');
    });
    it('Test pay in advance', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        110, // cuota
        toInterestRate(240), // interestRate
        10, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });
      await model.addPaid(id, 4000, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(STATUS_PAID, 'Status should be paid');
      expect(await model.getPaid(id)).to.equal('1100', 'Paid should be cuota * installments');
      // Pay a paid loan
      await model.addPaid(id, 110 * 10, { from: accountEngine });
    });
    it('Test pay single installment', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        web3.utils.toWei('110'), // cuota
        toInterestRate(20), // interestRate
        1, // installments
        secInYear, // duration
        1, // timeUnit
      );
      await model.create(id, data, { from: accountEngine });

      expect((await model.getObligation(id, await getNow()))[0]).to.equal(0, 'First obligation should be 0');
      expect(await model.getDueTime(id)).to.equal((await getNow()).add(secInYear), 'Next due time should be in 1 installments');
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal(web3.utils.toWei('110'), 'Obligation on due time should be 110');
      expect((await model.getObligation(id, (await model.getDueTime(id)).sub(bn(1))))[0]).to.equal(0, 'Obligation before due time should be 0');

      await model.addPaid(id, web3.utils.toWei('110'), { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(STATUS_PAID, 'Status should be paid');
      expect(await model.getPaid(id)).to.equal(web3.utils.toWei('110'), 'Paid should be cuota * installments');
    });
  });
  describe('Function fixClock, run, _advanceClock', function () {
    it('fixclock should fail if called ahead of current time', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      const now = await getNow();
      await expectRevert(
        model.fixClock(id, now.add(bn(2))),
        'Forbidden advance clock into the future',
      );

      // Pay the next 4 months in advance
      await model.addPaid(id, bn('99963').mul(bn('4')), { from: accountEngine });

      await expectRevert(
        model.fixClock(id, (await getNow()).add(secInYear)),
        'Forbidden advance clock into the future',
      );
    });
    it('fixclock should fail if called before lend clock', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      const lentTime = await getTxTime(model.create(id, data, { from: accountEngine }));

      await expectRevert(
        model.fixClock(id, lentTime),
        'Clock can\'t go negative',
      );

      await expectRevert(
        model.fixClock(id, 0),
        'Clock can\'t go negative',
      );

      // Pay the next 4 months in advance
      await model.addPaid(id, 99963 * 4, { from: accountEngine });

      await expectRevert(
        model.fixClock(id, (await getNow()).sub(bn(10))),
        'Clock can\'t go negative',
      );
    });
    it('fixclock should fail if called before current clock', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      await increaseTime(secInMonth);
      await model.addPaid(id, 99963 * 4, { from: accountEngine });

      await expectRevert(
        model.fixClock(id, (await getNow()).sub(bn(10))),
        'Clock is ahead of target',
      );
    });
  });
  describe('Functional tests', function () {
    it('It should handle a loan with more than a installment', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        300, // cuota
        toInterestRate(240), // interestRate
        3, // installments
        secInMonth, // duration
        secInDay, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });
      expect((await model.getObligation(id, await getNow()))[0]).to.equal(0, 'First obligation should be 0');
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth), 'Next due time should be in 1 installments');
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('300', 'Obligation on due time should be 300');
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);

      await model.addPaid(id, 110, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal(110);
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth), 'Next due time should be in 1 installments');
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('190', 'Obligation on due time should be 300 - paid');

      await model.addPaid(id, 200, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal('310');
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(2))), 'Next due time should be in 2 installments');
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('290', 'Obligation on due time should be 300 - paid');

      await increaseTime(secInDay.mul(bn(50)));
      await model.run(id, { from: accountEngine });
      await increaseTime(secInDay.mul(bn(5)));

      await model.addPaid(id, 1000, { from: accountEngine });
      expect(await model.getStatus(id)).to.equal(STATUS_PAID);
      expect(await model.getPaid(id)).to.equal('900');
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal(0);
    });
    it('It should handle a loan with more than a installment in advance, totally', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        110, // cuota
        toInterestRate(240), // interestRate
        10, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal(110);
      expect(await model.getClosingObligation(id)).to.equal('1100');

      await model.addPaid(id, 4000, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(STATUS_PAID);
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal(0);
      expect(await model.getClosingObligation(id)).to.equal(0);
      expect(await model.getPaid(id)).to.equal('1100');
    });
    it('It should handle a loan with more than a installment in advance, partially', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        110, // cuota
        toInterestRate(240), // interestRate
        10, // installments
        secInMonth, // duration
        secInDay, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal(110);
      expect(await model.getClosingObligation(id)).to.equal('1100');

      await model.addPaid(id, 330, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal('330');
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(4))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal(110);

      await model.addPaid(id, 150, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal('480');
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(5))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('70');

      await model.addPaid(id, 4000, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal('1100');
      expect(await model.getStatus(id)).to.equal(STATUS_PAID);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(10))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal(0);
    });
    it('It should calculate the interest like the test doc test 1', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        secInDay, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');
      expect(await model.getClosingObligation(id)).to.equal(bn('99963').mul(bn(12)));

      // Pay the full next installment in a couple of days
      await increaseTime(secInDay.mul(bn(2)));
      await model.run(id, { from: accountEngine });
      await increaseTime(secInDay.mul(bn(5)));
      await model.run(id, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(23))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(53))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');
      expect(await model.getPaid(id)).to.equal('99963');

      // Wait a month and a week
      await increaseTime(secInDay.mul(bn(30 + 7)));

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(46))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Wait a month
      await increaseTime(secInMonth);

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(46))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Wait to the next payment, exactly
      await increaseTime(secInMonth);

      // Wait to the next payment, exactly
      await increaseTime(secInDay.mul(bn(16)));

      // Past the payment date by 5 days
      await increaseTime(secInDay.mul(bn(5)));

      await model.run(id, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay.mul(bn(5))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('100691');

      await model.addPaid(id, 100691, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal(bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')));
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
    });
    it('It should calculate the interest like the test doc test 1 - alt run', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');
      expect(await model.getClosingObligation(id)).to.equal(bn('99963').mul(bn(12)));

      // Pay the full next installment in a couple of days
      await increaseTime(secInDay.mul(bn(2)));
      await model.run(id, { from: accountEngine });
      await increaseTime(secInDay.mul(bn(5)));
      await model.run(id, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(23))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(53))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');
      expect(await model.getPaid(id)).to.equal('99963');

      // Wait a month and a week
      await increaseTime(secInDay.mul(bn(30 + 7)));

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(46))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Wait a month
      await increaseTime(secInMonth);

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(46))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Wait to the next payment, exactly
      await increaseTime(secInMonth);

      // Wait to the next payment, exactly
      await increaseTime(secInDay.mul(bn(16)));

      await model.run(id, { from: accountEngine });

      // Past the payment date by 5 days
      await increaseTime(secInDay.mul(bn(5)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay.mul(bn(5))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('100691');

      await model.addPaid(id, 100691, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal(bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')));
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
    });
    it('It should calculate the interest like the test doc test 1 - alt run 2', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        secInDay, // timeUnit
      );

      const tx = await model.create(id, data, { from: accountEngine });

      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
      expect(await model.getDueTime(id)).to.equal((await getTxTime(tx)).add(secInMonth));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');
      expect(await model.getClosingObligation(id)).to.equal(bn('99963').mul(bn(12)));

      // Pay the full next installment in a couple of days
      await increaseTime(secInDay.mul(bn(2)));
      await model.run(id, { from: accountEngine });
      await increaseTime(secInDay.mul(bn(5)));

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(23))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(53))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');
      expect(await model.getPaid(id)).to.equal('99963');

      // Wait a month and a week
      await increaseTime(secInDay.mul(bn(30 + 7)));

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(46))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Wait a month
      await increaseTime(secInMonth);

      await model.addPaid(id, 99963, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(46))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Wait to the next payment, exactly
      await increaseTime(secInMonth);

      await model.run(id, { from: accountEngine });

      // Wait to the next payment, exactly
      await increaseTime(secInDay.mul(bn(16)));

      // Past the payment date by 5 days
      await increaseTime(secInDay.mul(bn(5)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay.mul(bn(5))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('100691');

      await model.addPaid(id, 100691, { from: accountEngine });

      expect(await model.getPaid(id)).to.equal(bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')));
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING);
    });
    it('It should calculate the interest like the test doc test 3', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        secInDay, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      await model.addPaid(id, 99963 * 3, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(4))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Pass 4 months to the next loan expire time
      await increaseTime(secInMonth.mul(bn(4)));

      // Pass 12 days from the due date
      await increaseTime(secInDay.mul(bn(12)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay.mul(bn(12))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('101712');

      await model.addPaid(id, 101712, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(18))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal(0);
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Advance to the next month
      await increaseTime(secInDay.mul(bn(18)));

      // And to the next...
      await increaseTime(secInMonth);

      // And to the next...
      await increaseTime(secInMonth);

      await model.addPaid(id, 250000, { from: accountEngine });

      // Advance to the next month
      await increaseTime(secInMonth);

      expect((await model.getObligation(id, await getNow()))[0]).to.equal('165727');

      await model.addPaid(id, web3.utils.toWei('1'), { from: accountEngine });
      expect(await model.getPaid(id)).to.equal('1217180');
      expect(await model.getStatus(id)).to.equal(STATUS_PAID);
    });
    it('It should calculate the interest like the test doc test 3 - alt run 1', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      await model.addPaid(id, 99963 * 3, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(4))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Pass 4 months to the next loan expire time
      await increaseTime(secInMonth.mul(bn(2)));
      await model.run(id, { from: accountEngine });
      await increaseTime(secInMonth.mul(bn(2)));

      // Pass 12 days from the due date
      await increaseTime(secInDay.mul(bn(12)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay.mul(bn(12))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('101712');

      await model.addPaid(id, 101712, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(18))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal(0);
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Advance to the next month
      await increaseTime(secInDay.mul(bn(18)));

      // And to the next...
      await increaseTime(secInMonth);

      await model.run(id, { from: accountEngine });

      // And to the next...
      await increaseTime(secInMonth);

      await model.addPaid(id, 250000, { from: accountEngine });

      // Advance to the next month
      await increaseTime(secInMonth);

      expect((await model.getObligation(id, await getNow()))[0]).to.equal('165727');

      await model.addPaid(id, web3.utils.toWei('1'), { from: accountEngine });
      expect(await model.getPaid(id)).to.equal('1217180');
      expect(await model.getStatus(id)).to.equal(STATUS_PAID);
    });
    it('It should calculate the interest like the test doc test 3 - alt run 2', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      await model.addPaid(id, 99963 * 3, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(4))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Pass 4 months to the next loan expire time
      await increaseTime(secInMonth.mul(bn(2)).sub(bn(2)));
      await model.run(id, { from: accountEngine });
      await increaseTime(secInMonth.mul(bn(2)).add(bn(2)));

      // Pass 12 days from the due date
      await increaseTime(secInDay.mul(bn(12)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay.mul(bn(12))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('101712');

      await model.addPaid(id, 101712, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInDay.mul(bn(18))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal(0);
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      // Advance to the next month
      await increaseTime(secInDay.mul(bn(18)));

      // And to the next...
      await increaseTime(secInMonth);

      await model.run(id, { from: accountEngine });

      // And to the next...
      await increaseTime(secInDay.mul(bn(29)).add(bn(10)));
      await model.run(id, { from: accountEngine });
      await increaseTime(secInDay.sub(bn(10)));

      await model.addPaid(id, 250000, { from: accountEngine });

      // Advance to the next month
      await increaseTime(secInMonth);

      expect((await model.getObligation(id, await getNow()))[0]).to.equal('165727');

      await model.addPaid(id, web3.utils.toWei('1'), { from: accountEngine });
      expect(await model.getPaid(id)).to.equal('1217180');
      expect(await model.getStatus(id)).to.equal(STATUS_PAID);
    });
    it('It should calculate the interest like the test doc test 4', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      // Pay the next 4 months in advance
      await model.addPaid(id, 99963 * 4, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(5))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      expect(await model.getPaid(id)).to.equal(bn('99963').mul(bn('4')), 'Paid should be the amount of 3 installments');

      // Lets stop the payments
      // Advance 4 months and take a look
      await increaseTime(secInMonth.mul(bn(4 + 4)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInMonth.mul(bn(3))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('426091');

      // Advance the last 4 months
      await increaseTime(secInMonth.mul(bn(4)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInMonth.mul(bn(7))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('922155');
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING, 'Loan should be ongoing');
    });
    it('It should calculate the interest like the test doc test 4 - alt run 1', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      // Pay the next 4 months in advance
      await model.addPaid(id, 99963 * 4, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(5))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      expect(await model.getPaid(id)).to.equal(bn('99963').mul(bn('4')), 'Paid should be the amount of 3 installments');

      // Lets stop the payments
      // Advance 4 months and take a look
      await increaseTime(secInMonth.mul(bn(4 + 4)));

      await model.run(id, { from: accountEngine });
      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInMonth.mul(bn(3))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('426091');

      // Advance the last 4 months
      await increaseTime(secInMonth.mul(bn(4)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInMonth.mul(bn(7))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('922155');
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING, 'Loan should be ongoing');
    });
    it('It should calculate the interest like the test doc test 4 - alt run 2', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      // Pay the next 4 months in advance
      await model.addPaid(id, 99963 * 4, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(5))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      expect(await model.getPaid(id)).to.equal(bn('99963').mul(bn('4')), 'Paid should be the amount of 3 installments');

      // Lets stop the payments
      // Advance 4 months and take a look
      await increaseTime(secInMonth.mul(bn(4 + 4)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInMonth.mul(bn(3))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('426091');

      // Advance the last 4 months
      await increaseTime(secInMonth.mul(bn(4)));

      await model.run(id, { from: accountEngine });
      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInMonth.mul(bn(7))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('922155');
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING, 'Loan should be ongoing');
    });
    it('It should calculate the interest like the test doc test 4 - alt run 3', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        99963, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        1, // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      // Pay the next 4 months in advance
      await model.addPaid(id, 99963 * 4, { from: accountEngine });

      almostEqual(await model.getDueTime(id), (await getNow()).add(secInMonth.mul(bn(5))));
      expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.equal('99963');

      expect(await model.getPaid(id)).to.equal(bn('99963').mul(bn('4')), 'Paid should be the amount of 3 installments');

      // Lets stop the payments
      // Advance 4 months and take a look
      await increaseTime(secInMonth.mul(bn(4 + 4)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInMonth.mul(bn(3))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('426091');

      // Advance the last 4 months
      await increaseTime(secInMonth);
      await model.fixClock(id, (await getNow()).sub(secInDay.mul(bn(15))));
      await increaseTime(secInMonth.mul(bn(3)));

      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInMonth.mul(bn(7))));
      expect((await model.getObligation(id, await getNow()))[0]).to.equal('922154');
      expect(await model.getStatus(id)).to.equal(STATUS_ONGOING, 'Loan should be ongoing');
    });
    it('Should ignored periods of time under the time unit', async function () {
      const id = web3.utils.randomHex(32);
      const data = await model.encodeData(
        10000, // cuota
        toInterestRate(35 * 1.5), // interestRate
        12, // installments
        secInMonth, // duration
        secInDay.mul(bn(2)), // timeUnit
      );

      await model.create(id, data, { from: accountEngine });

      await increaseTime(secInDay.mul(bn(31)));

      expect((await model.getObligation(id, await getNow()))[0]).to.equal('10000');
      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay));

      await model.run(id, { from: accountEngine });

      expect((await model.getObligation(id, await getNow()))[0]).to.equal('10000');
      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay));

      await increaseTime(secInDay.mul(bn(3)));

      expect((await model.getObligation(id, await getNow()))[0]).to.equal('10058');
      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay.mul(bn(4))));

      await model.run(id, { from: accountEngine });

      expect((await model.getObligation(id, await getNow()))[0]).to.equal('10058');
      almostEqual(await model.getDueTime(id), (await getNow()).sub(secInDay.mul(bn(4))));
    });
  });
});
