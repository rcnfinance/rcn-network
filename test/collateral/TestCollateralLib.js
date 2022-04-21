const { expect } = require('chai');
const { ethers } = require('hardhat');
const { bn, randomHex } = require('../Helper.js');

function ratio (num) {
  return bn(num).mul(bn(2).pow(bn(32))).div(bn(100));
}

function unratio (enc) {
  return bn(enc).mul(bn(100)).div(bn(2).pow(bn(32)));
}

async function expectTuple (promise, v0, v1) {
  const result = await promise;
  expect(result[0]).to.equal(bn(v0));
  expect(result[1]).to.equal(bn(v1));
}

describe('Test Collateral lib', function () {
  it('Should create a collateral entry', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();
    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    const oracle = await TestRateOracle.deploy();

    await lib.create(
      oracle.address,
      token.address,
      debtId,
      bn(1000),
      ratio(110),
      ratio(150),
    );

    const entry = await lib.entry();
    expect(entry.debtId).to.be.equal(debtId);
    expect(entry.amount).to.equal(bn(1000));
    expect(entry.oracle).to.be.equal(oracle.address);
    expect(entry.token).to.be.equal(token.address);
    expect(entry.liquidationRatio).to.equal(ratio(110));
    expect(entry.balanceRatio).to.equal(ratio(150));
  });
  it('Should fail create collateral entry with liquidation ratio below balance ratio', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await expect(
      lib.create(
        ethers.constants.AddressZero,
        token.address,
        debtId,
        bn(1000),
        ratio(110),
        ratio(105),
      )
    ).to.be.revertedWith('collateral-lib: _liquidationRatio should be below _balanceRatio');
  });
  it('Should fail create collateral entry with liquidation ratio equal to balance ratio', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await expect(
      lib.create(
        ethers.constants.AddressZero,
        token.address,
        debtId,
        bn(1000),
        ratio(110),
        ratio(110),
      )
    ).to.be.revertedWith('collateral-lib: _liquidationRatio should be below _balanceRatio');
  });
  it('Should fail create collateral entry with liquidation below 100', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await expect(
      lib.create(
        ethers.constants.AddressZero,
        token.address,
        debtId,
        bn(1000),
        ratio(99),
        ratio(110),
      )
    ).to.be.revertedWith('collateral-lib: _liquidationRatio should be above one');
  });
  it('Should fail create collateral entry with no token', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const debtId = randomHex();

    await expect(
      lib.create(
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        debtId,
        bn(1000),
        ratio(105),
        ratio(110),
      )
    ).to.be.revertedWith('collateral-lib: _token can\'t be address zero');
  });
  it('Should convert amount without RateOracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await lib.create(
      ethers.constants.AddressZero,
      token.address,
      debtId,
      bn(1000),
      ratio(110),
      ratio(150),
    );

    expect(await lib.toBase()).to.equal(bn(1000));
  });
  it('Should convert amount using RateOracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();
    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    const oracle = await TestRateOracle.deploy();

    await lib.create(
      oracle.address,
      token.address,
      debtId,
      bn(1000),
      ratio(110),
      ratio(150),
    );

    // 1 BASE == 0.5 TOKEN
    await oracle.setEquivalent(bn('500000000000000000'));
    expect(await lib.toBase()).to.equal(bn(2000));
  });
  it('Should return current ratio without RateOracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await lib.create(
      ethers.constants.AddressZero,
      token.address,
      debtId,
      bn(1000),
      ratio(110),
      ratio(150),
    );

    expect(await lib.ratio(bn(1000))).to.equal(ratio(100));
    expect(unratio(await lib.ratio(bn(1000)))).to.equal(bn(100));
    expect(unratio(await lib.ratio(bn(909)))).to.equal(bn(110));
    expect(unratio(await lib.ratio(bn(333)))).to.equal(bn(300));
    expect(unratio(await lib.ratio(bn(1000)))).to.equal(bn(100));
    expect(unratio(await lib.ratio(bn(1100)))).to.equal(bn(90));
    expect(unratio(await lib.ratio(bn(2000)))).to.equal(bn(50));
    expect(unratio(await lib.ratio(bn(4000)))).to.equal(bn(25));
  });
  it('Should return current ratio with RateOracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();
    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    const oracle = await TestRateOracle.deploy();

    await lib.create(
      oracle.address,
      token.address,
      debtId,
      bn(500),
      ratio(110),
      ratio(150),
    );

    // 1 BASE == 0.5 TOKEN
    await oracle.setEquivalent(bn('500000000000000000'));

    expect(await lib.ratio(bn(1000))).to.equal(ratio(100));
    expect(unratio(await lib.ratio(bn(1000)))).to.equal(bn(100));
    expect(unratio(await lib.ratio(bn(909)))).to.equal(bn(110));
    expect(unratio(await lib.ratio(bn(333)))).to.equal(bn(300));
    expect(unratio(await lib.ratio(bn(1000)))).to.equal(bn(100));
    expect(unratio(await lib.ratio(bn(1100)))).to.equal(bn(90));
    expect(unratio(await lib.ratio(bn(2000)))).to.equal(bn(50));
    expect(unratio(await lib.ratio(bn(4000)))).to.equal(bn(25));
  });
  it('Should return required to balance without RateOracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await lib.create(
      ethers.constants.AddressZero,
      token.address,
      debtId,
      bn(1000),
      ratio(110),
      ratio(150),
    );

    // Balance is not required
    await expectTuple(lib.balance(bn(0)), 0, 0);
    await expectTuple(lib.balance(bn(100)), 0, 0);
    await expectTuple(lib.balance(bn(250)), 0, 0);
    await expectTuple(lib.balance(bn(500)), 0, 0);
    await expectTuple(lib.balance(bn(909)), 0, 0);

    // Balance is required
    await expectTuple(lib.balance(bn(910)), 730, 730);
    await expectTuple(lib.balance(bn(920)), 760, 760);
    await expectTuple(lib.balance(bn(990)), 970, 970);
    await expectTuple(lib.balance(bn(999)), 997, 997);
    await expectTuple(lib.balance(bn(1000)), 1000, 1000);
    await expectTuple(lib.balance(bn(1200)), 1000, 1000);
    await expectTuple(lib.balance(bn(2000)), 1000, 1000);
    await expectTuple(lib.balance(bn(2000000)), 1000, 1000);
  });
  it('Should return required to balance without RateOracle - biz', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await lib.create(
      ethers.constants.AddressZero,
      token.address,
      debtId,
      bn(1200),
      ratio(120),
      ratio(150),
    );

    // Balance is not required
    await expectTuple(lib.balance(bn(0)), 0, 0);
    await expectTuple(lib.balance(bn(100)), 0, 0);
    await expectTuple(lib.balance(bn(250)), 0, 0);
    await expectTuple(lib.balance(bn(500)), 0, 0);
    await expectTuple(lib.balance(bn(909)), 0, 0);
    await expectTuple(lib.balance(bn(1000)), 0, 0);

    // Balance is required
    await expectTuple(lib.balance(bn(1001)), 603, 603);
  });
  it('Should return required to balance with RateOracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();
    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    const oracle = await TestRateOracle.deploy();

    await lib.create(
      oracle.address,
      token.address,
      debtId,
      bn(500),
      ratio(110),
      ratio(150),
    );

    // 1 BASE == 0.5 TOKEN
    await oracle.setEquivalent(bn('500000000000000000'));

    // Balance is not required
    await expectTuple(lib.balance(bn(0)), 0, 0);
    await expectTuple(lib.balance(bn(100)), 0, 0);
    await expectTuple(lib.balance(bn(250)), 0, 0);
    await expectTuple(lib.balance(bn(500)), 0, 0);
    await expectTuple(lib.balance(bn(909)), 0, 0);

    // Balance is required
    await expectTuple(lib.balance(bn(910)), 365, 730);
    await expectTuple(lib.balance(bn(920)), 380, 760);
    await expectTuple(lib.balance(bn(990)), 485, 970);
    await expectTuple(lib.balance(bn(999)), 498, 997);
    await expectTuple(lib.balance(bn(1000)), 500, 1000);
    await expectTuple(lib.balance(bn(1200)), 500, 1000);
    await expectTuple(lib.balance(bn(2000)), 500, 1000);
    await expectTuple(lib.balance(bn(2000000)), 500, 1000);
  });
  it('Should return required to balance with RateOracle - biz', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();
    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    const oracle = await TestRateOracle.deploy();

    await lib.create(
      oracle.address,
      token.address,
      debtId,
      bn(600),
      ratio(120),
      ratio(150),
    );

    // 1 BASE == 0.5 TOKEN
    await oracle.setEquivalent(bn('500000000000000000'));

    // Balance is not required
    await expectTuple(lib.balance(bn(0)), 0, 0);
    await expectTuple(lib.balance(bn(100)), 0, 0);
    await expectTuple(lib.balance(bn(250)), 0, 0);
    await expectTuple(lib.balance(bn(500)), 0, 0);
    await expectTuple(lib.balance(bn(909)), 0, 0);

    // Balance is required
    await expectTuple(lib.balance(bn(1001)), 301, 603);
  });
  it('Should return can withdraw without RateOracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await lib.create(
      ethers.constants.AddressZero,
      token.address,
      debtId,
      bn(1000),
      ratio(110),
      ratio(150),
    );

    // Can't withdraw collateral
    expect(await lib.canWithdraw(bn(910))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(920))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(990))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(999))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(1000))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(1200))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(2000))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(2000000))).to.equal(bn(0));

    // Can withdraw collateral
    expect(await lib.canWithdraw(bn(0))).to.equal(bn(1000));
    expect(await lib.canWithdraw(bn(100))).to.equal(bn(890));
    expect(await lib.canWithdraw(bn(250))).to.equal(bn(725));
    expect(await lib.canWithdraw(bn(500))).to.equal(bn(450));
    expect(await lib.canWithdraw(bn(900))).to.equal(bn(10));
    expect(await lib.canWithdraw(bn(909))).to.equal(bn(0));
  });
  it('Should return can withdraw with RateOracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();
    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    const oracle = await TestRateOracle.deploy();

    await lib.create(
      oracle.address,
      token.address,
      debtId,
      bn(500),
      ratio(110),
      ratio(150),
    );

    // 1 BASE == 0.5 TOKEN
    await oracle.setEquivalent(bn('500000000000000000'));

    // Can't withdraw collateral
    expect(await lib.canWithdraw(bn(910))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(920))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(990))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(999))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(1000))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(1200))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(2000))).to.equal(bn(0));
    expect(await lib.canWithdraw(bn(2000000))).to.equal(bn(0));

    // Can withdraw collateral
    expect(await lib.canWithdraw(bn(0))).to.equal(bn(500));
    expect(await lib.canWithdraw(bn(100))).to.equal(bn(445));
    expect(await lib.canWithdraw(bn(250))).to.equal(bn(362));
    expect(await lib.canWithdraw(bn(500))).to.equal(bn(225));
    expect(await lib.canWithdraw(bn(900))).to.equal(bn(5));
    expect(await lib.canWithdraw(bn(909))).to.equal(bn(0));
  });
  it('Should return if a collateral is in liquidation, without rate oracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();

    await lib.create(
      ethers.constants.AddressZero,
      token.address,
      debtId,
      bn(1000),
      ratio(110),
      ratio(150),
    );

    // Not in liquidation
    expect(await lib.inLiquidation(bn(0))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(100))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(250))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(500))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(900))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(909))).to.be.equal(false);

    // Requires liquidation
    expect(await lib.inLiquidation(bn(910))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(920))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(990))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(999))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(1000))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(1200))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(2000))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(2000000))).to.be.equal(true);
  });
  it('Should return if a collateral is in liquidation, with rate oracle', async () => {
    const TestCollateralLib = await ethers.getContractFactory('TestCollateralLib');
    const lib = await TestCollateralLib.deploy();
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.deploy();
    const debtId = randomHex();
    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    const oracle = await TestRateOracle.deploy();

    await lib.create(
      oracle.address,
      token.address,
      debtId,
      bn(500),
      ratio(110),
      ratio(150),
    );

    // 1 BASE == 0.5 TOKEN
    await oracle.setEquivalent(bn('500000000000000000'));

    // Not in liquidation
    expect(await lib.inLiquidation(bn(0))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(100))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(250))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(500))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(900))).to.be.equal(false);
    expect(await lib.inLiquidation(bn(909))).to.be.equal(false);

    // Requires liquidation
    expect(await lib.inLiquidation(bn(910))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(920))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(990))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(999))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(1000))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(1200))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(2000))).to.be.equal(true);
    expect(await lib.inLiquidation(bn(2000000))).to.be.equal(true);
  });
});
