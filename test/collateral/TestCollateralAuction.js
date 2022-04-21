const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getNow, randomHex } = require('../Helper.js');

describe('Test Collateral Dutch auction', function () {
  let stub, owner, user, anotherUser, hacker;
  let base, token, auction, id, mock;

  beforeEach(async () => {
    [owner, stub, user, anotherUser, hacker] = await ethers.getSigners();

    const TestToken = await ethers.getContractFactory('TestToken');
    base = await TestToken.deploy();
    token = await TestToken.deploy();
    const CollateralAuction = await ethers.getContractFactory('TestCollateralAuction');
    auction = await CollateralAuction.deploy(base.address);
  });

  it('Create auctions, should create an auction', async () => {
    await token.setBalance(owner.address, 2000);
    await token.approve(auction.address, 2000);
    const auctionId = await auction.getAuctionsLength();

    await expect(auction.create(
      token.address,
      950,
      1000,
      2000,
      50,
    ))
      .to.emit(auction, 'CreatedAuction')
      .withArgs(
        auctionId,
        token.address,
        950,
        1000,
        50,
        2000
      );

    expect(await token.balanceOf(auction.address)).to.equal(2000);

    // Validate struct
    const entry = await auction.auctions(auctionId);
    expect(entry.fromToken).to.be.equal(token.address);
    expect(entry.startTime).to.equal(await getNow());
    expect(entry.limitDelta).to.equal(12600);
    expect(entry.startOffer).to.equal(950);
    expect(entry.amount).to.equal(50);
    expect(entry.limit).to.equal(2000);

    // Should increase auction count
    expect(await auction.getAuctionsLength()).to.equal(2);
  });
  describe('Fail to create an auction', () => {
    it('Should fail to create with reference below offer', async () => {
      await expect(
        auction.create(
          token.address,
          1010,
          1000,
          2000,
          50,
        ),
      ).to.be.revertedWith('auction: offer should be below refence offer');
    });
    it('Should fail to create with limit below reference', async () => {
      await expect(
        auction.create(
          token.address,
          900,
          2100,
          2000,
          50,
        ),
      ).to.be.revertedWith('auction: reference offer should be below or equal to limit');
    });
    it('Should fail to create with limit below offer', async () => {
      await expect(
        auction.create(
          token.address,
          900,
          950,
          800,
          50,
        ),
      ).to.be.revertedWith('auction: reference offer should be below or equal to limit');
    });
    it('Should fail to create if creator has not enough tokens', async () => {
      await expect(
        auction.create(
          token.address,
          900,
          950,
          1800,
          50,
        ),
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });
    it('Should fail to create if creator did not approve the contract', async () => {
      await token.setBalance(owner.address, 2000);

      await expect(
        auction.create(
          token.address,
          900,
          950,
          1800,
          50,
        ),
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });
  });
  describe('Take an auction', async () => {
    context('with same token', async () => {
      beforeEach(async () => {
        await base.setBalance(owner.address, 2000);

        const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
        mock = await MockCollateralAuctionCallback.deploy();

        await base.approve(auction.address, 2000);
        await auction.setTime(Math.floor(new Date().getTime() / 1000));

        id = await auction.getAuctionsLength();
        await auction.create(
          base.address,
          950,
          1000,
          2000,
          250,
        );

        expect(await base.balanceOf(auction.address)).to.equal(2000);

        await auction.transferOwnership(mock.address);
      });
      it('Should take same token auction just created', async () => {
        await base.setBalance(anotherUser.address, 0);
        await base.connect(anotherUser).approve(auction.address, 250);

        const data = randomHex(100);
        await auction.connect(anotherUser).take(id, data, false);

        expect(await base.balanceOf(mock.address)).to.equal(2000);
        expect(await base.balanceOf(auction.address)).to.equal(0);
        expect(await base.balanceOf(anotherUser.address)).to.equal(0);

        expect(await mock.lastId()).to.equal(id);
        expect(await mock.lastLeftover()).to.equal(1750);
        expect(await mock.lastReceived()).to.equal(250);
        expect(await mock.lastData()).to.be.equal(data);
      });
      it('Should take same token auction after 10 minutes', async () => {
        await base.setBalance(anotherUser.address, 0);
        await base.connect(anotherUser).approve(auction.address, 2000);

        await auction.increaseTime(10 * 60);

        const data = randomHex(100);
        await auction.connect(anotherUser).take(id, data, false);

        expect(await base.balanceOf(mock.address)).to.equal(2000);
        expect(await base.balanceOf(auction.address)).to.equal(0);
        expect(await base.balanceOf(anotherUser.address)).to.equal(0);

        expect(await mock.lastId()).to.equal(id);
        expect(await mock.lastLeftover()).to.equal(1750);
        expect(await mock.lastReceived()).to.equal(250);
        expect(await mock.lastData()).to.be.equal(data);
      });
      it('Should take same token auction after 10 days', async () => {
        await base.setBalance(anotherUser.address, 0);
        await base.connect(anotherUser).approve(auction.address, 2000);

        await auction.increaseTime(10 * 86400);

        const data = randomHex(100);
        await auction.connect(anotherUser).take(id, data, false);

        expect(await base.balanceOf(mock.address)).to.equal(2000);
        expect(await base.balanceOf(auction.address)).to.equal(0);
        expect(await base.balanceOf(anotherUser.address)).to.equal(0);

        expect(await mock.lastId()).to.equal(id);
        expect(await mock.lastLeftover()).to.equal(1750);
        expect(await mock.lastReceived()).to.equal(250);
        expect(await mock.lastData()).to.be.equal(data);
      });
      it('Should take same token auction after 1 year', async () => {
        await base.setBalance(anotherUser.address, 0);
        await base.connect(anotherUser).approve(auction.address, 2000);

        await auction.increaseTime(365 * 86400);

        const data = randomHex(100);
        await auction.connect(anotherUser).take(id, data, false);

        expect(await base.balanceOf(mock.address)).to.equal(2000);
        expect(await base.balanceOf(auction.address)).to.equal(0);
        expect(await base.balanceOf(anotherUser.address)).to.equal(0);

        expect(await mock.lastId()).to.equal(id);
        expect(await mock.lastLeftover()).to.equal(1750);
        expect(await mock.lastReceived()).to.equal(250);
        expect(await mock.lastData()).to.be.equal(data);
      });
    });
    context('with same token and _amount above _limit', async () => {
      beforeEach(async () => {
        await base.setBalance(owner.address, 2000);

        const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
        mock = await MockCollateralAuctionCallback.deploy();

        await base.approve(auction.address, 2000);
        await auction.setTime(Math.floor(new Date().getTime() / 1000));

        id = await auction.getAuctionsLength();
        await auction.create(
          base.address,
          950,
          1000,
          2000,
          4000,
        );

        expect(await base.balanceOf(auction.address)).to.equal(2000);

        await auction.transferOwnership(mock.address);
      });
      it('Should take same token auction just created', async () => {
        await base.setBalance(anotherUser.address, 0);
        await base.connect(anotherUser).approve(auction.address, 2000);

        const data = randomHex(100);
        await auction.connect(anotherUser).take(id, data, false);

        expect(await base.balanceOf(mock.address)).to.equal(2000);
        expect(await base.balanceOf(auction.address)).to.equal(0);
        expect(await base.balanceOf(anotherUser.address)).to.equal(0);

        expect(await mock.lastId()).to.equal(id);
        expect(await mock.lastLeftover()).to.equal(0);
        expect(await mock.lastReceived()).to.equal(2000);
        expect(await mock.lastData()).to.be.equal(data);
      });
      it('Should take same token auction after 10 minutes', async () => {
        await base.setBalance(anotherUser.address, 0);
        await base.connect(anotherUser).approve(auction.address, 2000);

        await auction.increaseTime(10 * 60);

        const data = randomHex(100);
        await auction.connect(anotherUser).take(id, data, false);

        expect(await base.balanceOf(mock.address)).to.equal(2000);
        expect(await base.balanceOf(auction.address)).to.equal(0);
        expect(await base.balanceOf(anotherUser.address)).to.equal(0);

        expect(await mock.lastId()).to.equal(id);
        expect(await mock.lastLeftover()).to.equal(0);
        expect(await mock.lastReceived()).to.equal(2000);
        expect(await mock.lastData()).to.be.equal(data);
      });
      it('Should take same token auction after 10 days', async () => {
        await base.setBalance(anotherUser.address, 0);
        await base.connect(anotherUser).approve(auction.address, 2000);

        await auction.increaseTime(10 * 86400);

        const data = randomHex(100);
        await auction.connect(anotherUser).take(id, data, false);

        expect(await base.balanceOf(mock.address)).to.equal(2000);
        expect(await base.balanceOf(auction.address)).to.equal(0);
        expect(await base.balanceOf(anotherUser.address)).to.equal(0);

        expect(await mock.lastId()).to.equal(id);
        expect(await mock.lastLeftover()).to.equal(0);
        expect(await mock.lastReceived()).to.equal(2000);
        expect(await mock.lastData()).to.be.equal(data);
      });
      it('Should take same token auction after 1 year', async () => {
        await base.setBalance(anotherUser.address, 0);
        await base.connect(anotherUser).approve(auction.address, 2000);

        await auction.increaseTime(365 * 86400);

        const data = randomHex(100);
        await auction.connect(anotherUser).take(id, data, false);

        expect(await base.balanceOf(mock.address)).to.equal(2000);
        expect(await base.balanceOf(auction.address)).to.equal(0);
        expect(await base.balanceOf(anotherUser.address)).to.equal(0);

        expect(await mock.lastId()).to.equal(id);
        expect(await mock.lastLeftover()).to.equal(0);
        expect(await mock.lastReceived()).to.equal(2000);
        expect(await mock.lastData()).to.be.equal(data);
      });
    });
    it('Should take an auction just created', async () => {
      await base.setBalance(user.address, 50);
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.transferOwnership(mock.address);

      const offer = await auction.offer(id);

      expect(offer[0]).to.equal(950);
      expect(offer[1]).to.equal(50);

      const data = randomHex(100);

      await base.connect(user).approve(auction.address, 50);
      await expect(auction.connect(user).take(id, data, false))
        .to.emit(auction, 'Take')
        .withArgs(
          id,
          user.address,
          950,
          50,
        );

      expect(await base.balanceOf(user.address)).to.equal(0);
      expect(await base.balanceOf(mock.address)).to.equal(50);
      expect(await token.balanceOf(user.address)).to.equal(950);
      expect(await token.balanceOf(auction.address)).to.equal(0);

      expect(await mock.lastId()).to.equal(id);
      expect(await mock.lastLeftover()).to.equal(1050);
      expect(await mock.lastReceived()).to.equal(50);
      expect(await mock.lastData()).to.be.equal(data);
    });
    it('Should take an auction at the reference price', async () => {
      await base.setBalance(user.address, 50);
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      await auction.setTime(Math.floor(new Date().getTime() / 1000));

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.increaseTime(10 * 60);

      await auction.transferOwnership(mock.address);

      const offer = await auction.offer(id);

      expect(offer[0]).to.equal(1000);
      expect(offer[1]).to.equal(50);

      const data = randomHex(100);

      await base.connect(user).approve(auction.address, 50);
      await expect(auction.connect(user).take(id, data, false))
      .to.emit(auction, 'Take')
      .withArgs(
        id,
        user.address,
        1000,
        50,
      );

      expect(await base.balanceOf(user.address)).to.equal(0);
      expect(await base.balanceOf(mock.address)).to.equal(50);
      expect(await token.balanceOf(user.address)).to.equal(1000);
      expect(await token.balanceOf(auction.address)).to.equal(0);

      expect(await mock.lastId()).to.equal(id);
      expect(await mock.lastLeftover()).to.equal(1000);
      expect(await mock.lastReceived()).to.equal(50);
      expect(await mock.lastData()).to.be.equal(data);
    });
    it('Should take an auction at half the limit price', async () => {
      await base.setBalance(user.address, 50);
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      await auction.setTime(Math.floor(new Date().getTime() / 1000));

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      await auction.increaseTime(6300);

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.transferOwnership(mock.address);

      const offer = await auction.offer(id);

      expect(offer[1]).to.equal(50);
      expect(offer[0]).to.equal(1475);

      const data = randomHex(100);

      await base.connect(user).approve(auction.address, 50);
      await expect(auction.connect(user).take(id, data, false))
        .to.emit(auction, 'Take')
        .withArgs(
          id,
          user.address,
          1475,
          50,
        );

      expect(await base.balanceOf(user.address)).to.equal(0);
      expect(await base.balanceOf(mock.address)).to.equal(50);
      expect(await token.balanceOf(user.address)).to.equal(1475);
      expect(await token.balanceOf(auction.address)).to.equal(0);

      expect(await mock.lastId()).to.equal(id);
      expect(await mock.lastLeftover()).to.equal(525);
      expect(await mock.lastReceived()).to.equal(50);
      expect(await mock.lastData()).to.be.equal(data);
    });
    it('Should take an auction at the limit price', async () => {
      await base.setBalance(user.address, 50);
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      await auction.setTime(Math.floor(new Date().getTime() / 1000));

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      await auction.increaseTime(12600);

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.transferOwnership(mock.address);

      const offer = await auction.offer(id);

      expect(offer[1]).to.equal(50);
      expect(offer[0]).to.equal(2000);

      const data = randomHex(100);

      await base.connect(user).approve(auction.address, 50);
      await expect(auction.connect(user).take(id, data, false))
        .to.emit(auction, 'Take')
        .withArgs(
          id,
          user.address,
          2000,
          50,
        );

      expect(await base.balanceOf(user.address)).to.equal(0);
      expect(await base.balanceOf(mock.address)).to.equal(50);
      expect(await token.balanceOf(user.address)).to.equal(2000);
      expect(await token.balanceOf(auction.address)).to.equal(0);

      expect(await mock.lastId()).to.equal(id);
      expect(await mock.lastLeftover()).to.equal(0);
      expect(await mock.lastReceived()).to.equal(50);
      expect(await mock.lastData()).to.be.equal(data);
    });
    it('Should take an auction requesting half the base', async () => {
      await base.setBalance(user.address, 50);
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      await auction.setTime(Math.floor(new Date().getTime() / 1000));

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      await auction.increaseTime(55800);

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.transferOwnership(mock.address);

      const offer = await auction.offer(id);

      expect(offer[1]).to.equal(25);
      expect(offer[0]).to.equal(2000);

      const data = randomHex(100);

      await base.connect(user).approve(auction.address, 25);
      await expect(auction.connect(user).take(id, data, false))
        .to.emit(auction, 'Take')
        .withArgs(
          id,
          user.address,
          2000,
          25,
        );

      expect(await base.balanceOf(user.address)).to.equal(25);
      expect(await base.balanceOf(mock.address)).to.equal(25);
      expect(await token.balanceOf(user.address)).to.equal(2000);
      expect(await token.balanceOf(auction.address)).to.equal(0);

      expect(await mock.lastId()).to.equal(id);
      expect(await mock.lastLeftover()).to.equal(0);
      expect(await mock.lastReceived()).to.equal(25);
      expect(await mock.lastData()).to.be.equal(data);
    });
    it('Should take an auction requesting almost no base', async () => {
      await base.setBalance(user.address, 50);
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      await auction.setTime(Math.floor(new Date().getTime() / 1000));

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.increaseTime(99000 - 1);

      await auction.transferOwnership(mock.address);

      const offer = await auction.offer(id);

      expect(offer[1]).to.equal(1);
      expect(offer[0]).to.equal(2000);

      const data = randomHex(100);

      await base.connect(user).approve(auction.address, 1);
      await expect(auction.connect(user).take(id, data, false))
        .to.emit(auction, 'Take')
        .withArgs(
          id,
          user.address,
          2000,
          1,
        );

      expect(await base.balanceOf(user.address)).to.equal(49);
      expect(await base.balanceOf(mock.address)).to.equal(1);
      expect(await token.balanceOf(user.address)).to.equal(2000);
      expect(await token.balanceOf(auction.address)).to.equal(0);

      expect(await mock.lastId()).to.equal(id);
      expect(await mock.lastLeftover()).to.equal(0);
      expect(await mock.lastReceived()).to.equal(1);
      expect(await mock.lastData()).to.be.equal(data);
    });
    it('Should take an auction after restarting the auction', async () => {
      await base.setBalance(user.address, 50);
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      await auction.setTime(Math.floor(new Date().getTime() / 1000));

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.increaseTime(99000 + 43200);

      await auction.transferOwnership(mock.address);

      const offer = await auction.offer(id);

      expect(offer[1]).to.equal(25);
      expect(offer[0]).to.equal(2000);

      const data = randomHex(100);

      await base.connect(user).approve(auction.address, 25);
      await expect(auction.connect(user).take(id, data, false))
        .to.emit(auction, 'Take')
        .withArgs(
          id,
          user.address,
          2000,
          25,
        );

      expect(await base.balanceOf(user.address)).to.equal(25);
      expect(await base.balanceOf(mock.address)).to.equal(25);
      expect(await token.balanceOf(user.address)).to.equal(2000);
      expect(await token.balanceOf(auction.address)).to.equal(0);

      expect(await mock.lastId()).to.equal(id);
      expect(await mock.lastLeftover()).to.equal(0);
      expect(await mock.lastReceived()).to.equal(25);
      expect(await mock.lastData()).to.be.equal(data);
    });
  });
  describe('Fail to take an auction', async () => {
    beforeEach(async () => {
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.transferOwnership(mock.address);
    });
    it('Should fail to take a non-existent auction', async () => {
      try {
        await auction.take(2, [], false);
      } catch (e) {
        return;
      }

      assert.fail();
    });
    it('Should fail to take a taken auction', async () => {
      await base.setBalance(anotherUser.address, 500);
      await base.connect(anotherUser).approve(auction.address, 500);

      await auction.connect(anotherUser).take(id, [], false);

      await expect(
        auction.take(id, [], false)
      ).to.be.revertedWith('auction: does not exists');
    });
    it('Should fail to take auction without balance', async () => {
      await expect(
        auction.take(id, [], false)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });
  });
  describe('Take and callback', () => {
    it('Should call taker callback', async () => {
      const TestAuctionCallback = await ethers.getContractFactory('TestAuctionCallback');
      const callback = await TestAuctionCallback.deploy();
      await base.setBalance(callback.address, 50);
      await token.setBalance(owner.address, 2000);

      const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

      await token.approve(auction.address, 2000);

      id = await auction.getAuctionsLength();
      await auction.create(
        token.address,
        950,
        1000,
        2000,
        50,
      );

      expect(await token.balanceOf(auction.address)).to.equal(2000);

      await auction.transferOwnership(mock.address);

      const offer = await auction.offer(id);

      expect(offer[0]).to.equal(950);
      expect(offer[1]).to.equal(50);

      const data = randomHex(100);

      // Take auction with callback contract
      await callback.take(auction.address, id, data);

      expect(await callback.callbackCalled()).to.be.equal(true);

      expect(await base.balanceOf(callback.address)).to.equal(0);
      expect(await base.balanceOf(mock.address)).to.equal(50);
      expect(await token.balanceOf(callback.address)).to.equal(950);
      expect(await token.balanceOf(auction.address)).to.equal(0);

      expect(await mock.lastId()).to.equal(id);
      expect(await mock.lastLeftover()).to.equal(1050);
      expect(await mock.lastReceived()).to.equal(50);
      expect(await mock.lastData()).to.be.equal(data);
    });
  });
  it('Should fail call taker callback on reentrancy', async () => {
    const TestAuctionCallback = await ethers.getContractFactory('TestAuctionCallback');
    const callback = await TestAuctionCallback.deploy();
    await callback.setTryReentrancy(true);

    await base.setBalance(callback.address, 50);
    await token.setBalance(owner.address, 2000);

    const MockCollateralAuctionCallback = await ethers.getContractFactory('MockCollateralAuctionCallback');
      mock = await MockCollateralAuctionCallback.deploy();

    await token.approve(auction.address, 2000);

    id = await auction.getAuctionsLength();
    await auction.create(
      token.address,
      950,
      1000,
      2000,
      50,
    );

    expect(await token.balanceOf(auction.address)).to.equal(2000);

    await auction.transferOwnership(mock.address);

    const offer = await auction.offer(id);

    expect(offer[0]).to.equal(950);
    expect(offer[1]).to.equal(50);

    const data = randomHex(100);

    // Take auction with callback contract
    await expect(
      callback.take(auction.address, id, data)
    ).to.be.revertedWith('auction: error during callback onTake()');

    expect(await callback.callbackCalled()).to.be.equal(false);
  });
});