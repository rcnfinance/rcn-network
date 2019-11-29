
const TestRateOracle = artifacts.require('TestRateOracle');
const TestCollateralLib = artifacts.require('TestCollateralLib');
const TestToken = artifacts.require('TestToken');

const { tryCatchRevert, address0x } = require('../../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function b (number) {
    return web3.utils.toBN(number);
}

function ratio (num) {
    return b(num).mul(b(2).pow(b(32))).div(b(100));
}

function unratio (enc) {
    return b(enc).mul(b(100)).div(b(2).pow(b(32)));
}

contract('Test Collateral lib', function ([_]) {
    it('Should create a collateral entry', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);
        const oracle = await TestRateOracle.new();

        await lib.create(
            oracle.address,
            token.address,
            debtId,
            b(1000),
            ratio(110),
            ratio(150)
        );

        const entry = await lib.entry();
        expect(entry.debtId).to.be.equal(debtId);
        expect(entry.amount).to.eq.BN(b(1000));
        expect(entry.oracle).to.be.equal(oracle.address);
        expect(entry.token).to.be.equal(token.address);
        expect(entry.liquidationRatio).to.eq.BN(ratio(110));
        expect(entry.balanceRatio).to.eq.BN(ratio(150));
    });
    it('Should fail create collateral entry with liquidation ratio below balance ratio', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);

        await tryCatchRevert(
            lib.create(
                address0x,
                token.address,
                debtId,
                b(1000),
                ratio(110),
                ratio(105)
            ),
            'collateral-lib: _liquidationRatio should be below _balanceRatio'
        );
    });
    it('Should fail create collateral entry with liquidation ratio equal to balance ratio', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);

        await tryCatchRevert(
            lib.create(
                address0x,
                token.address,
                debtId,
                b(1000),
                ratio(110),
                ratio(110)
            ),
            'collateral-lib: _liquidationRatio should be below _balanceRatio'
        );
    });
    it('Should fail create collateral entry with liquidation below 100', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);

        await tryCatchRevert(
            lib.create(
                address0x,
                token.address,
                debtId,
                b(1000),
                ratio(99),
                ratio(110)
            ),
            'collateral-lib: _liquidationRatio should be above one'
        );
    });
    it('Should fail create collateral entry with no token', async () => {
        const lib = await TestCollateralLib.new();
        const debtId = web3.utils.randomHex(32);

        await tryCatchRevert(
            lib.create(
                address0x,
                address0x,
                debtId,
                b(1000),
                ratio(105),
                ratio(110)
            ),
            'collateral-lib: _token can\'t be address zero'
        );
    });
    it('Should convert amount without RateOracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);

        await lib.create(
            address0x,
            token.address,
            debtId,
            b(1000),
            ratio(110),
            ratio(150)
        );

        expect(await lib.toBase()).to.eq.BN(b(1000));
    });
    it('Should convert amount using RateOracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);
        const oracle = await TestRateOracle.new();

        await lib.create(
            oracle.address,
            token.address,
            debtId,
            b(1000),
            ratio(110),
            ratio(150)
        );

        // 1 BASE == 0.5 TOKEN
        await oracle.setEquivalent(b(500000000000000000));
        expect(await lib.toBase()).to.eq.BN(b(2000));
    });
    it('Should return current ratio without RateOracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);

        await lib.create(
            address0x,
            token.address,
            debtId,
            b(1000),
            ratio(110),
            ratio(150)
        );

        expect(await lib.ratio(b(1000))).to.eq.BN(ratio(100));
        expect(unratio(await lib.ratio(b(1000)))).to.eq.BN(b(100));
        expect(unratio(await lib.ratio(b(909)))).to.eq.BN(b(110));
        expect(unratio(await lib.ratio(b(333)))).to.eq.BN(b(300));
        expect(unratio(await lib.ratio(b(1000)))).to.eq.BN(b(100));
        expect(unratio(await lib.ratio(b(1100)))).to.eq.BN(b(90));
        expect(unratio(await lib.ratio(b(2000)))).to.eq.BN(b(50));
        expect(unratio(await lib.ratio(b(4000)))).to.eq.BN(b(25));
    });
    it('Should return current ratio with RateOracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);
        const oracle = await TestRateOracle.new();

        await lib.create(
            oracle.address,
            token.address,
            debtId,
            b(500),
            ratio(110),
            ratio(150)
        );

        // 1 BASE == 0.5 TOKEN
        await oracle.setEquivalent(b(500000000000000000));

        expect(await lib.ratio(b(1000))).to.eq.BN(ratio(100));
        expect(unratio(await lib.ratio(b(1000)))).to.eq.BN(b(100));
        expect(unratio(await lib.ratio(b(909)))).to.eq.BN(b(110));
        expect(unratio(await lib.ratio(b(333)))).to.eq.BN(b(300));
        expect(unratio(await lib.ratio(b(1000)))).to.eq.BN(b(100));
        expect(unratio(await lib.ratio(b(1100)))).to.eq.BN(b(90));
        expect(unratio(await lib.ratio(b(2000)))).to.eq.BN(b(50));
        expect(unratio(await lib.ratio(b(4000)))).to.eq.BN(b(25));
    });
    it('Should return required to balance without RateOracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);

        await lib.create(
            address0x,
            token.address,
            debtId,
            b(1000),
            ratio(110),
            ratio(150)
        );

        // Balance is not required
        expect(await lib.balance(b(0))).to.eq.BN(b(0));
        expect(await lib.balance(b(100))).to.eq.BN(b(0));
        expect(await lib.balance(b(250))).to.eq.BN(b(0));
        expect(await lib.balance(b(500))).to.eq.BN(b(0));
        expect(await lib.balance(b(909))).to.eq.BN(b(0));

        // Balance is required
        expect(await lib.balance(b(910))).to.eq.BN(b(730));
        expect(await lib.balance(b(920))).to.eq.BN(b(760));
        expect(await lib.balance(b(990))).to.eq.BN(b(970));
        expect(await lib.balance(b(999))).to.eq.BN(b(997));
        expect(await lib.balance(b(1000))).to.eq.BN(b(1000));
        expect(await lib.balance(b(1200))).to.eq.BN(b(1000));
        expect(await lib.balance(b(2000))).to.eq.BN(b(1000));
        expect(await lib.balance(b(2000000))).to.eq.BN(b(1000));
    });
    it('Should return required to balance with RateOracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);
        const oracle = await TestRateOracle.new();

        await lib.create(
            oracle.address,
            token.address,
            debtId,
            b(500),
            ratio(110),
            ratio(150)
        );

        // 1 BASE == 0.5 TOKEN
        await oracle.setEquivalent(b(500000000000000000));

        // Balance is not required
        expect(await lib.balance(b(0))).to.eq.BN(b(0));
        expect(await lib.balance(b(100))).to.eq.BN(b(0));
        expect(await lib.balance(b(250))).to.eq.BN(b(0));
        expect(await lib.balance(b(500))).to.eq.BN(b(0));
        expect(await lib.balance(b(909))).to.eq.BN(b(0));

        // Balance is required
        expect(await lib.balance(b(910))).to.eq.BN(b(365));
        expect(await lib.balance(b(920))).to.eq.BN(b(380));
        expect(await lib.balance(b(990))).to.eq.BN(b(485));
        expect(await lib.balance(b(999))).to.eq.BN(b(498));
        expect(await lib.balance(b(1000))).to.eq.BN(b(500));
        expect(await lib.balance(b(1200))).to.eq.BN(b(500));
        expect(await lib.balance(b(2000))).to.eq.BN(b(500));
        expect(await lib.balance(b(2000000))).to.eq.BN(b(500));
    });
    it('Should return can withdraw without RateOracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);

        await lib.create(
            address0x,
            token.address,
            debtId,
            b(1000),
            ratio(110),
            ratio(150)
        );

        // Can't withdraw collateral
        expect(await lib.canWithdraw(b(910))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(920))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(990))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(999))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(1000))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(1200))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(2000))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(2000000))).to.eq.BN(b(0));

        // Can withdraw collateral
        expect(await lib.canWithdraw(b(0))).to.eq.BN(b(1000));
        expect(await lib.canWithdraw(b(100))).to.eq.BN(b(890));
        expect(await lib.canWithdraw(b(250))).to.eq.BN(b(725));
        expect(await lib.canWithdraw(b(500))).to.eq.BN(b(450));
        expect(await lib.canWithdraw(b(900))).to.eq.BN(b(10));
        expect(await lib.canWithdraw(b(909))).to.eq.BN(b(0));
    });
    it('Should return can withdraw with RateOracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);
        const oracle = await TestRateOracle.new();

        await lib.create(
            oracle.address,
            token.address,
            debtId,
            b(500),
            ratio(110),
            ratio(150)
        );

        // 1 BASE == 0.5 TOKEN
        await oracle.setEquivalent(b(500000000000000000));

        // Can't withdraw collateral
        expect(await lib.canWithdraw(b(910))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(920))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(990))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(999))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(1000))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(1200))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(2000))).to.eq.BN(b(0));
        expect(await lib.canWithdraw(b(2000000))).to.eq.BN(b(0));

        // Can withdraw collateral
        expect(await lib.canWithdraw(b(0))).to.eq.BN(b(500));
        expect(await lib.canWithdraw(b(100))).to.eq.BN(b(445));
        expect(await lib.canWithdraw(b(250))).to.eq.BN(b(362));
        expect(await lib.canWithdraw(b(500))).to.eq.BN(b(225));
        expect(await lib.canWithdraw(b(900))).to.eq.BN(b(5));
        expect(await lib.canWithdraw(b(909))).to.eq.BN(b(0));
    });
    it('Should return if a collateral is in liquidation, without rate oracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);

        await lib.create(
            address0x,
            token.address,
            debtId,
            b(1000),
            ratio(110),
            ratio(150)
        );

        // Not in liquidation
        expect(await lib.inLiquidation(b(0))).to.be.equal(false);
        expect(await lib.inLiquidation(b(100))).to.be.equal(false);
        expect(await lib.inLiquidation(b(250))).to.be.equal(false);
        expect(await lib.inLiquidation(b(500))).to.be.equal(false);
        expect(await lib.inLiquidation(b(900))).to.be.equal(false);
        expect(await lib.inLiquidation(b(909))).to.be.equal(false);

        // Requires liquidation
        expect(await lib.inLiquidation(b(910))).to.be.equal(true);
        expect(await lib.inLiquidation(b(920))).to.be.equal(true);
        expect(await lib.inLiquidation(b(990))).to.be.equal(true);
        expect(await lib.inLiquidation(b(999))).to.be.equal(true);
        expect(await lib.inLiquidation(b(1000))).to.be.equal(true);
        expect(await lib.inLiquidation(b(1200))).to.be.equal(true);
        expect(await lib.inLiquidation(b(2000))).to.be.equal(true);
        expect(await lib.inLiquidation(b(2000000))).to.be.equal(true);
    });
    it('Should return if a collateral is in liquidation, with rate oracle', async () => {
        const lib = await TestCollateralLib.new();
        const token = await TestToken.new();
        const debtId = web3.utils.randomHex(32);
        const oracle = await TestRateOracle.new();

        await lib.create(
            oracle.address,
            token.address,
            debtId,
            b(500),
            ratio(110),
            ratio(150)
        );

        // 1 BASE == 0.5 TOKEN
        await oracle.setEquivalent(b(500000000000000000));

        // Not in liquidation
        expect(await lib.inLiquidation(b(0))).to.be.equal(false);
        expect(await lib.inLiquidation(b(100))).to.be.equal(false);
        expect(await lib.inLiquidation(b(250))).to.be.equal(false);
        expect(await lib.inLiquidation(b(500))).to.be.equal(false);
        expect(await lib.inLiquidation(b(900))).to.be.equal(false);
        expect(await lib.inLiquidation(b(909))).to.be.equal(false);

        // Requires liquidation
        expect(await lib.inLiquidation(b(910))).to.be.equal(true);
        expect(await lib.inLiquidation(b(920))).to.be.equal(true);
        expect(await lib.inLiquidation(b(990))).to.be.equal(true);
        expect(await lib.inLiquidation(b(999))).to.be.equal(true);
        expect(await lib.inLiquidation(b(1000))).to.be.equal(true);
        expect(await lib.inLiquidation(b(1200))).to.be.equal(true);
        expect(await lib.inLiquidation(b(2000))).to.be.equal(true);
        expect(await lib.inLiquidation(b(2000000))).to.be.equal(true);
    });
});
