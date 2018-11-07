const ReferenceOracle = artifacts.require('./examples/ReferenceOracle.sol');
const Helper = require('./Helper.js');

const abiGetRateView = [{ 'constant': true, 'inputs': [{ 'name': 'currency', 'type': 'bytes32' }, { 'name': 'data', 'type': 'bytes' }], 'name': 'getRate', 'outputs': [{ 'name': '', 'type': 'uint256' }, { 'name': '', 'type': 'uint256' }], 'payable': false, 'stateMutability': 'view', 'type': 'function' }];

// global variables
/// ///////////////
// contracts
let oracle;
let oracleView;
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

    before('Assign accounts, create contracts, add delegate and set a rate', async function () {
    // set account addresses
        admin = accounts[0];
        user = accounts[1];
        hacker = accounts[2];

        oracle = await ReferenceOracle.new({ from: admin });
        oracleView = web3.eth.contract(abiGetRateView).at(oracle.address);
        await oracle.addDelegate(admin, { from: admin });

        BTC.timestamp = (await web3.eth.getBlock('latest')).timestamp;
    });

    it('Test: getRate()', async () => {
    // only view
        let vrs = await signGetRate(admin, BTC);
        let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        let rate = await oracleView.getRate(BTC.id, data);
        assert.equal(web3.toDecimal(rate[0]), BTC.rate.toString());
        assert.equal(web3.toDecimal(rate[1]), BTC.decimals.toString());

        BTC.rate = Helper.toBytes32(500);
        vrs = await signGetRate(admin, BTC);
        data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        rate = await oracleView.getRate(BTC.id, data);
        assert.equal(web3.toDecimal(rate[0]), BTC.rate.toString());
        assert.equal(web3.toDecimal(rate[1]), BTC.decimals.toString());

        let cache = await oracle.cache(BTC.id);
        for (let i = 0; i < cache.length; i++) { assert.equal(cache[i].toString(), 0); }
        // change cache
        BTC.rate = Helper.toBytes32(650);
        vrs = await signGetRate(admin, BTC);
        data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        const tx = await oracle.getRate(BTC.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'DeliveredRate');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        assert.equal(args.signer, admin);
        assert.equal(args.requestTimestamp, BTC.timestamp);
        assert.equal(args.rate.toString(), web3.toDecimal(BTC.rate).toString());
        assert.equal(args.decimals.toString(), web3.toDecimal(BTC.decimals).toString());

        cache = await oracle.cache(BTC.id);
        assert.equal(cache[0].toString(), web3.toDecimal(BTC.timestamp).toString());
        assert.equal(cache[1].toString(), web3.toDecimal(BTC.rate).toString());
        assert.equal(cache[2].toString(), web3.toDecimal(BTC.decimals).toString());
    });

    it('Test: getRate() try hack', async () => {
    // set cache
        const vrs = await signGetRate(admin, BTC);
        const data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.getRate(BTC.id, data);
        // try to sign with a non-delegated account
        const vrsHacker = await signGetRate(hacker, BTC);
        const dataHacker = Helper.arrayToBytesOfBytes32([BTC.timestamp + 100, BTC.rate, BTC.decimals, vrsHacker[0], vrsHacker[1], vrsHacker[2]]);
        await Helper.tryCatchRevert(() => oracleView.getRate(BTC.id, dataHacker), 'Signature is not valid');
    });

    it('Test: getRate() with diferent timestamps', async () => {
        let vrs = await signGetRate(admin, BTC);
        let data = Helper.arrayToBytesOfBytes32([BTC.timestamp, BTC.rate, BTC.decimals, vrs[0], vrs[1], vrs[2]]);
        await oracle.getRate(BTC.id, data, { from: user });

        const BTCold = {
            id: '0x4254430000000000000000000000000000000000000000000000000000000000',
            rate: Helper.toBytes32(1),
            decimals: Helper.toBytes32(1),
            timestamp: 1,
        };
        vrs = await signGetRate(admin, BTCold);
        data = Helper.arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        const tx = await oracle.getRate(BTCold.id, data, { from: user });
        const args = tx.logs[0].args;
        assert.equal(tx.logs[0].event, 'CacheHit');
        assert.equal(args.requester, user);
        assert.equal(args.currency, BTC.id);
        assert.equal(args.requestTimestamp.toString(), BTCold.timestamp);
        assert.equal(args.deliverTimestamp.toString(), BTC.timestamp);
        assert.equal(args.rate.toString(), web3.toDecimal(BTC.rate).toString());
        assert.equal(args.decimals.toString(), web3.toDecimal(BTC.decimals).toString());
        // try get rate with expired timestamp
        await Helper.increaseTime(15 * 60);// 15 minutes foward in time
        vrs = await signGetRate(admin, BTCold);
        data = Helper.arrayToBytesOfBytes32([BTCold.timestamp, BTCold.rate, BTCold.decimals, vrs[0], vrs[1], vrs[2]]);
        await Helper.tryCatchRevert(() => oracle.getRate(BTCold.id, data, { from: user }), 'The rate provided is expired');
    });

    async function signGetRate (signer, currency) {
        let sign = [oracle.address, currency.id, currency.rate, currency.decimals, Helper.toBytes32(web3.toHex(currency.timestamp))];
        sign = web3.sha3(sign.map(x => x.slice(2)).join(''), { encoding: 'hex' });

        const approveSignature = await web3.eth.sign(signer, sign).slice(2);
        const r = '0x' + approveSignature.slice(0, 64);
        const s = '0x' + approveSignature.slice(64, 128);
        const v = web3.toDecimal(approveSignature.slice(128, 130)) + 27;
        return [v, r, s];
    };
});
