const MockCollateralAuctionCallback = artifacts.require('MockCollateralAuctionCallback');
const CollateralAuction = artifacts.require('TestCollateralAuction');
const TestToken = artifacts.require('TestToken');
const TestAuctionCallback = artifacts.require('TestAuctionCallback');

const {
    expectEvent,
    expectRevert,
    time,
} = require('@openzeppelin/test-helpers');

const {
    expect,
    bn,
} = require('../Helper.js');

contract('Test Collateral Dutch auction', function ([_, stub, owner, user, anotherUser, hacker]) {
    let base;
    let token;
    let auction;
    let id;
    let mock;

    beforeEach(async () => {
        base = await TestToken.new({ from: owner });
        token = await TestToken.new({ from: owner });
        auction = await CollateralAuction.new(base.address, { from: owner });
    });

    describe('Create auctions', () => {
        it('Should create an auction', async () => {
            await token.setBalance(owner, bn(2000));
            await token.approve(auction.address, bn(2000), { from: owner });
            const auctionId = await auction.getAuctionsLength();

            expectEvent(
                await auction.create(
                    token.address,
                    bn(950),
                    bn(1000),
                    bn(2000),
                    bn(50),
                    { from: owner },
                ),
                'CreatedAuction',
                {
                    _id: auctionId,
                    _fromToken: token.address,
                    _startOffer: bn(950),
                    _refOffer: bn(1000),
                    _amount: bn(50),
                    _limit: bn(2000),
                },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            // Validate struct
            const entry = await auction.auctions(auctionId);
            expect(entry.fromToken).to.be.equal(token.address);
            expect(entry.startTime).to.eq.BN(await time.latest());
            expect(entry.limitDelta).to.eq.BN(bn(12600));
            expect(entry.startOffer).to.eq.BN(bn(950));
            expect(entry.amount).to.eq.BN(bn(50));
            expect(entry.limit).to.eq.BN(bn(2000));

            // Should increase auction count
            expect(await auction.getAuctionsLength()).to.eq.BN(bn(2));
        });
    });
    describe('Fail to create an auction', () => {
        it('Should fail to create with reference below offer', async () => {
            await expectRevert(
                auction.create(
                    token.address,
                    bn(1010),
                    bn(1000),
                    bn(2000),
                    bn(50),
                    { from: owner },
                ),
                'auction: offer should be below refence offer',
            );
        });
        it('Should fail to create with limit below reference', async () => {
            await expectRevert(
                auction.create(
                    token.address,
                    bn(900),
                    bn(2100),
                    bn(2000),
                    bn(50),
                    { from: owner },
                ),
                'auction: reference offer should be below or equal to limit',
            );
        });
        it('Should fail to create with limit below offer', async () => {
            await expectRevert(
                auction.create(
                    token.address,
                    bn(900),
                    bn(950),
                    bn(800),
                    bn(50),
                    { from: owner },
                ),
                'auction: reference offer should be below or equal to limit',
            );
        });
        it('Should fail to create if creator has not enough tokens', async () => {
            await expectRevert(
                auction.create(
                    token.address,
                    bn(900),
                    bn(950),
                    bn(1800),
                    bn(50),
                    { from: owner },
                ),
                'ERC20: transfer amount exceeds balance',
            );
        });
        it('Should fail to create if creator did not approve the contract', async () => {
            await token.setBalance(owner, bn(2000));

            await expectRevert(
                auction.create(
                    token.address,
                    bn(900),
                    bn(950),
                    bn(1800),
                    bn(50),
                    { from: owner },
                ),
                'ERC20: transfer amount exceeds allowance',
            );
        });
    });
    describe('Take an auction', async () => {
        context('with same token', async () => {
            beforeEach(async () => {
                await base.setBalance(owner, bn(2000));

                mock = await MockCollateralAuctionCallback.new();

                await base.approve(auction.address, bn(2000), { from: owner });
                await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

                id = await auction.getAuctionsLength();
                await auction.create(
                    base.address,
                    bn(950),
                    bn(1000),
                    bn(2000),
                    bn(250),
                    { from: owner },
                );

                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(2000));

                await auction.transferOwnership(mock.address, { from: owner });
            });
            it('Should take same token auction just created', async () => {
                await base.setBalance(anotherUser, bn(0));
                await base.approve(auction.address, bn(250), { from: anotherUser });

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(bn(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(bn(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(bn(1750));
                expect(await mock.lastReceived()).to.eq.BN(bn(250));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 10 minutes', async () => {
                await base.setBalance(anotherUser, bn(0));
                await base.approve(auction.address, bn(2000), { from: anotherUser });

                await auction.increaseTime(bn(10).mul(bn(60)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(bn(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(bn(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(bn(1750));
                expect(await mock.lastReceived()).to.eq.BN(bn(250));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 10 days', async () => {
                await base.setBalance(anotherUser, bn(0));
                await base.approve(auction.address, bn(2000), { from: anotherUser });

                await auction.increaseTime(bn(10).mul(bn(86400)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(bn(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(bn(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(bn(1750));
                expect(await mock.lastReceived()).to.eq.BN(bn(250));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 1 year', async () => {
                await base.setBalance(anotherUser, bn(0));
                await base.approve(auction.address, bn(2000), { from: anotherUser });

                await auction.increaseTime(bn(365).mul(bn(86400)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(bn(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(bn(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(bn(1750));
                expect(await mock.lastReceived()).to.eq.BN(bn(250));
                expect(await mock.lastData()).to.be.equal(data);
            });
        });
        context('with same token and _amount above _limit', async () => {
            beforeEach(async () => {
                await base.setBalance(owner, bn(2000));

                mock = await MockCollateralAuctionCallback.new();

                await base.approve(auction.address, bn(2000), { from: owner });
                await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

                id = await auction.getAuctionsLength();
                await auction.create(
                    base.address,
                    bn(950),
                    bn(1000),
                    bn(2000),
                    bn(4000),
                    { from: owner },
                );

                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(2000));

                await auction.transferOwnership(mock.address, { from: owner });
            });
            it('Should take same token auction just created', async () => {
                await base.setBalance(anotherUser, bn(0));
                await base.approve(auction.address, bn(2000), { from: anotherUser });

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(bn(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(bn(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(bn(0));
                expect(await mock.lastReceived()).to.eq.BN(bn(2000));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 10 minutes', async () => {
                await base.setBalance(anotherUser, bn(0));
                await base.approve(auction.address, bn(2000), { from: anotherUser });

                await auction.increaseTime(bn(10).mul(bn(60)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(bn(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(bn(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(bn(0));
                expect(await mock.lastReceived()).to.eq.BN(bn(2000));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 10 days', async () => {
                await base.setBalance(anotherUser, bn(0));
                await base.approve(auction.address, bn(2000), { from: anotherUser });

                await auction.increaseTime(bn(10).mul(bn(86400)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(bn(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(bn(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(bn(0));
                expect(await mock.lastReceived()).to.eq.BN(bn(2000));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 1 year', async () => {
                await base.setBalance(anotherUser, bn(0));
                await base.approve(auction.address, bn(2000), { from: anotherUser });

                await auction.increaseTime(bn(365).mul(bn(86400)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(bn(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(bn(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(bn(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(bn(0));
                expect(await mock.lastReceived()).to.eq.BN(bn(2000));
                expect(await mock.lastData()).to.be.equal(data);
            });
        });
        it('Should take an auction just created', async () => {
            await base.setBalance(user, bn(50));
            await token.setBalance(owner, bn(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const offer = await auction.offer(id);

            expect(offer[0]).to.eq.BN(bn(950));
            expect(offer[1]).to.eq.BN(bn(50));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, bn(50), { from: user });
            expectEvent(
                await await auction.take(id, data, false, { from: user }),
                'Take',
                { _id: id, _taker: user, _selling: bn(950), _requesting: bn(50) },
            );

            expect(await base.balanceOf(user)).to.eq.BN(bn(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(bn(50));
            expect(await token.balanceOf(user)).to.eq.BN(bn(950));
            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(bn(1050));
            expect(await mock.lastReceived()).to.eq.BN(bn(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction at the reference price', async () => {
            await base.setBalance(user, bn(50));
            await token.setBalance(owner, bn(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.increaseTime(bn(10).mul(bn(60)));

            await auction.transferOwnership(mock.address, { from: owner });

            const offer = await auction.offer(id);

            expect(offer[0]).to.eq.BN(bn(1000));
            expect(offer[1]).to.eq.BN(bn(50));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, bn(50), { from: user });
            expectEvent(
                await await auction.take(id, data, false, { from: user }),
                'Take',
                { _id: id, _taker: user, _selling: bn(1000), _requesting: bn(50) },
            );

            expect(await base.balanceOf(user)).to.eq.BN(bn(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(bn(50));
            expect(await token.balanceOf(user)).to.eq.BN(bn(1000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(bn(1000));
            expect(await mock.lastReceived()).to.eq.BN(bn(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction at half the limit price', async () => {
            await base.setBalance(user, bn(50));
            await token.setBalance(owner, bn(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            await auction.increaseTime(bn(6300));

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(bn(50));
            expect(offer[0]).to.eq.BN(bn(1475));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, bn(50), { from: user });
            expectEvent(
                await await auction.take(id, data, false, { from: user }),
                'Take',
                { _id: id, _taker: user, _selling: bn(1475), _requesting: bn(50) },
            );

            expect(await base.balanceOf(user)).to.eq.BN(bn(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(bn(50));
            expect(await token.balanceOf(user)).to.eq.BN(bn(1475));
            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(bn(525));
            expect(await mock.lastReceived()).to.eq.BN(bn(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction at the limit price', async () => {
            await base.setBalance(user, bn(50));
            await token.setBalance(owner, bn(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            await auction.increaseTime(bn(12600));

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(bn(50));
            expect(offer[0]).to.eq.BN(bn(2000));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, bn(50), { from: user });
            expectEvent(
                await await auction.take(id, data, false, { from: user }),
                'Take',
                { _id: id, _taker: user, _selling: bn(2000), _requesting: bn(50) },
            );

            expect(await base.balanceOf(user)).to.eq.BN(bn(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(bn(50));
            expect(await token.balanceOf(user)).to.eq.BN(bn(2000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(bn(0));
            expect(await mock.lastReceived()).to.eq.BN(bn(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction requesting half the base', async () => {
            await base.setBalance(user, bn(50));
            await token.setBalance(owner, bn(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            await auction.increaseTime(bn(55800));

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(bn(25));
            expect(offer[0]).to.eq.BN(bn(2000));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, bn(25), { from: user });
            expectEvent(
                await await auction.take(id, data, false, { from: user }),
                'Take',
                { _id: id, _taker: user, _selling: bn(2000), _requesting: bn(25) },
            );

            expect(await base.balanceOf(user)).to.eq.BN(bn(25));
            expect(await base.balanceOf(mock.address)).to.eq.BN(bn(25));
            expect(await token.balanceOf(user)).to.eq.BN(bn(2000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(bn(0));
            expect(await mock.lastReceived()).to.eq.BN(bn(25));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction requesting almost no base', async () => {
            await base.setBalance(user, bn(50));
            await token.setBalance(owner, bn(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.increaseTime(bn(99000).sub(bn(1)));

            await auction.transferOwnership(mock.address, { from: owner });

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(bn(1));
            expect(offer[0]).to.eq.BN(bn(2000));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, bn(1), { from: user });
            expectEvent(
                await await auction.take(id, data, false, { from: user }),
                'Take',
                { _id: id, _taker: user, _selling: bn(2000), _requesting: bn(1) },
            );

            expect(await base.balanceOf(user)).to.eq.BN(bn(49));
            expect(await base.balanceOf(mock.address)).to.eq.BN(bn(1));
            expect(await token.balanceOf(user)).to.eq.BN(bn(2000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(bn(0));
            expect(await mock.lastReceived()).to.eq.BN(bn(1));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction after restarting the auction', async () => {
            await base.setBalance(user, bn(50));
            await token.setBalance(owner, bn(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.increaseTime(bn(99000).add(bn(43200)));

            await auction.transferOwnership(mock.address, { from: owner });

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(bn(25));
            expect(offer[0]).to.eq.BN(bn(2000));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, bn(25), { from: user });
            expectEvent(
                await await auction.take(id, data, false, { from: user }),
                'Take',
                { _id: id, _taker: user, _selling: bn(2000), _requesting: bn(25) },
            );

            expect(await base.balanceOf(user)).to.eq.BN(bn(25));
            expect(await base.balanceOf(mock.address)).to.eq.BN(bn(25));
            expect(await token.balanceOf(user)).to.eq.BN(bn(2000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(bn(0));
            expect(await mock.lastReceived()).to.eq.BN(bn(25));
            expect(await mock.lastData()).to.be.equal(data);
        });
    });
    describe('Fail to take an auction', async () => {
        beforeEach(async () => {
            await token.setBalance(owner, bn(2000));

            mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.transferOwnership(mock.address, { from: owner });
        });
        it('Should fail to take a non-existent auction', async () => {
            try {
                await auction.take(bn(2), [], false);
            } catch (e) {
                return;
            }

            assert.fail();
        });
        it('Should fail to take a taken auction', async () => {
            await base.setBalance(anotherUser, bn(500));
            await base.approve(auction.address, bn(500), { from: anotherUser });

            await auction.take(id, [], false, { from: anotherUser });

            await expectRevert(
                auction.take(id, [], false),
                'auction: does not exists',
            );
        });
        it('Should fail to take auction without balance', async () => {
            await expectRevert(
                auction.take(id, [], false),
                'ERC20: transfer amount exceeds balance',
            );
        });
    });
    describe('Take and callback', () => {
        it('Should call taker callback', async () => {
            const callback = await TestAuctionCallback.new();
            await base.setBalance(callback.address, bn(50));
            await token.setBalance(owner, bn(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, bn(2000), { from: owner });

            id = await auction.getAuctionsLength();
            await auction.create(
                token.address,
                bn(950),
                bn(1000),
                bn(2000),
                bn(50),
                { from: owner },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const offer = await auction.offer(id);

            expect(offer[0]).to.eq.BN(bn(950));
            expect(offer[1]).to.eq.BN(bn(50));

            const data = web3.utils.randomHex(100);

            // Take auction with callback contract
            await callback.take(auction.address, id, data);

            expect(await callback.callbackCalled()).to.be.equal(true);

            expect(await base.balanceOf(callback.address)).to.eq.BN(bn(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(bn(50));
            expect(await token.balanceOf(callback.address)).to.eq.BN(bn(950));
            expect(await token.balanceOf(auction.address)).to.eq.BN(bn(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(bn(1050));
            expect(await mock.lastReceived()).to.eq.BN(bn(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
    });
    it('Should fail call taker callback on reentrancy', async () => {
        const callback = await TestAuctionCallback.new();
        await callback.setTryReentrancy(true);

        await base.setBalance(callback.address, bn(50));
        await token.setBalance(owner, bn(2000));

        const mock = await MockCollateralAuctionCallback.new();

        await token.approve(auction.address, bn(2000), { from: owner });

        id = await auction.getAuctionsLength();
        await auction.create(
            token.address,
            bn(950),
            bn(1000),
            bn(2000),
            bn(50),
            { from: owner },
        );

        expect(await token.balanceOf(auction.address)).to.eq.BN(bn(2000));

        await auction.transferOwnership(mock.address, { from: owner });

        const offer = await auction.offer(id);

        expect(offer[0]).to.eq.BN(bn(950));
        expect(offer[1]).to.eq.BN(bn(50));

        const data = web3.utils.randomHex(100);

        // Take auction with callback contract
        await expectRevert(
            callback.take(auction.address, id, data),
            'auction: error during callback onTake()',
        );

        expect(await callback.callbackCalled()).to.be.equal(false);
    });
});
