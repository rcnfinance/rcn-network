const MockCollateralAuctionCallback = artifacts.require('MockCollateralAuctionCallback');
const CollateralAuction = artifacts.require('CollateralAuction');
const TestToken = artifacts.require('TestToken');

const { tryCatchRevert, searchEvent, increaseTime } = require('../../Helper.js');

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
                }
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            const timestamp = (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp;
            const event = searchEvent(tx, 'CreatedAuction');

            // Validate event
            expect(event._id).to.eq.BN(b(0));
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
        });
    });
    describe('Fail to create an auction', () => {
        it('Should fail to create with reference below offer', async () => {
            await tryCatchRevert(
                auction.create(
                    token.address,
                    b(1010),
                    b(1000),
                    b(2000),
                    b(50),
                    {
                        from: owner,
                    }
                ),
                'auction: offer should be below refence offer'
            );
        });
        it('Should fail to create with limit below reference', async () => {
            await tryCatchRevert(
                auction.create(
                    token.address,
                    b(900),
                    b(2100),
                    b(2000),
                    b(50),
                    {
                        from: owner,
                    }
                ),
                'auction: reference offer should be below limit'
            );
        });
        it('Should fail to create with limit below offer', async () => {
            await tryCatchRevert(
                auction.create(
                    token.address,
                    b(900),
                    b(950),
                    b(800),
                    b(50),
                    {
                        from: owner,
                    }
                ),
                'auction: reference offer should be below limit'
            );
        });
        it('Should fail to create if creator has not enough tokens', async () => {
            await tryCatchRevert(
                auction.create(
                    token.address,
                    b(900),
                    b(950),
                    b(1800),
                    b(50),
                    {
                        from: owner,
                    }
                ),
                'auction: error pulling _fromToken'
            );
        });
        it('Should fail to create if creator did not approve the contract', async () => {
            await token.setBalance(owner, b(2000));

            await tryCatchRevert(
                auction.create(
                    token.address,
                    b(900),
                    b(950),
                    b(1800),
                    b(50),
                    {
                        from: owner,
                    }
                ),
                'auction: error pulling _fromToken'
            );
        });
    });
    describe('Take an auction', async () => {
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
                }
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

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                }
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await increaseTime(b(10).mul(b(60)));

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

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                }
            );

            await increaseTime(b(6300));

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

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                }
            );

            await increaseTime(b(12600));

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

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                }
            );

            await increaseTime(b(55800));

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

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                }
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await increaseTime(b(99000).sub(b(1)));

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

            const tx = await auction.create(
                token.address,
                b(950),
                b(1000),
                b(2000),
                b(50),
                {
                    from: owner,
                }
            );

            expect(await token.balanceOf(auction.address)).to.eq.BN(b(2000));

            await increaseTime(b(99000).add(b(43200)));

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
});
