const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require("./utils/test/TestToken.sol");
const TestOracle = artifacts.require("./examples/TestOracle.sol");

const Helper = require('./Helper.js');

contract('Test DebtEngine Diaspore', function(accounts) {
    let rcn;
    let debtEngine;
    let testModel;
    let oracle;

    async function getId(promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event == "Created2" || l.event == "Created");
        return event["args"]["_id"];
    }

    before("Create engine and model", async function(){
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        testModel = await TestModel.new();
        await testModel.setEngine(debtEngine.address);
        oracle = await TestOracle.new();
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

    it("Should create 2 debts using create2", async function() {
        await debtEngine.create2(
            testModel.address,
            accounts[1],
            0x0,
            0x0,
            8000000,
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
            9000000,
            [
                Helper.toBytes32(2000),
                Helper.toBytes32((await Helper.getBlockTime()) + 3000)
            ]
        );

        assert.equal(await debtEngine.balanceOf(accounts[2]), 1, "Account 1 should have a new asset");
    });

    it("Should create and pay a debt", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            [
                Helper.toBytes32(3000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        await rcn.setBalance(accounts[0], 4000);

        await rcn.approve(debtEngine.address, 4000);
        await debtEngine.pay(id, 4000, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 1000);
        assert.equal(await debtEngine.getStatus(id), 2);
        assert.equal(await testModel.getPaid(id), 3000);
    });

    it("Should create and pay a debt using payToken", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            [
                Helper.toBytes32(3000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        await rcn.setBalance(accounts[0], 4000);

        await rcn.approve(debtEngine.address, 4000);
        await debtEngine.payToken(id, 4000, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 1000);
        assert.equal(await debtEngine.getStatus(id), 2);
        assert.equal(await testModel.getPaid(id), 3000);
    });

    it("Should withdraw funds from payment", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            [
                Helper.toBytes32(3000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        await rcn.setBalance(accounts[0], 4000);

        await rcn.approve(debtEngine.address, 4000);
        await debtEngine.pay(id, 4000, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 1000);
        assert.equal(await debtEngine.getStatus(id), 2);
        assert.equal(await testModel.getPaid(id), 3000);

        // Withdraw funds
        await rcn.setBalance(accounts[5], 0);
        await debtEngine.withdrawal(id, accounts[5]);
        assert.equal(await rcn.balanceOf(accounts[5]), 3000);

        // Withdraw again, should be 0
        await rcn.setBalance(accounts[5], 0);
        await debtEngine.withdrawal(id, accounts[5]);
        assert.equal(await rcn.balanceOf(accounts[5]), 0);
    });

    it("Funds should follow the debt", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            [
                Helper.toBytes32(3000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        await rcn.setBalance(accounts[0], 4000);

        await rcn.approve(debtEngine.address, 4000);
        await debtEngine.pay(id, 4000, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 1000);
        assert.equal(await debtEngine.getStatus(id), 2);
        assert.equal(await testModel.getPaid(id), 3000);

        // Transfer debt
        await debtEngine.transferFrom(accounts[0], accounts[6], id);

        // Withdraw funds
        await rcn.setBalance(accounts[6], 0);
        await debtEngine.withdrawal(id, accounts[6], { from: accounts[6] });
        assert.equal(await rcn.balanceOf(accounts[6]), 3000);
    });

    it("Should withdraw funds from multiple debts", async function() {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            [
                Helper.toBytes32(3000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            [
                Helper.toBytes32(7000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        await rcn.setBalance(accounts[0], 10000);

        await rcn.approve(debtEngine.address, 10000);
        await debtEngine.pay(id1, 4000, accounts[3], []);
        await debtEngine.pay(id2, 9000, accounts[3], []);

        // Withdraw funds
        await rcn.setBalance(accounts[5], 0);
        await debtEngine.withdrawalList([id1, id2], accounts[5]);
        assert.equal(await rcn.balanceOf(accounts[5]), 10000);

        // Withdraw again, should be 0
        await rcn.setBalance(accounts[5], 0);
        await debtEngine.withdrawal(id1, accounts[5]);
        await debtEngine.withdrawal(id2, accounts[5]);
        await debtEngine.withdrawalList([id1, id2], accounts[5]);
        assert.equal(await rcn.balanceOf(accounts[5]), 0);
    });

    it("Should withdraw partial payments, authorized", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            [
                Helper.toBytes32(1000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        await rcn.setBalance(accounts[0], 4000);

        await rcn.approve(debtEngine.address, 4000);
        await debtEngine.pay(id, 50, accounts[3], []);

        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        await debtEngine.pay(id, 50, accounts[3], []);

        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 100);

        await debtEngine.setApprovalForAll(accounts[7], true);
        await rcn.setBalance(accounts[7], 0);
        await debtEngine.withdrawal(id, accounts[7], { from: accounts[7] });
        await debtEngine.setApprovalForAll(accounts[7], false);
        assert.equal(await rcn.balanceOf(accounts[7]), 100);

        await rcn.setBalance(accounts[2], 200);
        await debtEngine.pay(id, 200, accounts[2], []);

        // Next withdraw should fail, no longer approved
        await rcn.setBalance(accounts[7], 0);
        Helper.assertThrow(debtEngine.withdrawal(id, accounts[7], { from: accounts[7] }));
        debtEngine.withdrawalList([id], accounts[7], { from: accounts[7] });
        assert.equal(await rcn.balanceOf(accounts[7]), 0);

        await debtEngine.approve(accounts[8], id);
        await rcn.setBalance(accounts[8], 0);
        await debtEngine.withdrawalList([id], accounts[8], { from: accounts[8] });
        assert.equal(await rcn.balanceOf(accounts[8]), 200);
    });

    it("Should fail to create2 with the same nonce", async function() {
        await debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            9999,
            [
                Helper.toBytes32(1000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        );

        await Helper.assertThrow(
            debtEngine.create2(
                testModel.address,
                accounts[0],
                0x0,
                0x0,
                9999,
                [
                    Helper.toBytes32(1000),
                    Helper.toBytes32((await Helper.getBlockTime()) + 2000)
                ]
            )
        );
    });

    it("Should predict Ids", async function() {
        let pid1 = await debtEngine.buildId(accounts[0], 12000, true);
        let id1 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            12000,
            [
                Helper.toBytes32(1000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        assert.equal(pid1, id1);

        let nonce = await debtEngine.nonces(accounts[0]);
        let pid2 = await debtEngine.buildId(accounts[0], nonce++, false);
        let id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            [
                Helper.toBytes32(1000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        assert.equal(pid2, id2);
    });

    it("Should generate diferents ids create and create2", async function() {
        let nonce = await debtEngine.nonces(accounts[0]);
        let id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            [
                Helper.toBytes32(1000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));
        let id2 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            nonce++,
            [
                Helper.toBytes32(1000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));
        assert.notEqual(id1, id2);
    });

    it("Should pay using an Oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            0xd25aa221,
            [
                Helper.toBytes32(10000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        const dummyData1 = await oracle.dummyData1();
        const dummyData2 = await oracle.dummyData2();

        await rcn.setBalance(accounts[2], 60000);
        await rcn.approve(debtEngine.address, 60000, { from: accounts[2] });
        await debtEngine.pay(id, 10, accounts[1], dummyData1, { from: accounts[2] });

        assert.equal(await rcn.balanceOf(accounts[2]), 0);
        assert.equal(await testModel.getPaid(id), 10);

        await rcn.approve(debtEngine.address, 500, { from: accounts[3] });
        await rcn.setBalance(accounts[3], 500);
        await debtEngine.pay(id, 1000, 0x0, dummyData2, { from: accounts[3] });

        assert.equal(await rcn.balanceOf(accounts[3]), 0);
        assert.equal(await testModel.getPaid(id), 1010);

        await rcn.approve(debtEngine.address, 6000, { from: accounts[3] });
        await rcn.setBalance(accounts[3], 10000);
        await debtEngine.pay(id, 10000, accounts[0], dummyData2, { from: accounts[3] });

        assert.equal((await rcn.balanceOf(accounts[3])).toNumber(), 10000 - (10000 - 1010) / 2);
        assert.equal(await testModel.getPaid(id), 10000);
        assert.equal(await debtEngine.getStatus(id), 2);
    });

    it("Should pay using an Oracle and withdraw", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            0xd25aa221,
            [
                Helper.toBytes32(10000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        const dummyData1 = await oracle.dummyData1();
        const dummyData2 = await oracle.dummyData2();

        await rcn.setBalance(accounts[2], 60000);
        await rcn.approve(debtEngine.address, 60000, { from: accounts[2] });
        await debtEngine.pay(id, 10, accounts[1], dummyData1, { from: accounts[2] });

        await rcn.approve(debtEngine.address, 500, { from: accounts[3] });
        await rcn.setBalance(accounts[3], 500);
        await debtEngine.pay(id, 1000, 0x0, dummyData2, { from: accounts[3] });

        await rcn.approve(debtEngine.address, 6000, { from: accounts[3] });
        await rcn.setBalance(accounts[3], 10000);
        await debtEngine.pay(id, 10000, accounts[0], dummyData2, { from: accounts[3] });

        // Withdraw
        await debtEngine.transferFrom(accounts[0], accounts[9], id);
        await rcn.setBalance(accounts[9], 0);
        await debtEngine.withdrawalList([id], accounts[9], { from: accounts[9] });
        assert.equal(await rcn.balanceOf(accounts[9]), 60000 + 500 + (10000 - 1010) / 2);

        // Withdraw again should transfer 0
        await rcn.setBalance(accounts[9], 0);
        await debtEngine.approve(accounts[3], id, { from: accounts[9] });
        await debtEngine.withdrawalList([id], accounts[9], { from: accounts[3] });
        assert.equal(await rcn.balanceOf(accounts[9]), 0);
    });

    it("Should payToken using an Oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            0xd25aa221,
            [
                Helper.toBytes32(10000),
                Helper.toBytes32((await Helper.getBlockTime()) + 2000)
            ]
        ));

        const dummyData1 = await oracle.dummyData1();
        const dummyData2 = await oracle.dummyData2();

        await rcn.setBalance(accounts[2], 60000);
        await rcn.approve(debtEngine.address, 60000, { from: accounts[2] });
        await debtEngine.payToken(id, 60000, accounts[1], dummyData1, { from: accounts[2] });

        assert.equal(await rcn.balanceOf(accounts[2]), 0);
        assert.equal(await testModel.getPaid(id), 10);

        await rcn.approve(debtEngine.address, 500, { from: accounts[3] });
        await rcn.setBalance(accounts[3], 500);
        await debtEngine.payToken(id, 500, 0x0, dummyData2, { from: accounts[3] });

        assert.equal(await rcn.balanceOf(accounts[3]), 0);
        assert.equal(await testModel.getPaid(id), 1010);

        await rcn.approve(debtEngine.address, 6000, { from: accounts[3] });
        await rcn.setBalance(accounts[3], 10000);
        await debtEngine.payToken(id, 19000, accounts[0], dummyData2, { from: accounts[3] });

        assert.equal(await rcn.balanceOf(accounts[3]), 10000 - (10000 - 1010) / 2);
        assert.equal(await testModel.getPaid(id), 10000);
        assert.equal(await debtEngine.getStatus(id), 2);
    });
});