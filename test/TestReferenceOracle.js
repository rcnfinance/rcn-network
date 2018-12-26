const ReferenceOracle = artifacts.require('./examples/ReferenceOracle.sol');
const Helper = require('./Helper.js');

// global variables
/// ///////////////
// contracts
let oracle;
// accounts
let user;
let admin;
// currencies
const BTC = {
    id: '0x4254430000000000000000000000000000000000000000000000000000000000',
    rate: Helper.toBytes32(9999),
    decimals: Helper.toBytes32(8),
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
            { t: 'bytes32', v: Helper.toBytes32(web3.utils.toHex(currency.timestamp)) }
        );

        const approveSignature = (await web3.eth.sign(sign, signer)).slice(2);
        const r = '0x' + approveSignature.slice(0, 64);
        const s = '0x' + approveSignature.slice(64, 128);
        const v = web3.utils.toDecimal(approveSignature.slice(128, 130)) + 27;
        return [v, r, s];
    };

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
        let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        let rate = await oracle.getRate.call(BTC.id, data);
        assert.equal(web3.utils.toDecimal(rate[0]), BTC.rate.toString());
        assert.equal(web3.utils.toDecimal(rate[1]), BTC.decimals.toString());

        BTC.rate = Helper.toBytes32(500);
        vrs = await signGetRate(oracle, admin, BTC);
        data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        rate = await oracle.getRate.call(BTC.id, data);
        assert.equal(web3.utils.toDecimal(rate[0]), BTC.rate.toString());
        assert.equal(web3.utils.toDecimal(rate[1]), BTC.decimals.toString());

        let cache = await oracle.cache(BTC.id);
        for (let i = 0; i < cache.length; i++) { assert.equal(cache[i].toString(), 0); }
        // change cache
        BTC.rate = Helper.toBytes32(650);
        vrs = await signGetRate(oracle, admin, BTC);
        data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        const tx = await oracle.getRate(BTC.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'DeliveredRate');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        assert.equal(args.signer, admin);
        assert.equal(args.requestTimestamp, BTC.timestamp);
        assert.equal(args.rate.toString(), web3.utils.toDecimal(BTC.rate).toString());
        assert.equal(args.decimals.toString(), web3.utils.toDecimal(BTC.decimals).toString());

        cache = await oracle.cache(BTC.id);
        assert.equal(cache[0].toString(), web3.utils.toDecimal(BTC.timestamp).toString());
        assert.equal(cache[1].toString(), web3.utils.toDecimal(BTC.rate).toString());
        assert.equal(cache[2].toString(), web3.utils.toDecimal(BTC.decimals).toString());
    });

    it('Test: getRate() try hack', async () => {
    // set cache
        const vrs = await signGetRate(oracle, admin, BTC);
        const data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.getRate(BTC.id, data);
        // try to sign with a non-delegated account
        const vrsHacker = await signGetRate(oracle, hacker, BTC);
        const dataHacker = Helper.arrayToBytesOfBytes32([BTC.timestamp + 100, BTC.rate, BTC.decimals, vrsHacker[0], vrsHacker[1], vrsHacker[2]]);
        await Helper.tryCatchRevert(() => oracle.getRate.call(BTC.id, dataHacker), 'Signature is not valid');
    });

    it('Test: getRate() with diferent timestamps', async () => {
        let vrs = await signGetRate(oracle, admin, BTC);
        let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.getRate(BTC.id, data, { from: user });

        const BTCold = {
            id: '0x4254430000000000000000000000000000000000000000000000000000000000',
            rate: Helper.toBytes32(1),
            decimals: Helper.toBytes32(1),
            timestamp: 1,
        };
        vrs = await signGetRate(oracle, admin, BTCold);
        data = Helper.arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        const tx = await oracle.getRate(BTCold.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'CacheHit');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        assert.equal(args.requestTimestamp.toString(), BTCold.timestamp);
        assert.equal(args.deliverTimestamp.toString(), BTC.timestamp);
        assert.equal(args.rate.toString(), web3.utils.toDecimal(BTC.rate).toString());
        assert.equal(args.decimals.toString(), web3.utils.toDecimal(BTC.decimals).toString());
        // try get rate with expired timestamp
        await Helper.increaseTime(15 * 60);// 15 minutes foward in time
        vrs = await signGetRate(oracle, admin, BTCold);
        data = Helper.arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        await Helper.tryCatchRevert(() => oracle.getRate(BTCold.id, data, { from: user }), 'The rate provided is expired');
    });

    it('Should fallback getRate when forward is pressent', async function () {
        const fallback = await ReferenceOracle.new({ from: admin });
        await fallback.addDelegate(admin);
        await oracle.setFallback(fallback.address);
        BTC.timestamp = await Helper.getBlockTime();
        const vrs = await signGetRate(fallback, admin, BTC);
        const data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        const tx = await oracle.getRate(BTC.id, data, { from: user });
        assert.equal(tx.logs[0].event, 'DelegatedCall');
        await oracle.setFallback(Helper.address0x);
    });

    it('Should change the URL of the Oracle', async function () {
        await oracle.setUrl('https://oracle.test');
        assert.equal(await oracle.url(), 'https://oracle.test');
        await oracle.setUrl('https://oracle.test/2/');
        assert.equal(await oracle.url(), 'https://oracle.test/2/');
    });

    it('Should invalidate the cache', async () => {
        let vrs = await signGetRate(oracle, admin, BTC);
        let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.getRate(BTC.id, data, { from: user });
        const BTCold = {
            id: '0x4254430000000000000000000000000000000000000000000000000000000000',
            rate: Helper.toBytes32(1),
            decimals: Helper.toBytes32(1),
            timestamp: await Helper.getBlockTime(),
        };
        vrs = await signGetRate(oracle, admin, BTCold);
        data = Helper.arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.invalidateCache(BTCold.id);
        const tx = await oracle.getRate(BTCold.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'DeliveredRate');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        assert.equal(args.requestTimestamp.toString(), BTCold.timestamp);
        assert.equal(args.rate.toString(), '1');
        assert.equal(args.decimals.toString(), '1');
    });

    it('Should change the expiration time', async function () {
        const BTCold = {
            id: '0x4254430000000000000000000000000000000000000000000000000000000000',
            rate: Helper.toBytes32(1),
            decimals: Helper.toBytes32(1),
            timestamp: 1000,
        };
        await oracle.setExpirationTime(await Helper.getBlockTime() - 10);
        const vrs = await signGetRate(oracle, admin, BTCold);
        const data = Helper.arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.invalidateCache(BTCold.id);
        const tx = await oracle.getRate(BTCold.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'DeliveredRate');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        assert.equal(args.requestTimestamp.toString(), BTCold.timestamp);
        assert.equal(args.rate.toString(), '1');
        assert.equal(args.decimals.toString(), '1');
    });

    it('Should encode and decode currency', async function () {
        const encoded = await oracle.encodeCurrency('ARS');
        assert.equal(encoded, '0x4152530000000000000000000000000000000000000000000000000000000000');
        assert.equal(await oracle.decodeCurrency(encoded), 'ARS');
    });
});
