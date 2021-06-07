const MockCollateralAuctionCallback = artifacts.require('MockCollateralAuctionCallback');
const CollateralAuction = artifacts.require('TestCollateralAuction');
const TestToken = artifacts.require('TestToken');
const TestAuctionCallback = artifacts.require('TestAuctionCallback');

const {
    expectRevert,
} = require('@openzeppelin/test-helpers');

const { searchEvent } = require('../Helper.js');

const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function b (number) {
    return web3.utils.toBN(number);
}

contract('Test Collateral Dutch auction', function ([_, stub, owner, user, anotherUser, hacker]) {
    let base;
    let token;
    let auction;

    beforeEach(async () => {
        base = await TestToken.new({ from: owner });
        token = await TestToken.new({ from: owner });
        auction = await CollateralAuction.new(base.address, { from: owner });
    });

    describe('Create auctions', () => {
        it('Should create an auction', async () => {
            await token.setBalance(owner, b(2000));
            await token.approve(auction.address, b(2000), { from: owner });

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            const timestamp = (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp;
            const event = searchEvent(tx, 'CreatedAuction');

            // Validate event
            expect(event._id).to.eq.BN(b(1));
            expect(event._fromToken).to.be.equal(token.address);
            expect(event._startOffer).to.eq.BN(b(950));
            expect(event._refOffer).to.eq.BN(b(1000));
            expect(event._amount).to.eq.BN(b(50));
            expect(event._limit).to.eq.BN(b(2000));

            // Validate struct
            const entry = await auction.auctions(event._id);
            expect(entry.fromToken).to.be.equal(token.address);
            expect(entry.startTime).to.eq.BN(b(timestamp));
            expect(entry.limitDelta).to.eq.BN(b(12600));
            expect(entry.startOffer).to.eq.BN(b(950));
            expect(entry.amount).to.eq.BN(b(50));
            expect(entry.limit).to.eq.BN(b(2000));

            // Should increase auction count
            expect(await auction.getAuctionsLength()).to.eq.BN(b(2));
        });
    });
    describe('Fail to create an auction', () => {
        it('Should fail to create with reference below offer', async () => {
            await expectRevert(
                auction.create(
                    token.address,
                    b(1010),
                    b(1000),
                    b(2000),
                    b(50),
                    {
                        from: owner,
                    },
                ),
                'auction: offer should be below refence offer',
            );
        });
        it('Should fail to create with limit below reference', async () => {
            await expectRevert(
                auction.create(
                    token.address,
                    b(900),
                    b(2100),
                    b(2000),
                    b(50),
                    {
                        from: owner,
                    },
                ),
                'auction: reference offer should be below or equal to limit',
            );
        });
        it('Should fail to create with limit below offer', async () => {
            await expectRevert(
                auction.create(
                    token.address,
                    b(900),
                    b(950),
                    b(800),
                    b(50),
                    {
                        from: owner,
                    },
                ),
                'auction: reference offer should be below or equal to limit',
            );
        });
        it('Should fail to create if creator has not enough tokens', async () => {
            await expectRevert(
                auction.create(
                    token.address,
                    b(900),
                    b(950),
                    b(1800),
                    b(50),
                    {
                        from: owner,
                    },
                ),
                'ERC20: transfer amount exceeds balance',
            );
        });
        it('Should fail to create if creator did not approve the contract', async () => {
            await token.setBalance(owner, b(2000));

            await expectRevert(
                auction.create(
                    token.address,
                    b(900),
                    b(950),
                    b(1800),
                    b(50),
                    {
                        from: owner,
                    },
                ),
                'ERC20: transfer amount exceeds allowance',
            );
        });
    });
    describe('Take an auction', async () => {
        context('with same token', async () => {
            let id;
            let mock;
            beforeEach(async () => {
                await base.setBalance(owner, b(2000));

                mock = await MockCollateralAuctionCallback.new();

                await base.approve(auction.address, b(2000), { from: owner });
                await auction.setTime(b(Math.floor(new Date().getTime() / 1000)));

                const tx = await auction.create(
                    base.address,
                    b(950),
                    b(1000),
                    b(2000),
                    b(250),
                    {
                        from: owner,
                    },
                );

                expect(await base.balanceOf(auction.address)).to.eq.BN(b(2000));

                await auction.transferOwnership(mock.address, { from: owner });

                const event = searchEvent(tx, 'CreatedAuction');
                id = event._id;
            });
            it('Should take same token auction just created', async () => {
                await base.setBalance(anotherUser, b(0));
                await base.approve(auction.address, b(250), { from: anotherUser });

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(b(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(b(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(b(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(b(1750));
                expect(await mock.lastReceived()).to.eq.BN(b(250));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 10 minutes', async () => {
                await base.setBalance(anotherUser, b(0));
                await base.approve(auction.address, b(2000), { from: anotherUser });

                await auction.increaseTime(b(10).mul(b(60)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(b(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(b(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(b(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(b(1750));
                expect(await mock.lastReceived()).to.eq.BN(b(250));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 10 days', async () => {
                await base.setBalance(anotherUser, b(0));
                await base.approve(auction.address, b(2000), { from: anotherUser });

                await auction.increaseTime(b(10).mul(b(86400)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(b(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(b(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(b(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(b(1750));
                expect(await mock.lastReceived()).to.eq.BN(b(250));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 1 year', async () => {
                await base.setBalance(anotherUser, b(0));
                await base.approve(auction.address, b(2000), { from: anotherUser });

                await auction.increaseTime(b(365).mul(b(86400)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(b(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(b(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(b(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(b(1750));
                expect(await mock.lastReceived()).to.eq.BN(b(250));
                expect(await mock.lastData()).to.be.equal(data);
            });
        });
        context('with same token and _amount above _limit', async () => {
            let id;
            let mock;
            beforeEach(async () => {
                await base.setBalance(owner, b(2000));

                mock = await MockCollateralAuctionCallback.new();

                await base.approve(auction.address, b(2000), { from: owner });
                await auction.setTime(b(Math.floor(new Date().getTime() / 1000)));

                const tx = await auction.create(
                    base.address,
                    b(950),
                    b(1000),
                    b(2000),
                    b(4000),
                    {
                        from: owner,
                    },
                );

                expect(await base.balanceOf(auction.address)).to.eq.BN(b(2000));

                await auction.transferOwnership(mock.address, { from: owner });

                const event = searchEvent(tx, 'CreatedAuction');
                id = event._id;
            });
            it('Should take same token auction just created', async () => {
                await base.setBalance(anotherUser, b(0));
                await base.approve(auction.address, b(2000), { from: anotherUser });

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(b(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(b(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(b(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(b(0));
                expect(await mock.lastReceived()).to.eq.BN(b(2000));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 10 minutes', async () => {
                await base.setBalance(anotherUser, b(0));
                await base.approve(auction.address, b(2000), { from: anotherUser });

                await auction.increaseTime(b(10).mul(b(60)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(b(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(b(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(b(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(b(0));
                expect(await mock.lastReceived()).to.eq.BN(b(2000));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 10 days', async () => {
                await base.setBalance(anotherUser, b(0));
                await base.approve(auction.address, b(2000), { from: anotherUser });

                await auction.increaseTime(b(10).mul(b(86400)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(b(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(b(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(b(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(b(0));
                expect(await mock.lastReceived()).to.eq.BN(b(2000));
                expect(await mock.lastData()).to.be.equal(data);
            });
            it('Should take same token auction after 1 year', async () => {
                await base.setBalance(anotherUser, b(0));
                await base.approve(auction.address, b(2000), { from: anotherUser });

                await auction.increaseTime(b(365).mul(b(86400)));

                const data = web3.utils.randomHex(100);
                await auction.take(id, data, false, { from: anotherUser });

                expect(await base.balanceOf(mock.address)).to.eq.BN(b(2000));
                expect(await base.balanceOf(auction.address)).to.eq.BN(b(0));
                expect(await base.balanceOf(anotherUser)).to.eq.BN(b(0));

                expect(await mock.lastId()).to.eq.BN(id);
                expect(await mock.lastLeftover()).to.eq.BN(b(0));
                expect(await mock.lastReceived()).to.eq.BN(b(2000));
                expect(await mock.lastData()).to.be.equal(data);
            });
        });
        it('Should take an auction just created', async () => {
            await base.setBalance(user, b(50));
            await token.setBalance(owner, b(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            const id = event._id;

            const offer = await auction.offer(id);

            expect(offer[0]).to.eq.BN(b(950));
            expect(offer[1]).to.eq.BN(b(50));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, b(50), { from: user });
            const takeTx = await auction.take(id, data, false, { from: user });

            expect(await base.balanceOf(user)).to.eq.BN(b(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(b(50));
            expect(await token.balanceOf(user)).to.eq.BN(b(950));
            expect(await token.balanceOf(auction.address)).to.eq.BN(b(0));

            const takeEvent = searchEvent(takeTx, 'Take');
            expect(takeEvent._id).to.eq.BN(id);
            expect(takeEvent._taker).to.be.equal(user);
            expect(takeEvent._selling).to.eq.BN(b(950));
            expect(takeEvent._requesting).to.eq.BN(b(50));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(b(1050));
            expect(await mock.lastReceived()).to.eq.BN(b(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction at the reference price', async () => {
            await base.setBalance(user, b(50));
            await token.setBalance(owner, b(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            await auction.setTime(b(Math.floor(new Date().getTime() / 1000)));

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.increaseTime(b(10).mul(b(60)));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            const id = event._id;

            const offer = await auction.offer(id);

            expect(offer[0]).to.eq.BN(b(1000));
            expect(offer[1]).to.eq.BN(b(50));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, b(50), { from: user });
            const takeTx = await auction.take(id, data, false, { from: user });

            expect(await base.balanceOf(user)).to.eq.BN(b(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(b(50));
            expect(await token.balanceOf(user)).to.eq.BN(b(1000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(b(0));

            const takeEvent = searchEvent(takeTx, 'Take');
            expect(takeEvent._id).to.eq.BN(id);
            expect(takeEvent._taker).to.be.equal(user);
            expect(takeEvent._selling).to.eq.BN(b(1000));
            expect(takeEvent._requesting).to.eq.BN(b(50));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(b(1000));
            expect(await mock.lastReceived()).to.eq.BN(b(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction at half the limit price', async () => {
            await base.setBalance(user, b(50));
            await token.setBalance(owner, b(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            await auction.setTime(b(Math.floor(new Date().getTime() / 1000)));

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            await auction.increaseTime(b(6300));

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            const id = event._id;

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(b(50));
            expect(offer[0]).to.eq.BN(b(1475));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, b(50), { from: user });
            const takeTx = await auction.take(id, data, false, { from: user });

            expect(await base.balanceOf(user)).to.eq.BN(b(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(b(50));
            expect(await token.balanceOf(user)).to.eq.BN(b(1475));
            expect(await token.balanceOf(auction.address)).to.eq.BN(b(0));

            const takeEvent = searchEvent(takeTx, 'Take');
            expect(takeEvent._id).to.eq.BN(id);
            expect(takeEvent._taker).to.be.equal(user);
            expect(takeEvent._selling).to.eq.BN(b(1475));
            expect(takeEvent._requesting).to.eq.BN(b(50));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(b(525));
            expect(await mock.lastReceived()).to.eq.BN(b(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction at the limit price', async () => {
            await base.setBalance(user, b(50));
            await token.setBalance(owner, b(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            await auction.setTime(b(Math.floor(new Date().getTime() / 1000)));

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            await auction.increaseTime(b(12600));

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            const id = event._id;

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(b(50));
            expect(offer[0]).to.eq.BN(b(2000));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, b(50), { from: user });
            const takeTx = await auction.take(id, data, false, { from: user });

            expect(await base.balanceOf(user)).to.eq.BN(b(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(b(50));
            expect(await token.balanceOf(user)).to.eq.BN(b(2000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(b(0));

            const takeEvent = searchEvent(takeTx, 'Take');
            expect(takeEvent._id).to.eq.BN(id);
            expect(takeEvent._taker).to.be.equal(user);
            expect(takeEvent._selling).to.eq.BN(b(2000));
            expect(takeEvent._requesting).to.eq.BN(b(50));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(b(0));
            expect(await mock.lastReceived()).to.eq.BN(b(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction requesting half the base', async () => {
            await base.setBalance(user, b(50));
            await token.setBalance(owner, b(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            await auction.setTime(b(Math.floor(new Date().getTime() / 1000)));

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            await auction.increaseTime(b(55800));

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            const id = event._id;

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(b(25));
            expect(offer[0]).to.eq.BN(b(2000));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, b(25), { from: user });
            const takeTx = await auction.take(id, data, false, { from: user });

            expect(await base.balanceOf(user)).to.eq.BN(b(25));
            expect(await base.balanceOf(mock.address)).to.eq.BN(b(25));
            expect(await token.balanceOf(user)).to.eq.BN(b(2000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(b(0));

            const takeEvent = searchEvent(takeTx, 'Take');
            expect(takeEvent._id).to.eq.BN(id);
            expect(takeEvent._taker).to.be.equal(user);
            expect(takeEvent._selling).to.eq.BN(b(2000));
            expect(takeEvent._requesting).to.eq.BN(b(25));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(b(0));
            expect(await mock.lastReceived()).to.eq.BN(b(25));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction requesting almost no base', async () => {
            await base.setBalance(user, b(50));
            await token.setBalance(owner, b(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            await auction.setTime(b(Math.floor(new Date().getTime() / 1000)));

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.increaseTime(b(99000).sub(b(1)));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            const id = event._id;

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(b(1));
            expect(offer[0]).to.eq.BN(b(2000));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, b(1), { from: user });
            const takeTx = await auction.take(id, data, false, { from: user });

            expect(await base.balanceOf(user)).to.eq.BN(b(49));
            expect(await base.balanceOf(mock.address)).to.eq.BN(b(1));
            expect(await token.balanceOf(user)).to.eq.BN(b(2000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(b(0));

            const takeEvent = searchEvent(takeTx, 'Take');
            expect(takeEvent._id).to.eq.BN(id);
            expect(takeEvent._taker).to.be.equal(user);
            expect(takeEvent._selling).to.eq.BN(b(2000));
            expect(takeEvent._requesting).to.eq.BN(b(1));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(b(0));
            expect(await mock.lastReceived()).to.eq.BN(b(1));
            expect(await mock.lastData()).to.be.equal(data);
        });
        it('Should take an auction after restarting the auction', async () => {
            await base.setBalance(user, b(50));
            await token.setBalance(owner, b(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            await auction.setTime(b(Math.floor(new Date().getTime() / 1000)));

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.increaseTime(b(99000).add(b(43200)));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            const id = event._id;

            const offer = await auction.offer(id);

            expect(offer[1]).to.eq.BN(b(25));
            expect(offer[0]).to.eq.BN(b(2000));

            const data = web3.utils.randomHex(100);

            await base.approve(auction.address, b(25), { from: user });
            const takeTx = await auction.take(id, data, false, { from: user });

            expect(await base.balanceOf(user)).to.eq.BN(b(25));
            expect(await base.balanceOf(mock.address)).to.eq.BN(b(25));
            expect(await token.balanceOf(user)).to.eq.BN(b(2000));
            expect(await token.balanceOf(auction.address)).to.eq.BN(b(0));

            const takeEvent = searchEvent(takeTx, 'Take');
            expect(takeEvent._id).to.eq.BN(id);
            expect(takeEvent._taker).to.be.equal(user);
            expect(takeEvent._selling).to.eq.BN(b(2000));
            expect(takeEvent._requesting).to.eq.BN(b(25));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(b(0));
            expect(await mock.lastReceived()).to.eq.BN(b(25));
            expect(await mock.lastData()).to.be.equal(data);
        });
    });
    describe('Fail to take an auction', async () => {
        let id;
        let mock;
        beforeEach(async () => {
            await token.setBalance(owner, b(2000));

            mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            id = event._id;
        });
        it('Should fail to take a non-existent auction', async () => {
            try {
                await auction.take(b(2), [], false);
            } catch (e) {
                return;
            }

            assert.fail();
        });
        it('Should fail to take a taken auction', async () => {
            await base.setBalance(anotherUser, b(500));
            await base.approve(auction.address, b(500), { from: anotherUser });

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
            await base.setBalance(callback.address, b(50));
            await token.setBalance(owner, b(2000));

            const mock = await MockCollateralAuctionCallback.new();

            await token.approve(auction.address, b(2000), { from: owner });

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                },
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await auction.transferOwnership(mock.address, { from: owner });

            const event = searchEvent(tx, 'CreatedAuction');
            const id = event._id;

            const offer = await auction.offer(id);

            expect(offer[0]).to.eq.BN(b(950));
            expect(offer[1]).to.eq.BN(b(50));

            const data = web3.utils.randomHex(100);

            // Take auction with callback contract
            await callback.take(auction.address, id, data);

            expect(await callback.callbackCalled()).to.be.equal(true);

            expect(await base.balanceOf(callback.address)).to.eq.BN(b(0));
            expect(await base.balanceOf(mock.address)).to.eq.BN(b(50));
            expect(await token.balanceOf(callback.address)).to.eq.BN(b(950));
            expect(await token.balanceOf(auction.address)).to.eq.BN(b(0));

            expect(await mock.lastId()).to.eq.BN(id);
            expect(await mock.lastLeftover()).to.eq.BN(b(1050));
            expect(await mock.lastReceived()).to.eq.BN(b(50));
            expect(await mock.lastData()).to.be.equal(data);
        });
    });
    it('Should fail call taker callback on reentrancy', async () => {
        const callback = await TestAuctionCallback.new();
        await callback.setTryReentrancy(true);

        await base.setBalance(callback.address, b(50));
        await token.setBalance(owner, b(2000));

        const mock = await MockCollateralAuctionCallback.new();

        await token.approve(auction.address, b(2000), { from: owner });

        const tx = await auction.create(
            token.address,
            b(950),
            b(1000),
            b(2000),
            b(50),
            {
                from: owner,
            },
        );

        expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

        await auction.transferOwnership(mock.address, { from: owner });

        const event = searchEvent(tx, 'CreatedAuction');
        const id = event._id;

        const offer = await auction.offer(id);

        expect(offer[0]).to.eq.BN(b(950));
        expect(offer[1]).to.eq.BN(b(50));

        const data = web3.utils.randomHex(100);

        // Take auction with callback contract
        await expectRevert(
            () => callback.take(auction.address, id, data),
            'auction: error during callback onTake()',
        );

        expect(await callback.callbackCalled()).to.be.equal(false);
    });
});
