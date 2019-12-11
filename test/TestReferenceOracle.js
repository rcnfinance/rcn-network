const ReferenceOracle = artifacts.require('ReferenceOracle');

const {
    expect,
    bn,
    address0x,
    getBlockTime,
    tryCatchRevert,
    increaseTime,
    toBytes32,
    arrayToBytesOfBytes32,
} = require('./Helper.js');

// contracts
let oracle;
// accounts
let user;
let admin;
// currencies
const BTC = {
    id: '0x4254430000000000000000000000000000000000000000000000000000000000',
    rate: toBytes32(9999),
    decimals: toBytes32(8),
    timestamp: 0,
};

contract('ReferenceOracle', function (accounts) {
    let hacker;

    async function signGetRate (oracle, signer, currency) {
        const sign = web3.utils.soliditySha3(
            { t: 'address', v: oracle.address },
            { t: 'bytes32', v: currency.id },
            { t: 'uint256', v: currency.rate },
            { t: 'uint256', v: currency.decimals },
            { t: 'bytes32', v: toBytes32(web3.utils.toHex(currency.timestamp)) }
        );

        const approveSignature = (await web3.eth.sign(sign, signer)).slice(2);
        const r = '0x' + approveSignature.slice(0, 64);
        const s = '0x' + approveSignature.slice(64, 128);
        const v = web3.utils.toDecimal('0x' + approveSignature.slice(128, 130)) + 27;
        return [v, r, s];
    }

    before('Assign accounts, create contracts, add delegate and set a rate', async function () {
        // set account addresses
        admin = accounts[0];
        user = accounts[1];
        hacker = accounts[2];

        oracle = await ReferenceOracle.new({ from: admin });
        await oracle.addDelegate(admin, { from: admin });

        BTC.timestamp = (await web3.eth.getBlock('latest')).timestamp;

        // Add currency to Oracle
        await oracle.addCurrency('BTC');
    });

    it('Test: getRate()', async () => {
        // only view
        let vrs = await signGetRate(oracle, admin, BTC);
        let data = arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        let rate = await oracle.getRate.call(BTC.id, data);

        expect(rate[0]).to.eq.BN(web3.utils.toDecimal(BTC.rate));
        expect(rate[1]).to.eq.BN(web3.utils.toDecimal(BTC.decimals));

        BTC.rate = toBytes32(500);
        vrs = await signGetRate(oracle, admin, BTC);
        data = arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        rate = await oracle.getRate.call(BTC.id, data);

        expect(rate[0]).to.eq.BN(web3.utils.toDecimal(BTC.rate));
        expect(rate[1]).to.eq.BN(web3.utils.toDecimal(BTC.decimals));

        let cache = await oracle.cache(BTC.id);
        for (let i = 0; i < cache.length; i++) {
            expect(cache[i]).to.eq.BN('0');
        }
        // change cache
        BTC.rate = toBytes32(650);
        vrs = await signGetRate(oracle, admin, BTC);
        data = arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        const tx = await oracle.getRate(BTC.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'DeliveredRate');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        assert.equal(args.signer, admin);
        expect(args.requestTimestamp).to.eq.BN(BTC.timestamp);
        expect(args.rate).to.eq.BN(web3.utils.toDecimal(BTC.rate));
        expect(args.decimals).to.eq.BN(web3.utils.toDecimal(BTC.decimals));

        cache = await oracle.cache(BTC.id);
        expect(cache[0]).to.eq.BN(web3.utils.toDecimal(BTC.timestamp));
        expect(cache[1]).to.eq.BN(web3.utils.toDecimal(BTC.rate));
        expect(cache[2]).to.eq.BN(web3.utils.toDecimal(BTC.decimals));
    });
    it('Test: getRate() try hack', async () => {
    // set cache
        const vrs = await signGetRate(oracle, admin, BTC);
        const data = arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.getRate(BTC.id, data);
        // try to sign with a non-delegated account
        const vrsHacker = await signGetRate(oracle, hacker, BTC);
        const dataHacker = arrayToBytesOfBytes32([BTC.timestamp + 100, BTC.rate, BTC.decimals, vrsHacker[0], vrsHacker[1], vrsHacker[2]]);
        await tryCatchRevert(() => oracle.getRate.call(BTC.id, dataHacker), 'Signature is not valid');
    });
    it('Test: getRate() with diferent timestamps', async () => {
        let vrs = await signGetRate(oracle, admin, BTC);
        let data = arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.getRate(BTC.id, data, { from: user });

        const BTCold = {
            id: '0x4254430000000000000000000000000000000000000000000000000000000000',
            rate: toBytes32(1),
            decimals: toBytes32(1),
            timestamp: 1,
        };
        vrs = await signGetRate(oracle, admin, BTCold);
        data = arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        const tx = await oracle.getRate(BTCold.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'CacheHit');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        expect(args.requestTimestamp).to.eq.BN(BTCold.timestamp);
        expect(args.deliverTimestamp).to.eq.BN(BTC.timestamp);
        expect(args.rate).to.eq.BN(web3.utils.toDecimal(BTC.rate));
        expect(args.decimals).to.eq.BN(web3.utils.toDecimal(BTC.decimals));
        // try get rate with expired timestamp
        await increaseTime(15 * 60);// 15 minutes foward in time
        vrs = await signGetRate(oracle, admin, BTCold);
        data = arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        await tryCatchRevert(() => oracle.getRate(BTCold.id, data, { from: user }), 'The rate provided is expired');
    });
    it('Should fallback getRate when forward is pressent', async function () {
        const fallback = await ReferenceOracle.new({ from: admin });
        await fallback.addDelegate(admin);
        await oracle.setFallback(fallback.address);
        BTC.timestamp = await getBlockTime();
        const vrs = await signGetRate(fallback, admin, BTC);
        const data = arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        const tx = await oracle.getRate(BTC.id, data, { from: user });
        assert.equal(tx.logs[0].event, 'DelegatedCall');
        await oracle.setFallback(address0x);
    });
    it('Should change the URL of the Oracle', async function () {
        await oracle.setUrl('https://oracle.test');
        assert.equal(await oracle.url(), 'https://oracle.test');
        await oracle.setUrl('https://oracle.test/2/');
        assert.equal(await oracle.url(), 'https://oracle.test/2/');
    });
    it('Should invalidate the cache', async () => {
        let vrs = await signGetRate(oracle, admin, BTC);
        let data = arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.getRate(BTC.id, data, { from: user });
        const BTCold = {
            id: '0x4254430000000000000000000000000000000000000000000000000000000000',
            rate: toBytes32(1),
            decimals: toBytes32(1),
            timestamp: await getBlockTime(),
        };
        vrs = await signGetRate(oracle, admin, BTCold);
        data = arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.invalidateCache(BTCold.id);
        const tx = await oracle.getRate(BTCold.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'DeliveredRate');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        expect(args.requestTimestamp).to.eq.BN(BTCold.timestamp);
        expect(args.rate).to.eq.BN(bn('1'));
        expect(args.decimals).to.eq.BN(bn('1'));
    });
    it('Should change the expiration time', async function () {
        const BTCold = {
            id: '0x4254430000000000000000000000000000000000000000000000000000000000',
            rate: toBytes32(1),
            decimals: toBytes32(1),
            timestamp: 1000,
        };
        await oracle.setExpirationTime(await getBlockTime() - 10);
        const vrs = await signGetRate(oracle, admin, BTCold);
        const data = arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.invalidateCache(BTCold.id);
        const tx = await oracle.getRate(BTCold.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'DeliveredRate');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        expect(args.requestTimestamp).to.eq.BN(BTCold.timestamp);
        expect(args.rate).to.eq.BN(bn('1'));
        expect(args.decimals).to.eq.BN(bn('1'));
    });
    it('Should encode and decode currency', async function () {
        const encoded = await oracle.encodeCurrency('ARS');
        assert.equal(encoded, '0x4152530000000000000000000000000000000000000000000000000000000000');
        assert.equal(await oracle.decodeCurrency(encoded), 'ARS');
    });
});
