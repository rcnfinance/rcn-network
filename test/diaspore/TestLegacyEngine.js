const TestToken = artifacts.require("./utils/TestToken.sol");
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const LegacyEngine = artifacts.require("./diaspore/LegacyEngine.sol");
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');

const Helper = require('../Helper.js');

contract('LegacyEngine', function(accounts) {

    let rcn;
    let basalt;
    let debtEngine;
    let testModel;
    let legacyEngine;

    beforeEach("Create engine and token", async function(){

        rcn = await TestToken.new();
        console.log(rcn.address);

        basalt = await NanoLoanEngine.new(rcn.address);
        console.log(basalt.address);

        debtEngine = await DebtEngine.new(rcn.address);
        console.log(debtEngine.address);

        testModel = await TestModel.new();
        await testModel.setEngine(debtEngine.address, { from:accounts[0] });
        console.log(testModel.address);


        legacyEngine = await LegacyEngine.new(testModel.address, { from:accounts[0] });
        console.log(legacyEngine.address);
    })


})
