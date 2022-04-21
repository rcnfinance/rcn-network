const { expect } = require('chai');
const { ethers } = require('hardhat');

const {
  bn,
  increaseTime,
  getNow,
  randomHex,
  toBytes32,
} = require('../Helper.js');

describe('Test Collateral cosigner Diaspore', function () {
  let owner, borrower, creator, burner;
  let rcn, auxToken, loanManager, debtEngine, model, collateral, oracle, testCollateralAuctionMock, testCollateralHandler;

  const WEI = ethers.utils.parseEther('1');

  async function toFee (amount) {
    const feePerc = await debtEngine.fee();
    const BASE = await debtEngine.BASE();

    return amount.mul(feePerc).div(BASE);
  }

  function ratio (num) {
    return bn(num).mul(bn(2).pow(bn(32))).div(bn(100));
  }

  async function createDefaultLoan () {
    const loanAmount = WEI;
    const duration = bn(await getNow()).add(bn(60 * 60));

    const interestAmount = bn('1');
    const interestTime = duration.add(bn(60 * 60));

    const loanData = await model.encodeData(loanAmount, duration, interestAmount, interestTime);

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

    await auxToken.setBalance(creator.address, entryAmount);
    await auxToken.connect(creator).approve(collateral.address, entryAmount);

    const entryId = await collateral.getEntriesLength();

    await collateral.connect(creator).create(
      creator.address, // Owner
      loanId,          // debtId
      oracle.address,  // entry oracle
      entryAmount,     // amount
      ratio(150),      // liquidationRatio
      ratio(200),      // balanceRatio
    );

    return { entryId, loanId };
  }

  async function lendDefaultCollateral () {
    const ids = await createDefaultCollateral();

    const loanAmount = (await loanManager.requests(ids.loanId)).amount;
    await rcn.setBalance(creator.address, loanAmount);
    await rcn.connect(creator).approve(loanManager.address, loanAmount);

    await loanManager.connect(creator).lend(
      ids.loanId,             // Loan ID
      [],                     // Oracle data
      collateral.address,     // Collateral cosigner address
      bn(0),                  // Collateral cosigner cost
      toBytes32(ids.entryId), // Collateral ID reference
      [],                     // Callback data
    );

    return ids;
  }

  before('Create contracts', async function () {
    [owner, borrower, creator, burner] = await ethers.getSigners();

    const TestToken = await ethers.getContractFactory('TestToken');
    rcn = await TestToken.deploy();
    auxToken = await TestToken.deploy();

    const TestRateOracle = await ethers.getContractFactory('TestRateOracle');
    oracle = await TestRateOracle.deploy();

    await oracle.setEquivalent(WEI);
    await oracle.setToken(auxToken.address);

    const DebtEngine = await ethers.getContractFactory('DebtEngine');
    debtEngine = await DebtEngine.deploy(rcn.address, burner.address, 100);

    const LoanManager = await ethers.getContractFactory('LoanManager');
    loanManager = await LoanManager.deploy(debtEngine.address);

    const TestModel = await ethers.getContractFactory('TestModel');
    model = await TestModel.deploy();

    await model.setEngine(debtEngine.address);

    // Collateral deploy
    const TestCollateralAuctionMock = await ethers.getContractFactory('TestCollateralAuctionMock');
    testCollateralAuctionMock = await TestCollateralAuctionMock.deploy(loanManager.address);

    const Collateral = await ethers.getContractFactory('Collateral');
    collateral = await Collateral.deploy(loanManager.address, testCollateralAuctionMock.address);

    await testCollateralAuctionMock.setCollateral(collateral.address);

    const TestCollateralHandler = await ethers.getContractFactory('TestCollateralHandler');
    testCollateralHandler = await TestCollateralHandler.deploy(collateral.address);
  });

  it('Set new url', async function () {
    const url = 'test.com';

    await expect(await collateral.setUrl(url))
      .to.emit(collateral, 'SetUrl')
      .withArgs(url);

    expect(await collateral.url()).to.equal(url);
  });
  it('The cost should be 0', async function () {
    expect(await collateral.cost(
      ethers.constants.AddressZero,
      0,
      [],
      [],
    )).to.equal(0);
  });
  describe('Functions onlyOwner', async function () {
    it('Try redeem an entry without being the owner', async function () {
      await expect(
        collateral.connect(creator).redeem(0, creator.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('Try set new url without be the owner', async function () {
      await expect(
        collateral.connect(creator).setUrl('')
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
  describe('Constructor', function () {
    it('Check the loanManager and loanManagerToken', async function () {
      const Collateral = await ethers.getContractFactory('Collateral');
      const collateral = await Collateral.deploy(loanManager.address, testCollateralAuctionMock.address);

      expect(await collateral.loanManager()).to.equal(loanManager.address);
      expect(await collateral.loanManagerToken()).to.equal(await loanManager.token());
      expect(await collateral.auction()).to.equal(testCollateralAuctionMock.address);
      expect(await collateral.getEntriesLength()).to.equal(1);
    });
  });
  describe('Function create', function () {
    it('Should create a new collateral', async function () {
      const loanId = await createDefaultLoan();
      const liquidationRatio = ratio(150);
      const balanceRatio = ratio(200);
      const entryAmount = WEI;
      const collId = await collateral.getEntriesLength();

      await rcn.setBalance(creator.address, entryAmount);
      await rcn.connect(creator).approve(collateral.address, entryAmount);

      const prevCollBalance = await rcn.balanceOf(collateral.address);
      const prevCreatorBalance = await rcn.balanceOf(creator.address);

      await expect(
        await collateral.connect(creator).create(
          creator.address,
          loanId,
          ethers.constants.AddressZero,
          entryAmount,
          liquidationRatio,
          balanceRatio,
        )
      )
        .to.emit(collateral, 'Created')
        .withArgs(
          collId,
          loanId,
          ethers.constants.AddressZero,
          rcn.address,
          entryAmount,
          liquidationRatio,
          balanceRatio,
        );

      // Ownership
      expect(await collateral.ownerOf(collId)).to.equal(creator.address);
      // Entry length
      expect(await collateral.getEntriesLength()).to.equal(collId.add(bn(1)));
      // Balance of collateral
      expect(await rcn.balanceOf(collateral.address)).to.equal(prevCollBalance.add(entryAmount));
      expect(await rcn.balanceOf(creator.address)).to.equal(prevCreatorBalance.sub(entryAmount));
    });
    it('Should create a new collateral, with auxToken as entry token', async function () {
      const loanId = await createDefaultLoan();
      const liquidationRatio = ratio(150);
      const balanceRatio = ratio(200);
      const entryAmount = WEI;
      const collId = await collateral.getEntriesLength();

      await auxToken.setBalance(creator.address, entryAmount);
      await auxToken.connect(creator).approve(collateral.address, entryAmount);

      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevCreatorBalance = await auxToken.balanceOf(creator.address);

      await expect(
        await collateral.connect(creator).create(
          creator.address,
          loanId,
          oracle.address,
          entryAmount,
          liquidationRatio,
          balanceRatio,
        )
      )
        .to.emit(collateral, 'Created')
        .withArgs(
          collId,
          loanId,
          oracle.address,
          auxToken.address,
          entryAmount,
          liquidationRatio,
          balanceRatio,
        );

      // Ownership
      expect(await collateral.ownerOf(collId)).to.equal(creator.address);
      // Entry length
      expect(await collateral.getEntriesLength()).to.equal(collId.add(bn(1)));
      // Balance of collateral
      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.add(entryAmount));
      expect(await auxToken.balanceOf(creator.address)).to.equal(prevCreatorBalance.sub(entryAmount));
    });
    it('Try create a new collateral with address 0 as owner', async function () {
      await expect(
        collateral.connect(creator).create(
          ethers.constants.AddressZero,
          await createDefaultLoan(),
          ethers.constants.AddressZero,
          1,
          ratio(150),
          ratio(200),
        ),
      ).to.be.revertedWith('collateral: _owner should not be address 0');
    });
    it('Try create a new collateral for a closed loan', async function () {
      const loanId = await createDefaultLoan();
      await rcn.setBalance(owner.address, WEI.mul(bn(100)));
      await rcn.approve(loanManager.address, WEI.mul(bn(100)));
      await loanManager.lend(loanId, [], ethers.constants.AddressZero, 0, [], []);

      await expect(
        collateral.connect(creator).create(
          creator.address,
          loanId,
          ethers.constants.AddressZero,
          0,
          ratio(150),
          ratio(200),
        ),
      ).to.be.revertedWith('collateral: loan request should be open');
    });
    it('Try create a new collateral without approval of the token collateral', async function () {
      const loanId = await createDefaultLoan();

      await rcn.setBalance(creator.address, 1);
      await rcn.connect(creator).approve(collateral.address, 0);

      await expect(
        collateral.connect(creator).create(
          creator.address,
          loanId,
          ethers.constants.AddressZero,
          1,
          ratio(150),
          ratio(200),
        ),
      ).to.be.revertedWith('ERC20: insufficient allowance');

      await rcn.setBalance(owner.address, 1);
      await rcn.approve(collateral.address, 0);

      await expect(
        collateral.connect(creator).create(
          owner.address,
          loanId,
          ethers.constants.AddressZero,
          1,
          ratio(150),
          ratio(200),
        ),
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });
  });
  describe('Function deposit', function () {
    it('Should deposit an amount in a collateral', async function () {
      const ids = await createDefaultCollateral();

      const prevEntry = await collateral.entries(ids.entryId);

      const depositAmount = bn(10000);
      await auxToken.setBalance(creator.address, depositAmount);
      await auxToken.connect(creator).approve(collateral.address, depositAmount);

      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevCreatorBalance = await auxToken.balanceOf(creator.address);

      await expect(await collateral.connect(creator).deposit(ids.entryId, depositAmount))
        .to.emit(collateral, 'Deposited')
        .withArgs(ids.entryId, depositAmount);

      // Test collateral entry
      const entry = await collateral.entries(ids.entryId);
      // Should remain the same
      expect(entry.debtId).to.equal(prevEntry.debtId);
      expect(entry.oracle).to.equal(prevEntry.oracle);
      expect(entry.token).to.equal(prevEntry.token);
      expect(entry.liquidationRatio).to.equal(prevEntry.liquidationRatio);
      expect(entry.balanceRatio).to.equal(prevEntry.balanceRatio);
      // Should increase by amount
      expect(entry.amount).to.equal(prevEntry.amount.add(depositAmount));
      // Balance of collateral
      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.add(depositAmount));
      expect(await auxToken.balanceOf(creator.address)).to.equal(prevCreatorBalance.sub(depositAmount));
    });
    it('Try deposit 0 amount on entry collateral', async function () {
      const ids = await lendDefaultCollateral();

      await expect(
        collateral.connect(creator).deposit(ids.entryId, 0),
      ).to.be.revertedWith('collateral: The amount of deposit should not be 0');
    });
    it('Try deposit collateral in a inAuction entry', async function () {
      const ids = await lendDefaultCollateral();

      await increaseTime(60 * 61);
      await collateral.claim(ethers.constants.AddressZero, ids.loanId, []);

      await expect(
        collateral.connect(creator).deposit(ids.entryId, 1),
      ).to.be.revertedWith('collateral: can\'t deposit during auction');
    });
  });
  describe('Function withdraw', function () {
    it('Should withdraw token', async function () {
      const ids = await createDefaultCollateral();

      const prevEntry = await collateral.entries(ids.entryId);

      const withdrawAmount = bn(1);
      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevBorrowerBalance = await auxToken.balanceOf(borrower.address);

      expect(await collateral.connect(creator).withdraw(
        ids.entryId,
        borrower.address,
        withdrawAmount,
        [],
      ))
        .to.emit(collateral, 'Withdraw')
        .withArgs(ids.entryId, borrower.address, withdrawAmount);

      // Test collateral entry
      const entry = await collateral.entries(ids.entryId);
      // Should remain the same
      expect(entry.debtId).to.equal(prevEntry.debtId);
      expect(entry.amount).to.equal(prevEntry.amount.sub(withdrawAmount));
      expect(entry.oracle).to.equal(prevEntry.oracle);
      expect(entry.token).to.equal(prevEntry.token);
      expect(entry.liquidationRatio).to.equal(prevEntry.liquidationRatio);
      expect(entry.balanceRatio).to.equal(prevEntry.balanceRatio);

      // Balance of collateral
      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.sub(withdrawAmount));
      expect(await auxToken.balanceOf(borrower.address)).to.equal(prevBorrowerBalance.add(withdrawAmount));
    });
    it('Try withdraw 0 amount on entry collateral', async function () {
      const ids = await createDefaultCollateral();

      await expect(
        collateral.connect(creator).withdraw(
          ids.entryId,
          borrower.address,
          0,
          [],
        ),
      ).to.be.revertedWith('collateral: The amount of withdraw not be 0');
    });
    it('Try withdraw high balance', async function () {
      const ids = await createDefaultCollateral();

      await expect(
        collateral.connect(creator).withdraw(
          ids.entryId,
          borrower.address,
          (await collateral.entries(ids.entryId)).amount.add(bn(1)),
          [],
        ),
      ).to.be.revertedWith('collateral: withdrawable collateral is not enough');
    });
    it('Should withdraw token on lent entry', async function () {
      const ids = await lendDefaultCollateral();

      const prevEntry = await collateral.entries(ids.entryId);

      const withdrawAmount = bn(1);
      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevBorrowerBalance = await auxToken.balanceOf(borrower.address);

      expect(
        await collateral.connect(creator).withdraw(
          ids.entryId,
          borrower.address,
          withdrawAmount,
          [],
        )
      )
        .to.emit(collateral, 'Withdraw')
        .withArgs(ids.entryId, borrower.address, withdrawAmount);

      // Test collateral entry
      const entry = await collateral.entries(ids.entryId);
      // Should remain the same
      expect(entry.debtId).to.equal(prevEntry.debtId);
      expect(entry.amount).to.equal(prevEntry.amount.sub(withdrawAmount));
      expect(entry.oracle).to.equal(prevEntry.oracle);
      expect(entry.token).to.equal(prevEntry.token);
      expect(entry.liquidationRatio).to.equal(prevEntry.liquidationRatio);
      expect(entry.balanceRatio).to.equal(prevEntry.balanceRatio);

      // Balance of collateral
      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.sub(withdrawAmount));
      expect(await auxToken.balanceOf(borrower.address)).to.equal(prevBorrowerBalance.add(withdrawAmount));
    });
    it('Try withdraw total balance on lent entry', async function () {
      const ids = await lendDefaultCollateral();

      await expect(
        collateral.connect(creator).withdraw(
          ids.entryId,
          borrower.address,
          (await collateral.entries(ids.entryId)).amount,
          [],
        ),
      ).to.be.revertedWith('collateral: withdrawable collateral is not enough');
    });
    it('Try withdraw collateral in a inAuction entry', async function () {
      const ids = await lendDefaultCollateral();

      await increaseTime(60 * 61);
      await collateral.claim(ethers.constants.AddressZero, ids.loanId, []);

      await expect(
        collateral.connect(creator).withdraw(
          ids.entryId,
          ethers.constants.AddressZero,
          1,
          [],
        ),
      ).to.be.revertedWith('collateral: can\'t withdraw during auction');
    });
    it('Try withdraw an entry without being authorized', async function () {
      const ids = await lendDefaultCollateral();

      await expect(
        collateral.connect(borrower).withdraw(
          ids.entryId,
          ethers.constants.AddressZero,
          0,
          [],
        ),
      ).to.be.revertedWith('collateral: Sender not authorized');
    });
    it('Should withdraw token in a paid debt', async function () {
      const ids = await lendDefaultCollateral();

      const closingObligation = await loanManager['getClosingObligation(uint256)'](ids.loanId);

      const total = closingObligation.amount.add(closingObligation.fee);

      await rcn.setBalance(testCollateralHandler.address, total);

      const entryAmount = (await collateral.entries(ids.entryId)).amount;
      await testCollateralHandler.setHandlerConst(
        total,
        entryAmount.sub(total),
      );

      await collateral.connect(creator).borrowCollateral(
        ids.entryId,
        testCollateralHandler.address,
        [],
        [],
      );

      expect((await loanManager['getClosingObligation(uint256)'](ids.loanId)).amount).to.equal(0);

      const prevEntry = await collateral.entries(ids.entryId);

      const withdrawAmount = prevEntry.amount;
      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevBorrowerBalance = await auxToken.balanceOf(borrower.address);

      expect(
        await collateral.connect(creator).withdraw(
          ids.entryId,
          borrower.address,
          withdrawAmount,
          [],
        )
      )
        .to.emit(collateral, 'Withdraw')
        .withArgs(ids.entryId, borrower.address, withdrawAmount);

      // Test collateral entry
      const entry = await collateral.entries(ids.entryId);
      // Should remain the same
      expect(entry.debtId).to.equal(prevEntry.debtId);
      expect(entry.amount).to.equal(prevEntry.amount.sub(withdrawAmount));
      expect(entry.oracle).to.equal(prevEntry.oracle);
      expect(entry.token).to.equal(prevEntry.token);
      expect(entry.liquidationRatio).to.equal(prevEntry.liquidationRatio);
      expect(entry.balanceRatio).to.equal(prevEntry.balanceRatio);

      // Balance of collateral
      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.sub(withdrawAmount));
      expect(await auxToken.balanceOf(borrower.address)).to.equal(prevBorrowerBalance.add(withdrawAmount));
    });
  });
  describe('Function redeem', function () {
    it('Should redeem an entry with a loan in ERROR status', async function () {
      const ids = await lendDefaultCollateral();

      await model.setErrorFlag(ids.loanId, 4);

      const collAmount = (await collateral.entries(ids.entryId)).amount;
      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevBurnerBalance = await auxToken.balanceOf(creator.address);

      expect(await collateral.redeem(ids.entryId, burner.address))
        .to.emit(collateral, 'Redeemed')
        .withArgs(ids.entryId, burner.address);

      const entry = await collateral.entries(ids.entryId);
      // Should remain the same
      expect(entry.debtId).to.equal(ethers.constants.HashZero);
      expect(entry.amount).to.equal(0);
      expect(entry.oracle).to.equal(ethers.constants.AddressZero);
      expect(entry.token).to.equal(ethers.constants.AddressZero);
      expect(entry.liquidationRatio).to.equal(0);
      expect(entry.balanceRatio).to.equal(0);

      // Balance of collateral
      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.sub(collAmount));
      expect(await auxToken.balanceOf(burner.address)).to.equal(prevBurnerBalance.add(collAmount));
    });
    it('Try redeem an entry with a loan in not ERROR status', async function () {
      const ids = await lendDefaultCollateral();

      await expect(
        collateral.connect(owner).redeem(
          ids.entryId,
          creator.address,
        ),
      ).to.be.revertedWith('collateral: the debt should be in status error');
    });
  });
  describe('Function borrowCollateral', function () {
    it('Should pay the total loan amount', async function () {
      const ids = await lendDefaultCollateral();

      const prevEntry = await collateral.entries(ids.entryId);

      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevBorrowerBalance = await auxToken.balanceOf(borrower.address);

      const closingObligation = await loanManager['getClosingObligation(uint256)'](ids.loanId);
      const total = closingObligation.amount.add(closingObligation.fee);

      await rcn.setBalance(testCollateralHandler.address, total);

      await testCollateralHandler.setHandlerConst(
        total,
        prevEntry.amount.sub(total),
      );

      expect(
        await collateral.connect(creator).borrowCollateral(
          ids.entryId,
          testCollateralHandler.address,
          [],
          [],
        )
      )
        .to.emit(collateral, 'BorrowCollateral')
        .withArgs(ids.entryId, testCollateralHandler.address, prevEntry.amount.sub(total));

      // Test collateral entry
      const entry = await collateral.entries(ids.entryId);
      // Should remain the same
      expect(entry.debtId).to.equal(prevEntry.debtId);
      expect(entry.amount).to.equal(prevEntry.amount.sub(total));
      expect(entry.token).to.equal(prevEntry.token);
      expect(entry.oracle).to.equal(prevEntry.oracle);
      expect(entry.liquidationRatio).to.equal(prevEntry.liquidationRatio);
      expect(entry.balanceRatio).to.equal(prevEntry.balanceRatio);

      // Balance of collateral
      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.sub(total));
      expect(await auxToken.balanceOf(borrower.address)).to.equal(prevBorrowerBalance);
    });
    it('Try hack with handler contract', async function () {
      const ids = await lendDefaultCollateral();

      const entryAmount = (await collateral.entries(ids.entryId)).amount;
      const closingObligation = await loanManager['getClosingObligation(uint256)'](ids.loanId);
      const total = closingObligation.amount.add(closingObligation.fee);
      await rcn.setBalance(testCollateralHandler.address, 0);
      await testCollateralHandler.setHandlerConst(
        total,
        entryAmount,
      );
      await expect(
        collateral.connect(creator).borrowCollateral(
          ids.entryId,
          testCollateralHandler.address,
          [],
          [],
        ),
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });
    it('Try borrowCollateral an entry without being authorized', async function () {
      const ids = await lendDefaultCollateral();

      await expect(
        collateral.connect(borrower).borrowCollateral(
          ids.entryId,
          ethers.constants.AddressZero,
          [],
          [],
        ),
      ).to.be.revertedWith('collateral: Sender not authorized');
    });
  });
  describe('Function auctionClosed', function () {
    it('Should close an auction', async function () {
      const ids = await lendDefaultCollateral();

      await increaseTime(60 * 61);
      const auctionId = await testCollateralAuctionMock.auctionId();
      await collateral.claim(ethers.constants.AddressZero, ids.loanId, []);

      const leftover = bn(1000);
      const received = await toFee(bn(1000));
      await rcn.setBalance(testCollateralAuctionMock.address, received);

      await testCollateralAuctionMock.toAuctionClosed(
        auctionId,
        leftover,
        received,
        [],
      );

      expect(await collateral.entryToAuction(ids.entryId)).to.equal(0);
      expect(await collateral.auctionToEntry(auctionId)).to.equal(0);

      const entryAmount = (await collateral.entries(ids.entryId)).amount;
      expect(entryAmount).to.equal(leftover);
      expect((await debtEngine.debts(ids.loanId)).balance).to.equal(received.sub(await toFee(received)));
    });
    it('Should close an auction, pay the loan and received more tokens', async function () {
      const ids = await lendDefaultCollateral();

      await increaseTime(60 * 61);
      const auctionId = await testCollateralAuctionMock.auctionId();
      await collateral.claim(ethers.constants.AddressZero, ids.loanId, []);

      const received = WEI.mul(bn(4));
      await rcn.setBalance(testCollateralAuctionMock.address, received);

      const prevCreatorBalance = await rcn.balanceOf(creator.address);

      await testCollateralAuctionMock.toAuctionClosed(
        auctionId,
        0,
        received,
        [],
      );

      const fee = await toFee(WEI);
      expect(await rcn.balanceOf(creator.address)).to.equal(prevCreatorBalance.add(WEI.mul(bn(3)).sub(fee)));
    });
    it('Try close an auction without be the auction contract', async function () {
      await expect(
        collateral.auctionClosed(
          ethers.constants.HashZero,
          0,
          0,
          [],
        ),
      ).to.be.revertedWith('collateral: caller should be the auctioner');
    });
    it('Try close an inexist auction', async function () {
      await expect(
        testCollateralAuctionMock.toAuctionClosed(
          ethers.constants.HashZero,
          0,
          0,
          [],
        ),
      ).to.be.revertedWith('collateral: entry does not exists');
    });
  });
  describe('Function requestCosign', function () {
    it('Try lend a debt with low collateral ratio', async function () {
      const loanId = await createDefaultLoan();
      const entryAmount = bn(1);

      await auxToken.setBalance(creator.address, entryAmount);
      await auxToken.connect(creator).approve(collateral.address, entryAmount);

      const entryId = await collateral.getEntriesLength();

      await collateral.connect(creator).create(
        creator.address,   // owner
        loanId,            // debtId
        oracle.address,    // entry oracle
        entryAmount,       // amount
        ratio(150),        // liquidationRatio
        ratio(200),        // balanceRatio
      );

      const loanAmount = (await loanManager.requests(loanId)).amount;
      await rcn.setBalance(creator.address, loanAmount);
      await rcn.connect(creator).approve(loanManager.address, loanAmount);

      await expect(
        loanManager.connect(creator).lend(
          loanId,
          [],
          collateral.address,
          0,
          toBytes32(entryId),
          [],
        ),
      ).to.be.revertedWith('collateral: entry not collateralized');
    });
    it('Try request cosign with wrong sender', async function () {
      await expect(
        collateral.requestCosign(
          ethers.constants.AddressZero,
          2,
          [],
          [],
        ),
      ).to.be.revertedWith('collateral: only the loanManager can request cosign');
    });
  });
  describe('Function claim', function () {
    it('Try claim the entry 0', async function () {
      await expect(
        collateral.canClaim(
          0,
          [],
        ),
      ).to.be.revertedWith('collateral: collateral not found for debtId');

      await expect(
        collateral.claim(
          ethers.constants.AddressZero,
          0,
          [],
        ),
      ).to.be.revertedWith('collateral: collateral not found for debtId');
    });
    it('Try claim an entry in auction', async function () {
      const ids = await lendDefaultCollateral();

      await increaseTime(60 * 61);
      await collateral.claim(ethers.constants.AddressZero, ids.loanId, []);

      expect(await collateral.canClaim(ids.loanId, [])).to.be.false;

      await expect(
        collateral.claim(
          ethers.constants.AddressZero,
          ids.loanId,
          [],
        ),
      ).to.be.revertedWith('collateral: auction already exists');
    });
  });
  describe('Function _claimExpired', function () {
    it('Should claim an expired debt', async function () {
      const ids = await lendDefaultCollateral();

      expect(await collateral.canClaim(ids.loanId, [])).to.be.false;

      await increaseTime(60 * 61);

      expect(await collateral.canClaim(ids.loanId, [])).to.be.true;

      const dueTime = await model.getDueTime(ids.loanId);
      const obligation = await loanManager['getObligation(uint256,uint64)'](ids.loanId, dueTime);
      const total = obligation.amount.add(obligation.fee);

      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevAuctionBalance = await auxToken.balanceOf(testCollateralAuctionMock.address);
      const prevEntryAmount = (await collateral.entries(ids.entryId)).amount;
      const totalPlus5Porcent = total.mul(bn(105)).div(bn(100));
      const auctionId = await testCollateralAuctionMock.auctionId();

      expect(await collateral.claim(ethers.constants.AddressZero, ids.loanId, []))
        .to.emit(collateral, 'ClaimedExpired')
        .withArgs(ids.entryId, auctionId, totalPlus5Porcent, totalPlus5Porcent, totalPlus5Porcent, dueTime);

      const entry = await collateral.entries(ids.entryId);
      expect(entry.amount).to.equal(0);

      expect(await collateral.entryToAuction(ids.entryId)).to.equal(auctionId);
      expect(await collateral.auctionToEntry(auctionId)).to.equal(ids.entryId);

      expect(await auxToken.allowance(collateral.address, testCollateralAuctionMock.address)).to.equal(0);

      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.sub(prevEntryAmount));
      expect(await auxToken.balanceOf(testCollateralAuctionMock.address)).to.equal(prevAuctionBalance.add(prevEntryAmount));
    });
    it('Should claim an expired debt with interest', async function () {
      const ids = await lendDefaultCollateral();

      expect(await collateral.canClaim(ids.loanId, [])).to.be.false;

      await increaseTime(60 * 61 * 2);

      expect(await collateral.canClaim(ids.loanId, [])).to.be.true;

      const dueTime = await model.getDueTime(ids.loanId);
      const now = await getNow();
      const obligation = await loanManager['getObligation(uint256,uint64)'](ids.loanId, now);
      const total = obligation.amount.add(obligation.fee);

      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevAuctionBalance = await auxToken.balanceOf(testCollateralAuctionMock.address);
      const prevEntryAmount = (await collateral.entries(ids.entryId)).amount;
      const totalPlus5Porcent = total.mul(bn(105)).div(bn(100));
      const auctionId = await testCollateralAuctionMock.auctionId();

      expect(await collateral.claim(ethers.constants.AddressZero, ids.loanId, []))
        .to.emit(collateral, 'ClaimedExpired')
        .withArgs(ids.entryId, auctionId, totalPlus5Porcent, totalPlus5Porcent, totalPlus5Porcent, dueTime);

      const entry = await collateral.entries(ids.entryId);
      expect(entry.amount).to.equal(0);

      expect(await collateral.entryToAuction(ids.entryId)).to.equal(auctionId);
      expect(await collateral.auctionToEntry(auctionId)).to.equal(ids.entryId);

      expect(await auxToken.allowance(collateral.address, testCollateralAuctionMock.address)).to.equal(0);

      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.sub(prevEntryAmount));
      expect(await auxToken.balanceOf(testCollateralAuctionMock.address)).to.equal(prevAuctionBalance.add(prevEntryAmount));
    });
  });
  describe('Function _claimLiquidation', function () {
    it('Should liquidation an entry', async function () {
      const ids = await lendDefaultCollateral();

      expect(await collateral.canClaim(ids.loanId, [])).to.be.false;

      await model.addDebt(ids.loanId, WEI.mul(bn(9)));
      const depositAmount = WEI.mul(bn(12));
      await auxToken.setBalance(creator.address, depositAmount);
      await auxToken.connect(creator).approve(collateral.address, depositAmount);
      await collateral.connect(creator).deposit(ids.entryId, depositAmount);

      const closingObligation = await loanManager['getClosingObligation(uint256)'](ids.loanId);
      const total = closingObligation.amount.add(closingObligation.fee);
      const required = WEI.mul(bn(62)).div(bn(10));

      // Entry amount = 14 WEI
      // Debt  amount = 10 WEI + 0.1 WEI fee
      // Coll ratio = 14 / 10.1 = 1.386

      // Post entry amount = 7.8 WEI
      // Post debt  amount = 3.8 WEI
      // Post coll ratio = 8 / 4 = 2

      const prevCollBalance = await auxToken.balanceOf(collateral.address);
      const prevAuctionBalance = await auxToken.balanceOf(testCollateralAuctionMock.address);
      const prevEntryAmount = (await collateral.entries(ids.entryId)).amount;
      const auctionId = await testCollateralAuctionMock.auctionId();

      expect(await collateral.canClaim(ids.loanId, [])).to.be.true;

      expect(await collateral.claim(ethers.constants.AddressZero, ids.loanId, []))
        .to.emit(collateral, 'ClaimedLiquidation')
        .withArgs(ids.entryId, auctionId, required, total, required);

      const entry = await collateral.entries(ids.entryId);
      expect(entry.amount).to.equal(0);

      expect(await collateral.entryToAuction(ids.entryId)).to.equal(auctionId);
      expect(await collateral.auctionToEntry(auctionId)).to.equal(ids.entryId);

      expect(await auxToken.allowance(collateral.address, testCollateralAuctionMock.address)).to.equal(0);

      expect(await auxToken.balanceOf(collateral.address)).to.equal(prevCollBalance.sub(prevEntryAmount));
      expect(await auxToken.balanceOf(testCollateralAuctionMock.address)).to.equal(prevAuctionBalance.add(prevEntryAmount));
    });
  });
});
