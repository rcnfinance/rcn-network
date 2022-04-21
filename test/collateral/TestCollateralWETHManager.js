const { expect } = require('chai');
const { ethers } = require('hardhat');
const { bn, getNow, randomHex } = require('../Helper.js');

async function getETHBalance (address) {
  return bn(await ethers.provider.getBalance(address));
}

describe('Test WETH manager for collateral cosigner', function () {
  let owner, creator, borrower, depositer, burner;
  let loanManager, model, collateral, oracle, weth9, collWETHManager;

  const WEI = ethers.utils.parseEther('1');

  function ratio (num) {
    return bn(num).mul(bn(2).pow(bn(32))).div(bn(100));
  }

  async function createDefaultLoan () {
    const loanAmount = WEI;
    const duration = bn(await getNow()).add(bn(60 * 60));

    const MAX_UINT64 = bn(2).pow(bn(64)).sub(bn(1));

    const loanData = await model.encodeData(loanAmount, duration, 0, MAX_UINT64);

    const loanTx = await loanManager.connect(borrower).requestLoan(
      loanAmount,                   // Amount
      model.address,                // Model
      ethers.constants.AddressZero, // Oracle
      borrower.address,             // Borrower
      ethers.constants.AddressZero, // Callback
      randomHex(),                  // salt
      duration,                     // Expiration
      loanData,                     // Loan data
    );

    const eventSign = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(
      'Requested(bytes32,uint128,address,address,address,address,address,uint256,bytes,uint256)'
    ));
    const receipt = await ethers.provider.getTransactionReceipt(loanTx.hash);
    const event = receipt.logs.find(l => l.topics[0] === eventSign);
    return event.topics[1];
  }

  async function createDefaultCollateral () {
    const loanId = await createDefaultLoan();
    const entryAmount = WEI.mul(bn(2));

    const entryId = await collateral.getEntriesLength();

    await collWETHManager.connect(creator).create(
      loanId,         // debtId
      oracle.address, // entry oracle
      ratio(150),     // liquidationRatio
      ratio(200),     // balanceRatio
      { value: entryAmount }
    );

    return { entryId, loanId };
  }

  before('Create contracts', async function () {
    [owner, creator, borrower, depositer, burner] = await ethers.getSigners();

    const WETH9 = await ethers.getContractFactory('WETH9');
    weth9 = await WETH9.deploy();
    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    oracle = await TestRateOracle.deploy();
    await oracle.setToken(weth9.address);
    const TestToken = await ethers.getContractFactory('TestToken');
    rcn = await TestToken.deploy();
    const DebtEngine = await ethers.getContractFactory('DebtEngine');
    debtEngine = await DebtEngine.deploy(rcn.address, burner.address, 100);
    const LoanManager = await ethers.getContractFactory('LoanManager');
    loanManager = await LoanManager.deploy(debtEngine.address);
    const TestModel = await ethers.getContractFactory('TestModel');
    model = await TestModel.deploy();
    await model.setEngine(debtEngine.address);
    // Collateral deploy
    const TestCollateralAuctionMock = await ethers.getContractFactory('TestCollateralAuctionMock');
    const testCollateralAuctionMock = await TestCollateralAuctionMock.deploy(loanManager.address);
    const Collateral = await ethers.getContractFactory('Collateral');
    collateral = await Collateral.deploy(loanManager.address, testCollateralAuctionMock.address);
    await testCollateralAuctionMock.setCollateral(collateral.address);
    const CollateralWETHManager = await ethers.getContractFactory('CollateralWETHManager');
    collWETHManager = await CollateralWETHManager.deploy(weth9.address, collateral.address);
  });

  it('Modifier isTheOwner, try withdraw balance without being the owner of the entry', async function () {
    const ids = await createDefaultCollateral();

    await expect(
      collWETHManager.connect(borrower).withdraw(ids.entryId, ethers.constants.AddressZero, 1, [])
    ).to.be.revertedWith('CollateralWETHManager: Sender not authorized');
  });
  it('Function create, create a new collateral with WETH', async function () {
    const loanId = await createDefaultLoan();
    const entryAmount = WEI.mul(bn('2'));

    const entryId = await collateral.getEntriesLength();
    const prevETHBalWETH = await getETHBalance(weth9.address);
    const prevETHBalCreator = await getETHBalance(creator.address);

    await collWETHManager.connect(creator).create(
      loanId,         // debtId
      oracle.address, // entry oracle
      ratio(150),     // liquidationRatio
      ratio(200),     // balanceRatio
      { value: entryAmount, gasPrice: 0 },
    );

    // Check ownership
    expect(await collateral.ownerOf(entryId)).to.equal(creator.address);
    // Check balance
    expect(await getETHBalance(collWETHManager.address)).to.equal(0);
    expect(await getETHBalance(weth9.address)).to.equal(prevETHBalWETH.add(entryAmount));
    expect(await getETHBalance(creator.address)).to.equal(prevETHBalCreator.sub(entryAmount));
  });
  it('Function deposit, deposit WETH in an entry', async function () {
    const ids = await createDefaultCollateral();
    const amount = bn(1000000);
    const prevETHBalWETH = await getETHBalance(weth9.address);
    const prevETHBalDepositer = await getETHBalance(depositer.address);

    await collWETHManager.connect(depositer).deposit(
      ids.entryId,
      { value: amount, gasPrice: 0 },
    );

    // Check balance
    expect(await getETHBalance(collWETHManager.address)).to.equal(0);
    expect(await getETHBalance(weth9.address)).to.equal(prevETHBalWETH.add(amount));
    expect(await getETHBalance(depositer.address)).to.equal(prevETHBalDepositer.sub(amount));
  });
  describe('Function setWeth', async function () {
    it('Set a new weth contract', async function () {
      await expect(await collWETHManager.setWeth(owner.address))
        .to.emit(collWETHManager, 'SetWeth')
        .withArgs(owner.address);

      expect(await collWETHManager.weth()).to.equal(owner.address);

      await collWETHManager.setWeth(weth9.address);
    });
    it('Try set a new WETH without being the owner', async function () {
      await expect(
        collWETHManager.connect(borrower).setWeth(ethers.constants.AddressZero)
        ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
  describe('Function setCollateral', async function () {
    it('Set a new collateral contract', async function () {
      await expect(await collWETHManager.setCollateral(owner.address))
        .to.emit(collWETHManager, 'SetCollateral')
        .withArgs(owner.address);

      expect(await collWETHManager.collateral()).to.equal(owner.address);

      await collWETHManager.setCollateral(collateral.address);
    });
    it('Try set a new Collateral without be the owner', async function () {
      await expect(
        collWETHManager.connect(borrower).setCollateral(ethers.constants.AddressZero)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
  describe('Function withdraw', async function () {
    it('Withdraw WETH of an entry', async function () {
      const ids = await createDefaultCollateral();
      const amount = bn(1000000);

      await collateral.connect(creator).approve(collWETHManager.address, ids.entryId);

      const prevETHBalWETH = await getETHBalance(weth9.address);
      const prevETHBalBorrower = await getETHBalance(borrower.address);
      const prevETHBalCreator = await getETHBalance(creator.address);

      await collWETHManager.connect(creator).withdraw(
        ids.entryId,
        borrower.address,
        amount,
        [],
        { gasPrice: 0 },
      );

      // Check balance
      expect(await getETHBalance(collWETHManager.address)).to.equal(0);
      expect(await getETHBalance(weth9.address)).to.equal(prevETHBalWETH.sub(amount));
      expect(await getETHBalance(borrower.address)).to.equal(prevETHBalBorrower.add(amount));
      expect(await getETHBalance(creator.address)).to.equal(prevETHBalCreator);
    });
    it('Try Withdraw WETH of an entry without authorization', async function () {
      const ids = await createDefaultCollateral();

      await expect(
        collWETHManager.connect(creator).withdraw(ids.entryId, ethers.constants.AddressZero, 1, []),
      ).to.be.revertedWith('collateral: Sender not authorized');
    });
  });
});
