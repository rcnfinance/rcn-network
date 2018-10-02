const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require("./utils/test/TestToken.sol");
const Helper = require('./Helper.js');

contract('Test DebtEngine Diaspore', function(accounts) {
    let rcn;
    let debtEngine;
    let testModel;

    before("Create engine and model", async function(){
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        testModel = await TestModel.new();
        await testModel.setEngine(debtEngine.address);
    });

    it("Should create a debt using create", async function() {
        await debtEngine.create(
            testModel.address,
            accounts[1],
            0x0,
            0x0,
            [
                Helper.toBytes32(1000),
                Helper.toBytes32((await Helper.getBlockTime()) + 1000)
            ]
        );

        assert.equal(await debtEngine.balanceOf(accounts[1]), 1, "Account 1 should have a new asset");
    });

    it("Should create 2 a debts using create2", async function() {
        await debtEngine.create2(
            testModel.address,
            accounts[1],
            0x0,
            0x0,
            10,
            [
                Helper.toBytes32(3000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        );

        assert.equal(await debtEngine.balanceOf(accounts[1]), 2, "Account 1 should have a new asset");

        await debtEngine.create2(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            9,
            [
                Helper.toBytes32(2000),
                Helper.toBytes32((await Helper.getBlockTime()) + 3000)
            ]
        );

        assert.equal(await debtEngine.balanceOf(accounts[2]), 1, "Account 1 should have a new asset");
    });


    it("Should create and pay a debt", async function() {
        await debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            [
                Helper.toBytes32(3000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        );

        await rcn.setBalance(accounts[0], 4000);

        await rcn.approve(debtEngine.address, 4000);
        await debtEngine.pay()
    });
});