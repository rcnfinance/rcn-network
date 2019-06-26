const RcnBurner = artifacts.require('RcnBurner');
const TestToken = artifacts.require('TestToken');
const TestConverter = artifacts.require('TestConverter');

const Helper = require('../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn (number) {
    return new BN(number);
}

const WEI = bn('10').pow(bn('18'));

contract('Test RcnBurner', function (accounts) {
    const owner = accounts[1];
    const notOwner = accounts[2];
    const burner = accounts[3];

    let rcn;
    let auxToken;
    let rcnBurner;
    let converter;

    before('Create contracts', async function () {
        converter = await TestConverter.new({ from: owner });
        rcn = await TestToken.new({ from: owner });
        auxToken = await TestToken.new({ from: owner });

        rcnBurner = await RcnBurner.new({ from: owner });
        await rcnBurner.setConverter(converter.address, { from: owner });
        await rcnBurner.setToken(rcn.address, { from: owner });
    });
    it('Set new converter', async function () {
        const SetConverter = await Helper.toEvents(
            rcnBurner.setConverter(
                Helper.address0x,
                { from: owner }
            ), 'SetConverter'
        );

        assert.equal(SetConverter._converter, Helper.address0x);
        assert.equal(await rcnBurner.converter(), Helper.address0x);

        await rcnBurner.setConverter(converter.address, { from: owner });
    });
    it('Set new token', async function () {
        const SetToken = await Helper.toEvents(
            rcnBurner.setToken(
                Helper.address0x,
                { from: owner }
            ), 'SetToken'
        );

        assert.equal(SetToken._token, Helper.address0x);
        assert.equal(await rcnBurner.token(), Helper.address0x);

        await rcnBurner.setToken(rcn.address, { from: owner });
    });
    describe('Functions onlyOwner', function () {
        it('Try set token without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => rcnBurner.setToken(
                    notOwner,
                    { from: notOwner }
                ), 'The owner should be the sender'
            );
        });
        it('Try set converter without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => rcnBurner.setConverter(
                    notOwner,
                    { from: notOwner }
                ), 'The owner should be the sender'
            );
        });
    });
    describe('Functions burn, _convert and _burn', function () {
        it('Should burn token', async function () {
            const burnAmount = bn('1');

            await rcn.setBalance(rcnBurner.address, burnAmount);

            let prevBal = await rcn.balanceOf(Helper.address0x);

            const Burn = await Helper.toEvents(
                rcnBurner.burn(
                    rcn.address,
                    { from: burner }
                ), 'Burn'
            );

            expect(Burn._amount).to.eq.BN(burnAmount);
            expect(await rcn.balanceOf(rcnBurner.address)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(burner)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(Helper.address0x)).to.eq.BN(prevBal.add(burnAmount));

            prevBal = await rcn.balanceOf(Helper.address0x);

            // Burn with 0 balance
            const Burn0 = await Helper.toEvents(
                rcnBurner.burn(
                    rcn.address,
                    { from: burner }
                ), 'Burn'
            );

            expect(Burn0._amount).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(rcnBurner.address)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(burner)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(Helper.address0x)).to.eq.BN(prevBal);
        });
        it('Should convert and burn token', async function () {
            await converter.setRate(auxToken.address, rcn.address, WEI.mul(bn(2)));

            const fromConvertAmount = bn('1');
            const burnAmount = await converter.getReturn(auxToken.address, rcn.address, fromConvertAmount);

            await auxToken.setBalance(rcnBurner.address, fromConvertAmount);
            await rcn.setBalance(converter.address, burnAmount);

            const prevBal = await rcn.balanceOf(Helper.address0x);

            const events = await Helper.toEvents(
                rcnBurner.burn(
                    auxToken.address,
                    { from: burner }
                ),
                'Burn',
                'BuyToken'
            );

            const Burn = events[0];
            expect(Burn._amount).to.eq.BN(burnAmount);

            const BuyToken = events[1];
            expect(BuyToken._sold).to.eq.BN(fromConvertAmount);
            expect(BuyToken._bought).to.eq.BN(burnAmount);

            expect(await rcn.balanceOf(rcnBurner.address)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(burner)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(Helper.address0x)).to.eq.BN(prevBal.add(burnAmount));
        });
    });
    describe('Function batchBurn', function () {
        it('Should burn a batch of token', async function () {
            // TODO
        });
    });
});
