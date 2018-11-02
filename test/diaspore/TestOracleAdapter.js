const TestOracle = artifacts.require("./examples/TestOracle.sol");
const OracleAdapter = artifacts.require('./diaspore/utils/OracleAdapter.sol');

const Helper = require('../Helper.js');

contract('Test Oracle adapter', function(accounts) {
    let legacyOracle;
    let oracle;

    before("Create engine and model", async function(){
        legacyOracle = await TestOracle.new();
        oracle = await OracleAdapter.new(
            legacyOracle.address,
            "ARS",
            "Argentine Peso",
            "Test oracle, ripiocredit.network",
            2,
            0x415253,
            accounts[8]
        );
        await legacyOracle.setUrl("https://oracle.rcn.loans/");
    });

    it("Should return metadata", async function() {
        assert.equal(await oracle.symbol(), "ARS");
        assert.equal(await oracle.name(), "Argentine Peso");
        assert.equal(await oracle.decimals(), 2);
        assert.equal(await oracle.token(), accounts[8]);
        assert.equal(await oracle.currency(), "0x4152530000000000000000000000000000000000000000000000000000000000");
        assert.equal(await oracle.maintainer(), "Test oracle, ripiocredit.network");
        assert.equal(await oracle.url(), "https://oracle.rcn.loans/");
    });

    it("Should convert legacy oracle getReturn, data 1", async function() {
        const data = await legacyOracle.dummyData1();
        const rate = await legacyOracle.getRate.call(0x415253, data);
        const sample = await oracle.readSample.call(data);
        assert.equal(rate[0].toNumber(), sample[0].toNumber());
        assert.equal(10 ** rate[1], sample[1].toNumber());
    });

    it("Should convert legacy oracle getReturn, data 2", async function() {
        const data = await legacyOracle.dummyData2();
        const rate = await legacyOracle.getRate.call(0x415253, data);
        const sample = await oracle.readSample.call(data);
        assert.equal(rate[0].toNumber(), sample[0].toNumber());
        assert.equal(10 ** rate[1], sample[1].toNumber());
    });

    it("Should fail with invalid data", async function() {
        const data = await legacyOracle.invalidData();
        await Helper.assertThrow(legacyOracle.getRate(0x415253, data));
        await Helper.assertThrow(oracle.readSample(data));
    });
});