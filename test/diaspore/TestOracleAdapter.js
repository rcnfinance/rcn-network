const TestOracle = artifacts.require('TestOracle');
const OracleAdapter = artifacts.require('OracleAdapter');

const {
    expect,
    bn,
    assertThrow,
} = require('../Helper.js');

contract('Test Oracle adapter', function (accounts) {
    let legacyOracle;
    let oracle;

    before('Create engine and model', async function () {
        legacyOracle = await TestOracle.new();
        oracle = await OracleAdapter.new(
            legacyOracle.address,
            'ARS',
            'Argentine Peso',
            'Test oracle, ripiocredit.network',
            2,
            '0x415253',
            accounts[8]
        );
        await legacyOracle.setUrl('https://oracle.rcn.loans/');
    });

    it('Should return metadata', async function () {
        assert.equal(await oracle.symbol(), 'ARS');
        assert.equal(await oracle.name(), 'Argentine Peso');
        expect(await oracle.decimals()).to.eq.BN('2');
        assert.equal(await oracle.token(), accounts[8]);
        assert.equal(await oracle.currency(), '0x4152530000000000000000000000000000000000000000000000000000000000');
        assert.equal(await oracle.maintainer(), 'Test oracle, ripiocredit.network');
        assert.equal(await oracle.url(), 'https://oracle.rcn.loans/');
    });
    it('Should convert legacy oracle getReturn, data 1', async function () {
        const data = await legacyOracle.dummyData1();
        const rate = await legacyOracle.getRate.call('0x415253', data);
        const sample = await oracle.readSample.call(data);
        expect(rate[0]).to.eq.BN(sample[0]);
        expect(bn('10').pow(rate[1])).to.eq.BN(sample[1]);
    });
    it('Should convert legacy oracle getReturn, data 2', async function () {
        const data = await legacyOracle.dummyData2();
        const rate = await legacyOracle.getRate.call('0x415253', data);
        const sample = await oracle.readSample.call(data);
        expect(rate[0]).to.eq.BN(sample[0]);
        expect(bn('10').pow(rate[1])).to.eq.BN(sample[1]);
    });
    it('Should fail with invalid data', async function () {
        const data = await legacyOracle.invalidData();
        await assertThrow(legacyOracle.getRate('0x415253', data));
        await assertThrow(oracle.readSample(data));
    });
});
