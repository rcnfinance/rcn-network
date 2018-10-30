const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require("./utils/test/TestToken.sol");
const TestOracle = artifacts.require("./examples/TestOracle.sol");

const Helper = require('../Helper.js');

contract('Test DebtEngine Diaspore', function(accounts) {
    let rcn;
    let debtEngine;
    let testModel;
    let oracle;

    async function getId(promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event == "Created2" || l.event == "Created3" || l.event == "Created");
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
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 1000)
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
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        );

        assert.equal(await debtEngine.balanceOf(accounts[1]), 2, "Account 1 should have a new asset");

        await debtEngine.create2(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            8000001,
            await testModel.encodeData(2000, (await Helper.getBlockTime()) + 3000)
        );

        assert.equal(await debtEngine.balanceOf(accounts[2]), 1, "Account 1 should have a new asset");
    });

    it("Should create and pay a debt", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
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
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
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
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
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
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
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
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            await testModel.encodeData(7000, (await Helper.getBlockTime()) + 2000)
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
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
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
        const expireTime = (await Helper.getBlockTime()) + 2000;
        await debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            9999,
            await testModel.encodeData(1000, expireTime)
        );

        await Helper.assertThrow(
            debtEngine.create2(
                testModel.address,
                accounts[0],
                0x0,
                0x0,
                9999,
                await testModel.encodeData(1000, expireTime)
            )
        );
    });

    it("Should fail to create3 with the same nonce", async function() {
        const expireTime = (await Helper.getBlockTime()) + 2000;
        await debtEngine.create3(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            79999,
            await testModel.encodeData(1200, expireTime)
        );

        await Helper.assertThrow(
            debtEngine.create3(
                testModel.address,
                accounts[0],
                0x0,
                0x0,
                79999,
                await testModel.encodeData(1000, expireTime)
            )
        );
    });

    it("Should create different ids create2 and create3", async function() {
        const expireTime = (await Helper.getBlockTime()) + 2000;
        const id1 = await debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            89999,
            await testModel.encodeData(1001, expireTime)
        );

        const id2 = await debtEngine.create3(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            89999,
            await testModel.encodeData(1001, expireTime)
        );

        assert.notEqual(id1, id2);
    });
    it("Should predict id create 3", async function() {
        let pid = await debtEngine.buildId3(
            accounts[0],
            12200
        );

        let id = await getId(debtEngine.create3(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            12200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        assert.equal(pid, id);
    });
    it("Should predict Ids", async function() {
        let pid1 = await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            0x0,
            12000,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        );

        let id1 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            12000,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        assert.equal(pid1, id1);

        let nonce = await debtEngine.nonces(accounts[0]);
        let pid2 = await debtEngine.buildId(accounts[0], nonce++);
        let id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        assert.equal(pid2, id2);
    });

    it("It should create diferent IDs create2 with any change", async function(){
        let ids = [];

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[1],
            testModel.address,
            0x0,
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            accounts[3],
            0x0,
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            accounts[3],
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            0x1,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            0x0,
            1200,
            await testModel.encodeData(1001, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            0x0,
            1201,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2001)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            accounts[9],
            0x0,
            2200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        assert.equal(new Set(ids).size, 9);
    });

    it("Should generate diferents ids create and create2", async function() {
        let nonce = await debtEngine.nonces(accounts[0]);
        let id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));
        let id2 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            0x0,
            nonce++,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));
        assert.notEqual(id1, id2);
    });

    it("Should pay using an Oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            0xd25aa221,
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
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
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
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
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
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

    it("Should catch and recover from a pay error", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.pay(id, 50, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        // Set the error flag
        await testModel.setErrorFlag(id, 1);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.pay(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 100);
        assert.equal(await debtEngine.getStatus(id), 4);
        assert.equal(await testModel.getPaid(id), 50);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.pay(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

    it("Should catch and recover from a pay error, with an Oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            0xd25aa221,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData2 = await oracle.dummyData2();

        await rcn.setBalance(accounts[0], 25);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.pay(id, 50, accounts[3], dummyData2);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        // Set the error flag
        await testModel.setErrorFlag(id, 1);

        // Try to pay
        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.pay(id, 100, accounts[3], dummyData2);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 50);
        assert.equal(await debtEngine.getStatus(id), 4);
        assert.equal(await testModel.getPaid(id), 50);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.pay(id, 100, accounts[3], dummyData2);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

    it("Should catch and recover from a payToken error", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 50, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        // Set the error flag
        await testModel.setErrorFlag(id, 1);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.payToken(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 100);
        assert.equal(await debtEngine.getStatus(id), 4);
        assert.equal(await testModel.getPaid(id), 50);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.payToken(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

    it("Should catch and recover from a payToken error, with an Oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            0xd25aa221,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData2 = await oracle.dummyData2();

        await rcn.setBalance(accounts[0], 25);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 25, accounts[3], dummyData2);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        // Set the error flag
        await testModel.setErrorFlag(id, 1);

        // Try to pay
        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 50, accounts[3], dummyData2);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 50);
        assert.equal(await debtEngine.getStatus(id), 4);
        assert.equal(await testModel.getPaid(id), 50);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 50, accounts[3], dummyData2);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

    it("Should catch and recover from a pay infinite loop", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.pay(id, 50, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        // Set the error flag
        await testModel.setErrorFlag(id, 2);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.pay(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 100);
        assert.equal(await debtEngine.getStatus(id), 4);
        assert.equal(await testModel.getPaid(id), 50);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.pay(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

    it("Should catch and recover from a pay infinite loop, with an Oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            0xd25aa221,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData2 = await oracle.dummyData2();

        await rcn.setBalance(accounts[0], 25);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.pay(id, 50, accounts[3], dummyData2);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        // Set the error flag
        await testModel.setErrorFlag(id, 2);

        // Try to pay
        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.pay(id, 100, accounts[3], dummyData2);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 50);
        assert.equal(await debtEngine.getStatus(id), 4);
        assert.equal(await testModel.getPaid(id), 50);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.pay(id, 100, accounts[3], dummyData2);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

    it("Should catch and recover from a payToken infinite loop", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 50, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        // Set the error flag
        await testModel.setErrorFlag(id, 2);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.payToken(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 100);
        assert.equal(await debtEngine.getStatus(id), 4);
        assert.equal(await testModel.getPaid(id), 50);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.payToken(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

    it("Should catch and recover from a payToken infinite loop, with an Oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            0xd25aa221,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData2 = await oracle.dummyData2();

        await rcn.setBalance(accounts[0], 25);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 25, accounts[3], dummyData2);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        // Set the error flag
        await testModel.setErrorFlag(id, 2);

        // Try to pay
        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 50, accounts[3], dummyData2);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 50);
        assert.equal(await debtEngine.getStatus(id), 4);
        assert.equal(await testModel.getPaid(id), 50);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 50, accounts[3], dummyData2);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

    it("Should catch a getStatus error", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        // Set the error flag
        await testModel.setErrorFlag(id, 3);

        // Try to read status
        assert.equal(await debtEngine.getStatus(id), 4);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.payToken(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 100);
    });

    it("Should catch a getStatus infinite loop", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        // Set the error flag
        await testModel.setErrorFlag(id, 4);

        // Try to read status
        assert.equal(await debtEngine.getStatus(id), 4);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.payToken(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 100);
    });


    it("Should catch and recover from a run error", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        // Set the error flag
        await testModel.setErrorFlag(id, 6);

        // Run and read status
        await debtEngine.run(id);
        assert.equal(await debtEngine.getStatus(id), 4);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await debtEngine.run(id);

        // Should have failed and the status should be 4
        assert.equal(await debtEngine.getStatus(id), 1);
    });

    it("Should catch and recover from a run infinite loop", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        // Set the error flag
        await testModel.setErrorFlag(id, 7);

        // Run and read status
        await debtEngine.run(id);
        assert.equal(await debtEngine.getStatus(id), 4);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await debtEngine.run(id);

        // Should have failed and the status should be 4
        assert.equal(await debtEngine.getStatus(id), 1);
    });

    it("Should catch a getStatus write storage error", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        // Set the error flag
        await testModel.setErrorFlag(id, 5);

        // Try to read status
        assert.equal(await debtEngine.getStatus(id), 4);

        // Remove the flag
        await testModel.setErrorFlag(id, 0);

        // Try to pay
        await rcn.setBalance(accounts[0], 100);

        await rcn.approve(debtEngine.address, 100);
        await debtEngine.payToken(id, 100, accounts[3], []);

        // Should have failed and the status should be 4
        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 100);
    });

    /*
    * Batch Methods
    */

    it("Should create and pay debts in batch", async function() {
        var ids = [];
        ids[0] = await getId(
            debtEngine.create(
                testModel.address, // model
                accounts[2],       // owner
                0x0,               // oracle
                0x0,               // currency
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000) // data
            )
        );
        ids[1] = await getId(
            debtEngine.create(
                testModel.address, // model
                accounts[2],       // owner
                0x0,               // oracle
                0x0,               // currency
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000) // data
            )
        );
        ids[2] = await getId(
            debtEngine.create(
                testModel.address, // model
                accounts[2],       // owner
                0x0,               // oracle
                0x0,               // currency
                await testModel.encodeData(100, (await Helper.getBlockTime()) + 2000) // data
            )
        );

        var amounts = [4000, 3000, 150];

        await rcn.setBalance(accounts[0], 7150);
        await rcn.approve(debtEngine.address, 7150);

        await debtEngine.payBatch(ids, amounts, 0x0, 0x0, 0x0, []);

        assert.equal(await rcn.balanceOf(accounts[0]), 1050);
        assert.equal(await debtEngine.getStatus(ids[0]), 2);
        assert.equal(await testModel.getPaid(ids[0]), 3000);
    });

    it("Should create and pay a debts using payTokens in batch", async function() {
        var ids = [];
        ids[0] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                0x0,
                0x0,
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
            )
        );
        ids[1] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                0x0,
                0x0,
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
            )
        );
        ids[2] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                0x0,
                0x0,
                await testModel.encodeData(100, (await Helper.getBlockTime()) + 2000)
            )
        );

        var amounts = [4000, 3000, 150];

        await rcn.setBalance(accounts[0], 7150);
        await rcn.approve(debtEngine.address, 7150);

        await debtEngine.payTokenBatch(ids, amounts, 0x0, 0x0, 0x0, []);

        assert.equal(await rcn.balanceOf(accounts[0]), 1050);
        assert.equal(await debtEngine.getStatus(ids[0]), 2);
        assert.equal(await testModel.getPaid(ids[0]), 3000);
    });

    it("Should pay batch using a oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            0xd25aa221,
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData1 = await oracle.dummyData2();

        await rcn.setBalance(accounts[2], 500);
        await rcn.approve(debtEngine.address, 500, { from: accounts[2] });


        await debtEngine.payBatch([id], [1000], accounts[1], oracle.address, 0xd25aa221, dummyData1, { from: accounts[2] });

        assert.equal(await rcn.balanceOf(accounts[2]), 0);
        assert.equal(await testModel.getPaid(id), 1000);
    });

    it("Should pay token batch using a oracle", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            0xd25aa221,
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData1 = await oracle.dummyData2();

        await rcn.setBalance(accounts[2], 500);
        await rcn.approve(debtEngine.address, 500, { from: accounts[2] });


        await debtEngine.payTokenBatch([id], [500], accounts[1], oracle.address, 0xd25aa221, dummyData1, { from: accounts[2] });

        assert.equal(await rcn.balanceOf(accounts[2]), 0);
        assert.equal(await testModel.getPaid(id), 1000);
    });

    // Notice: Keep this test last
    it("Should not be possible to brute-forze an infinite loop", async function() {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 50, accounts[3], []);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 50);

        await rcn.setBalance(accounts[0], 100);
        await rcn.approve(debtEngine.address, 100);

        // Try to pay with different gas limits
        for(i = 0; i < 8000000; i += 100) {
            try {
                await debtEngine.payToken(id, 100, accounts[3], [], { gas: i });
            } catch(ignored) {
            }

            assert.equal(await debtEngine.getStatus(id), 1);
            if (await testModel.getPaid(id) == 150) {
                break;
            }
        }

        // Should have failed and the status should be 1
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });

});
