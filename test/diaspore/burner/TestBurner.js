const Burner = artifacts.require('Burner');
const TestTokenBurner = artifacts.require('TestTokenBurner');
const TestRateOracle = artifacts.require('TestRateOracle');

const {
    bn,
    tryCatchRevert,
    toEvents,
    expect,
    increaseTime,
    address0x,
    getTxTime,
} = require('../../Helper.js');

function toWei (stringNumber) {
    return bn(stringNumber).mul(bn(10).pow(bn(18)));
}

function toDecimals (stringNumber, decimals) {
    return bn(stringNumber).mul(bn(10).pow(bn(decimals)));
}

function getPercentage (rate, percentage) {
    return bn(rate).mul(bn(percentage)).div(bn(100));
}

contract('Burner Contract', function (accounts) {
    const owner = accounts[0];
    const bidder1 = accounts[1];
    const bidder2 = accounts[2];
    const bidder3 = accounts[3];

    let burnT;
    let soldT;
    let burner;
    let oracle;

    const WEI = bn(web3.utils.toWei('1'));
    const tokensBase = WEI.mul(WEI);

    async function snap (auctionId, newBidder) {
        const auction = await burner.bids(auctionId);
        return {
            id: auctionId,
            burnTBid: auction.burnTBid,
            soldTAmount: auction.soldTAmount,
            bidder: auction.bidder,
            expirationTime: auction.expirationTime,
            end: auction.end,
            burnerSoldTBalance: await soldT.balanceOf.call(burner.address),
            burnerBurnTBalance: await burnT.balanceOf.call(burner.address),
            bidderSoldTBalance: await soldT.balanceOf.call(auction.bidder),
            bidderBurnTBalance: await burnT.balanceOf.call(auction.bidder),
            newbidderSoldTBalance: await soldT.balanceOf.call(newBidder),
            newbidderBurnTBalance: await burnT.balanceOf.call(newBidder),
        };
    }

    async function getBurnTEquivalent (soldTAmount) {
        const rate = await oracle.RCNequivalent();
        const burnTEquivalent = bn(soldTAmount).mul(tokensBase).div(rate);
        return burnTEquivalent;
    }

    async function startNewAuction (soldTAmount, discountPercentage) {
        soldT.transfer(burner.address, soldTAmount, { from: owner });

        const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
        const burnTBid = getPercentage(burnTEquivalent, discountPercentage);
        return { burnTBid, soldTAmount };
    }

    async function startAuction (burnTBid, soldTAmount) {
        const start = await toEvents(
            burner.startAuction(
                burnTBid,
                soldTAmount,
                { from: owner }
            ),
            'StartedAuction'
        );
        const snapAfter = await snap(start._id, owner);

        expect(snapAfter.burnTBid).to.eq.BN(burnTBid);
        expect(snapAfter.soldTAmount).to.eq.BN(soldTAmount);
        expect(snapAfter.bidder).to.eq.BN(owner);
        expect(snapAfter.expirationTime).to.eq.BN(0);
        return start._id;
    }

    async function offer (id, newBid, newbidder) {
        const snapBefore = await snap(id, newbidder);

        const tx = await burner.offer(id, newBid, { from: newbidder });
        const txNow = await getTxTime(tx);

        const snapAfter = await snap(id, newbidder);

        expect(snapAfter.burnTBid).to.eq.BN(newBid);
        expect(snapAfter.bidder).to.eq.BN(newbidder);
        assert(snapAfter.burnTBid > snapBefore.burnTBid, 'Burner/bid-not-higher');
        assert(snapAfter.burnTBid.mul(WEI) >= (await burner.bidIncrement()).mul(snapBefore.burnTBid), 'Burner/insufficient-increase');

        assert(snapAfter.end > txNow, 'Auction ended');
        assert(snapAfter.expirationTime > txNow || snapAfter.expirationTime !== 0, 'Auction expired');
        expect(snapAfter.expirationTime.sub(bn(txNow))).to.eq.BN(10800); // 10800 s = 3 hours

        // Burner burnT balance should add new bid difference
        expect(snapAfter.burnerBurnTBalance).to.eq.BN(snapBefore.burnerBurnTBalance.add(newBid.sub(snapBefore.burnTBid)));

        // Old bidder chack balance
        expect(snapBefore.bidderBurnTBalance).to.eq.BN((await burnT.balanceOf(snapBefore.bidder)).sub(snapBefore.burnTBid));

        // Check after newBidder Balance
        expect(snapAfter.bidderBurnTBalance).to.eq.BN((snapBefore.newbidderBurnTBalance).sub(snapAfter.burnTBid));
    }

    async function claim (id) {
        const snapBefore = await snap(id, address0x);
        await burner.claim(id, { from: owner });
        const snapAfter = await snap(id, address0x);

        // Check after bidder soldTAmount
        expect(await soldT.balanceOf.call(snapBefore.bidder)).to.eq.BN((snapBefore.bidderSoldTBalance).add(snapBefore.soldTAmount));

        // Check after burner soldTAmount
        expect(snapAfter.burnerSoldTBalance).to.eq.BN((snapBefore.burnerSoldTBalance).sub(snapBefore.soldTAmount));

        // Check after burner burnTBalance
        expect(snapAfter.burnerBurnTBalance).to.eq.BN((snapBefore.burnerBurnTBalance).sub(snapBefore.burnTBid));

        // Check after address0x burnt balance
        expect(snapAfter.newbidderBurnTBalance).to.eq.BN((snapBefore.newbidderBurnTBalance).add(snapBefore.burnTBid));

        // check bid deleted
        assert(snapAfter.bidder === address0x);
    }

    before('Create Burner and TestTokens', async function () {
        burnT = await TestTokenBurner.new('BURNT', 'Burn token', '18', { from: owner });
        soldT = await TestTokenBurner.new('SOLDT', 'Sold Token', '6', { from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        await oracle.setEquivalent(bn('86949911832000000000000'));
        await oracle.setToken(soldT.address, { from: owner });

        burner = await Burner.new(burnT.address, soldT.address, oracle.address, { from: owner });
        await soldT.setBalance(owner, toDecimals('10000000', '6'));

        // Set balances of burnT for bidders
        await burnT.setBalance(owner, toWei(bn(10000000)));
        await burnT.setBalance(bidder1, toWei(bn(10000000)));
        await burnT.setBalance(bidder2, toWei(bn(10000000)));
        await burnT.setBalance(bidder3, toWei(bn(10000000)));

        // Approve BURNER contract
        await burnT.approve(burner.address, toWei(bn(10000000)), { from: owner });
        await burnT.approve(burner.address, toWei(bn(10000000)), { from: bidder1 });
        await burnT.approve(burner.address, toWei(bn(10000000)), { from: bidder2 });
        await burnT.approve(burner.address, toWei(bn(10000000)), { from: bidder3 });
    });

    describe('Test startAuction function', async function () {
        it('Revert - Try start a new auction setting soldT too low', async function () {
            const burnTBid = toWei('90');
            const soldTAmount = toDecimals('90', '6');
            await tryCatchRevert(
                () => burner.startAuction(
                    burnTBid,
                    soldTAmount,
                    { from: owner }
                ),
                'Burner/ _soldTAmount too low'
            );
        });
        it('Revert - Try start a new auction without enought soldT balance', async function () {
            const burnTBid = toWei('90');
            const soldTAmount = toDecimals('100', '6');
            await tryCatchRevert(
                () => burner.startAuction(
                    burnTBid,
                    soldTAmount,
                    { from: owner }
                ),
                'Burner/not enought soldT balance to start auction'
            );
        });
        it('Revert - Auction Bid amount should be less than market value', async function () {
            const soldTAmount = toDecimals('100', '6');
            soldT.transfer(burner.address, soldTAmount, { from: owner });
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const initialBid = getPercentage(burnTEquivalent, 105);

            await tryCatchRevert(
                () => burner.startAuction(
                    initialBid,
                    soldTAmount,
                    { from: owner }
                ),
                'Burner/Initial burnTBid should be less than market value'
            );
        });
        it('Try start a new auction', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            await startAuction(burnTBid, soldTAmount);
        });
    });

    describe('Test Offer function', async function () {
        it('Revert - Try to bid on a expired auction', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);

            const newBid = getPercentage(toWei(burnTBid), 105);
            await increaseTime((2 * 24 * 60 * 60) + 1);

            await tryCatchRevert(
                () => burner.offer(
                    id,
                    newBid,
                    { from: bidder1 }
                ),
                'Burner/already-finished-end'
            );
        });
        it('Revert - try new bid when bid already expired', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);
            await increaseTime((3 * 60 * 60) + 1);

            const newBid2 = getPercentage(newBid, 105);
            await tryCatchRevert(
                () => burner.offer(
                    id,
                    newBid2,
                    { from: bidder2 }
                ),
                'Burner/already-finished-bid'
            );
        });
        it('Revert - bidder not set', async function () {
            await tryCatchRevert(
                () => burner.offer(
                    address0x,
                    bn(1),
                    { from: bidder1 }
                ),
                'Burner/bidder-not-set'
            );
        });
        it('Revert - try new bid not higher', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);

            await tryCatchRevert(
                () => burner.offer(
                    id,
                    newBid,
                    { from: bidder2 }
                ),
                'Burner/bid-not-higher'
            );
        });
        it('Revert - try new bid with insufficient increase', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);
            const newBid2 = getPercentage(newBid, 101);

            await tryCatchRevert(
                () => burner.offer(
                    id,
                    newBid2,
                    { from: bidder2 }
                ),
                'Burner/insufficient-increase'
            );
        });
        it('try new bid', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);
        });
        it('try new bid 1 , then better bid 2 ', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);

            increaseTime(60 * 10); // 10 minutes

            const newBid2 = getPercentage(newBid, 106);
            await offer(id, newBid2, bidder2);
        });
    });
    describe('Test claim function', async function () {
        it('bidder should claim its winner bid', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);
            increaseTime(10801); // more than 3hours minutes
            await claim(id);
        });
        it('cannnot claim, auction not finished yet', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);
            increaseTime(100); // more than 3hours minutes

            await tryCatchRevert(
                () => burner.claim(
                    id,
                    { from: bidder1 }
                ),
                'Burner/not-finished'
            );
        });
    });
    describe('Test restartAuction function', async function () {
        it('Restart an auction when ended', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            increaseTime(60 * 60 * 24 * 2 + 1); // more than 2 days
            const tx = await burner.restartAuction(id);
            const txNow = await getTxTime(tx);
            const auction = await burner.bids(id);
            assert(auction.end, bn(txNow).add(await burner.auctionDuration()));
        });
        it('Cannot Restart an auction that it is not over ', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            await tryCatchRevert(
                () => burner.restartAuction(
                    id,
                    { from: owner }
                ),
                'Burner/not-finished'
            );
        });
        it('Cannot Restart an auction that has already a new bid ', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);
            increaseTime(60 * 60 * 24 * 2 + 1); // more than 2 days
            await tryCatchRevert(
                () => burner.restartAuction(
                    id,
                    { from: owner }
                ),
                'Burner/bid-already-placed'
            );
        });
    });
    describe('Test setters', async function () {
        it('sets bid increment', async function () {
            const defaultBidIncrement = await burner.bidIncrement.call();
            const bidIncrement = getPercentage(toWei(1), 104);
            await burner.setBidIncrement(bidIncrement);
            const newBidIncrement = await burner.bidIncrement.call();
            expect(bidIncrement).to.eq.BN(newBidIncrement);
            await burner.setBidIncrement(defaultBidIncrement);
        });
        it('sets bid duration', async function () {
            const dafaultBidDuration = await burner.bidDuration.call();
            const bidDuration = 60 * 60 * 2;
            await burner.setBidDuration(bidDuration);
            const newBidDuration = await burner.bidDuration.call();
            expect(bidDuration).to.eq.BN(newBidDuration);
            await burner.setBidDuration(dafaultBidDuration);
        });
        it('sets auction duration', async function () {
            const defaultAuctionDuration = await burner.auctionDuration.call();
            const auctionDuration = 60 * 60 * 24;
            await burner.setAuctionDuration(auctionDuration);
            const newAuctionDuration = await burner.auctionDuration.call();
            expect(auctionDuration).to.eq.BN(newAuctionDuration);
            await burner.setAuctionDuration(defaultAuctionDuration);
        });
        it('sets minimum soldT amount', async function () {
            const defaultMinimumSoldTAmount = await burner.minimumSoldTAmount.call();
            const minimumSoldTAmount = toWei(99);
            await burner.setMinimumSoldTAmount(minimumSoldTAmount);
            const newMinimumSoldTAmount = await burner.minimumSoldTAmount.call();
            expect(minimumSoldTAmount).to.eq.BN(newMinimumSoldTAmount);
            await burner.setMinimumSoldTAmount(defaultMinimumSoldTAmount);
        });
    });
    describe('Test authorazation', async function () {
        it('should not be able to start a new auction if user is not authorize', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            await tryCatchRevert(
                () => burner.startAuction(
                    burnTBid,
                    soldTAmount,
                    { from: bidder1 }
                ),
                'Auth/not-authorized'
            );
        });
        it('should authorize a new user', async function () {
            await burner.rely(bidder1, { from: owner });
            assert(await burner.authorized(bidder1), 1);
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            await burner.startAuction(
                burnTBid,
                soldTAmount,
                { from: bidder1 }
            );
        });
        it('should revoke authorization for a user', async function () {
            await burner.deny(bidder1, { from: owner });
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            await tryCatchRevert(
                () => burner.startAuction(
                    burnTBid,
                    soldTAmount,
                    { from: bidder1 }
                ),
                'Auth/not-authorized'
            );
        });
    });
    describe('Test BURNER not live', async function () {
        it('try reclaim when burner still live', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            const burnTEquivalent = await getBurnTEquivalent(soldTAmount);
            const newBid = getPercentage(burnTEquivalent, 105);
            await offer(id, newBid, bidder1);

            await tryCatchRevert(
                () => burner.reclaim(
                    id,
                    { from: bidder1 }
                ),
                'Burner/still-live'
            );
        });
        it('Recover soldT from burner contract and reclaim bid', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            const id = await startAuction(burnTBid, soldTAmount);
            // test recover
            const burnerSoldTBefore = await soldT.balanceOf(burner.address);
            const ownerSoldTBefore = await soldT.balanceOf(owner);
            await burner.recover(burnerSoldTBefore);
            const ownerSoldTAfter = await soldT.balanceOf(owner);
            const burnerSoldTAfter = await soldT.balanceOf(burner.address);
            expect(burnerSoldTAfter).to.eq.BN(0);
            expect(ownerSoldTAfter).to.eq.BN(ownerSoldTBefore.add(burnerSoldTBefore));
            assert(await burner.live(), 0);

            // Test reclaim
            const ownerBurnTBefore = await burnT.balanceOf(owner);
            await burner.reclaim(id);
            const ownerBurnTAfter = await burnT.balanceOf(owner);
            expect(ownerBurnTAfter).to.eq.BN(ownerBurnTBefore.add(burnTBid));
        });
        it('cannot start auction , offer or claim if burner not live', async function () {
            const { burnTBid, soldTAmount } = await startNewAuction(toDecimals('100', '6'), 90);
            await tryCatchRevert(
                () => burner.startAuction(
                    burnTBid,
                    soldTAmount,
                    { from: owner }
                ),
                'Burner/not-live'
            );
            await tryCatchRevert(
                () => burner.offer(
                    0,
                    burnTBid,
                    { from: bidder1 }
                ),
                'Burner/not-live'
            );
            await tryCatchRevert(
                () => burner.claim(
                    0,
                    { from: bidder1 }
                ),
                'Burner/not-live'
            );
        });
    });
});
