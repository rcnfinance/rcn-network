const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const TestToken = artifacts.require('./utils/test/TestToken.sol');
const TestOracle = artifacts.require('./examples/TestOracle.sol');
const OracleAdapter = artifacts.require('./diaspore/utils/OracleAdapter.sol');
const TestRateOracle = artifacts.require('./diaspore/utils/test/TestRateOracle.sol');

const Helper = require('../Helper.js');

const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-bignumber')(BigNumber))
    .should();

contract('Test DebtEngine Diaspore', function (accounts) {
    let rcn;
    let debtEngine;
    let testModel;
    let legacyOracle;
    let oracle;
    let testOracle;

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Created2' || l.event === 'Created3' || l.event === 'Created');
        return event.args._id;
    }

    before('Create engine and model', async function () {
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address);
        testModel = await TestModel.new();
        testOracle = await TestRateOracle.new();
        await testModel.setEngine(debtEngine.address);
        legacyOracle = await TestOracle.new();
        oracle = await OracleAdapter.new(
            legacyOracle.address,
            'ARS',
            'Argentine Peso',
            'Test oracle, ripiocredit.network',
            2,
            0x415253,
            rcn.address
        );
    });

    it('Creation should fail if token is not a contract', async function () {
        let err;

        try {
            await DebtEngine.new(accounts[2]);
        } catch (e) {
            err = e;
        }

        assert.ok(err);
    });

    it('Should fail to create if model returned false', async function () {
        await testModel.setGlobalErrorFlag(8);

        await Helper.assertThrow(debtEngine.create(
            testModel.address,
            accounts[1],
            0x0,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 1000)
        ));

        await testModel.setGlobalErrorFlag(0);
    });

    it('Should fail to create2 if model returned false', async function () {
        await testModel.setGlobalErrorFlag(8);

        await Helper.assertThrow(debtEngine.create2(
            testModel.address,
            accounts[1],
            0x0,
            9489342,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 1000)
        ));

        await testModel.setGlobalErrorFlag(0);
    });

    it('Should fail to create3 if model returned false', async function () {
        await testModel.setGlobalErrorFlag(8);

        await Helper.assertThrow(debtEngine.create3(
            testModel.address,
            accounts[1],
            0x0,
            948934233,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 1000)
        ));

        await testModel.setGlobalErrorFlag(0);
    });

    it('Should create a debt using create', async function () {
        await debtEngine.create(
            testModel.address,
            accounts[1],
            0x0,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 1000)
        );

        assert.equal(await debtEngine.balanceOf(accounts[1]), 1, 'Account 1 should have a new asset');
    });

    it('Should create 2 debts using create2', async function () {
        await debtEngine.create2(
            testModel.address,
            accounts[1],
            0x0,
            8000000,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        );

        assert.equal(await debtEngine.balanceOf(accounts[1]), 2, 'Account 1 should have a new asset');

        await debtEngine.create2(
            testModel.address,
            accounts[2],
            0x0,
            8000001,
            await testModel.encodeData(2000, (await Helper.getBlockTime()) + 3000)
        );

        assert.equal(await debtEngine.balanceOf(accounts[2]), 1, 'Account 1 should have a new asset');
    });

    it('Should create and pay a debt', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should create and pay a debt using payToken', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Differents debt engine should give differents ids, create', async function () {
        const engine1 = await DebtEngine.new(rcn.address);
        const engine2 = await DebtEngine.new(rcn.address);

        await testModel.setEngine(engine1.address);

        const id1 = await getId(engine1.create(
            testModel.address,
            accounts[0],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setEngine(engine2.address);

        const id2 = await getId(engine2.create(
            testModel.address,
            accounts[0],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setEngine(debtEngine.address);

        assert.notEqual(id1, id2);
    });

    it('Differents debt engine should give differents ids, create2', async function () {
        const engine1 = await DebtEngine.new(rcn.address);
        const engine2 = await DebtEngine.new(rcn.address);

        await testModel.setEngine(engine1.address);

        const id1 = await getId(engine1.create2(
            testModel.address,
            accounts[0],
            0x0,
            768484844,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setEngine(engine2.address);

        const id2 = await getId(engine2.create2(
            testModel.address,
            accounts[0],
            0x0,
            768484844,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setEngine(debtEngine.address);

        assert.notEqual(id1, id2);
    });

    it('Differents debt engine should give differents ids, create3', async function () {
        const engine1 = await DebtEngine.new(rcn.address);
        const engine2 = await DebtEngine.new(rcn.address);

        await testModel.setEngine(engine1.address);

        const id1 = await getId(engine1.create3(
            testModel.address,
            accounts[0],
            0x0,
            768484844,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setEngine(engine2.address);

        const id2 = await getId(engine2.create3(
            testModel.address,
            accounts[0],
            0x0,
            768484844,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setEngine(debtEngine.address);

        assert.notEqual(id1, id2);
    });

    it('Should withdraw funds from payment', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
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

    it('Funds should follow the debt', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
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

    it('Should withdraw funds from multiple debts', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
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

    it('Should withdraw partial payments, authorized', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
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

    it('Should fail to create2 with the same nonce', async function () {
        const expireTime = (await Helper.getBlockTime()) + 2000;
        await debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            9999,
            await testModel.encodeData(1000, expireTime)
        );

        await Helper.assertThrow(
            debtEngine.create2(
                testModel.address,
                accounts[0],
                0x0,
                9999,
                await testModel.encodeData(1000, expireTime)
            )
        );
    });

    it('Should fail to create3 with the same nonce', async function () {
        const expireTime = (await Helper.getBlockTime()) + 2000;
        await debtEngine.create3(
            testModel.address,
            accounts[0],
            0x0,
            79999,
            await testModel.encodeData(1200, expireTime)
        );

        await Helper.assertThrow(
            debtEngine.create3(
                testModel.address,
                accounts[0],
                0x0,
                79999,
                await testModel.encodeData(1000, expireTime)
            )
        );
    });

    it('Should create different ids create2 and create3', async function () {
        const expireTime = (await Helper.getBlockTime()) + 2000;
        const id1 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            89999,
            await testModel.encodeData(1001, expireTime)
        ));

        const id2 = await getId(debtEngine.create3(
            testModel.address,
            accounts[0],
            0x0,
            89999,
            await testModel.encodeData(1001, expireTime)
        ));

        assert.notEqual(id1, id2);
    });
    it('Should predict id create 3', async function () {
        const pid = await debtEngine.buildId3(
            accounts[0],
            12200
        );

        const id = await getId(debtEngine.create3(
            testModel.address,
            accounts[0],
            0x0,
            12200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        assert.equal(pid, id);
    });
    it('Should predict Ids', async function () {
        const pid1 = await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            12000,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        );

        const id1 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            12000,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        assert.equal(pid1, id1);

        let nonce = await debtEngine.nonces(accounts[0]);
        const pid2 = await debtEngine.buildId(accounts[0], nonce++);
        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        assert.equal(pid2, id2);
    });

    it('It should create diferent IDs create2 with any change', async function () {
        const ids = [];

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[1],
            testModel.address,
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            accounts[3],
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            accounts[3],
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2200)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            1200,
            await testModel.encodeData(1001, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            1201,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            0x0,
            1200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2001)
        ));

        ids.push(await debtEngine.buildId2(
            accounts[0],
            testModel.address,
            accounts[9],
            2200,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));

        assert.equal(new Set(ids).size, 9);
    });

    it('Should generate diferents ids create and create2', async function () {
        let nonce = await debtEngine.nonces(accounts[0]);
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            0x0,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));
        const id2 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            0x0,
            nonce++,
            await testModel.encodeData(1000, (await Helper.getBlockTime()) + 2000)
        ));
        assert.notEqual(id1, id2);
    });

    it('Should pay using an Oracle', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData1 = await legacyOracle.dummyData1();
        const dummyData2 = await legacyOracle.dummyData2();

        await rcn.setBalance(accounts[2], 60000);
        await rcn.approve(debtEngine.address, 60000, { from: accounts[2] });
        await debtEngine.pay(id, 10, accounts[1], dummyData1, { from: accounts[2] });

        assert.equal((await rcn.balanceOf(accounts[2])).toNumber(), 0);
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

    it('Should pay using an Oracle and withdraw', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData1 = await legacyOracle.dummyData1();
        const dummyData2 = await legacyOracle.dummyData2();

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

    it('Should payToken using an Oracle', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData1 = await legacyOracle.dummyData1();
        const dummyData2 = await legacyOracle.dummyData2();

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

    it('Should catch and recover from a pay error', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should catch and recover from a pay error, with an Oracle', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData2 = await legacyOracle.dummyData2();

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

    it('Should catch and recover from a payToken error', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should catch and recover from a payToken error, with an Oracle', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData2 = await legacyOracle.dummyData2();

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

    it('Should catch and recover from a pay infinite loop', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should catch and recover from a pay infinite loop, with an Oracle', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData2 = await legacyOracle.dummyData2();

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

    it('Should catch and recover from a payToken infinite loop', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should catch and recover from a payToken infinite loop, with an Oracle', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData2 = await legacyOracle.dummyData2();

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

    it('Should catch a getStatus error', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should catch a getStatus infinite loop', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should catch and recover from a run error', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should catch and recover from a run infinite loop', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should catch a getStatus write storage error', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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

    it('Should create and pay debts in batch', async function () {
        const ids = [];
        ids[0] = await getId(
            debtEngine.create(
                testModel.address, // model
                accounts[2],       // owner
                0x0,               // oracle
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000) // data
            )
        );
        ids[1] = await getId(
            debtEngine.create(
                testModel.address, // model
                accounts[2],       // owner
                0x0,               // oracle
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000) // data
            )
        );
        ids[2] = await getId(
            debtEngine.create(
                testModel.address, // model
                accounts[2],       // owner
                0x0,               // oracle
                await testModel.encodeData(100, (await Helper.getBlockTime()) + 2000) // data
            )
        );

        const amounts = [4000, 3000, 150];

        await rcn.setBalance(accounts[0], 7150);
        await rcn.approve(debtEngine.address, 7150);

        await debtEngine.payBatch(ids, amounts, 0x0, 0x0, []);

        assert.equal(await rcn.balanceOf(accounts[0]), 1050);
        assert.equal(await debtEngine.getStatus(ids[0]), 2);
        assert.equal(await testModel.getPaid(ids[0]), 3000);
    });

    it('Should create and pay a debts using payTokens in batch', async function () {
        const ids = [];
        ids[0] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                0x0,
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
            )
        );
        ids[1] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                0x0,
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
            )
        );
        ids[2] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                0x0,
                await testModel.encodeData(100, (await Helper.getBlockTime()) + 2000)
            )
        );

        const amounts = [4000, 3000, 150];

        await rcn.setBalance(accounts[0], 7150);
        await rcn.approve(debtEngine.address, 7150);

        await debtEngine.payTokenBatch(ids, amounts, 0x0, 0x0, []);

        assert.equal(await rcn.balanceOf(accounts[0]), 1050);
        assert.equal(await debtEngine.getStatus(ids[0]), 2);
        assert.equal(await testModel.getPaid(ids[0]), 3000);
    });

    it('Should pay batch using a oracle', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData1 = await legacyOracle.dummyData2();

        await rcn.setBalance(accounts[2], 500);
        await rcn.approve(debtEngine.address, 500, { from: accounts[2] });

        await debtEngine.payBatch([id], [1000], accounts[1], oracle.address, dummyData1, { from: accounts[2] });

        assert.equal(await rcn.balanceOf(accounts[2]), 0);
        assert.equal(await testModel.getPaid(id), 1000);
    });

    it('Should pay token batch using a oracle', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(10000, (await Helper.getBlockTime()) + 2000)
        ));

        const dummyData1 = await legacyOracle.dummyData2();

        await rcn.setBalance(accounts[2], 500);
        await rcn.approve(debtEngine.address, 500, { from: accounts[2] });

        await debtEngine.payTokenBatch([id], [500], accounts[1], oracle.address, dummyData1, { from: accounts[2] });

        assert.equal(await rcn.balanceOf(accounts[2]), 0);
        assert.equal(await testModel.getPaid(id), 1000);
    });

    it('Pay 0 loans should make no change', async function () {
        await rcn.setBalance(accounts[2], 0);
        await debtEngine.payBatch(
            [],
            [],
            accounts[1],
            0x0,
            0x0,
            { from: accounts[2] }
        );
    });

    it('Should fail because are different size input arrays (payBatch, payTokenBatch)', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));
        await Helper.assertThrow(
            debtEngine.payBatch(
                [id],
                [10, 20],
                accounts[1],
                oracle.address,
                0x0,
                { from: accounts[2] }
            )
        );
        await Helper.assertThrow(
            debtEngine.payBatch(
                [id, id],
                [10],
                accounts[1],
                oracle.address,
                0x0,
                { from: accounts[2] }
            )
        );
        await Helper.assertThrow(
            debtEngine.payTokenBatch(
                [id],
                [10, 20],
                accounts[1],
                oracle.address,
                0x0,
                { from: accounts[2] }
            )
        );
        await Helper.assertThrow(
            debtEngine.payTokenBatch(
                [id, id],
                [10],
                accounts[1],
                oracle.address,
                0x0,
                { from: accounts[2] }
            )
        );
    });

    it('Should not pay the third debt because not correspond the currency and oracle.', async function () {
        const ids = [];
        ids[0] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                0x0,
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
            )
        );
        ids[1] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
            )
        );
        ids[2] = await getId(
            debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(100, (await Helper.getBlockTime()) + 2000)
            )
        );

        const amounts = [4000, 3000, 150];

        await rcn.setBalance(accounts[0], 7150);
        await rcn.approve(debtEngine.address, 7150);

        await debtEngine.payTokenBatch(ids, amounts, 0x0, 0x0, []);

        assert.equal(await rcn.balanceOf(accounts[0]), 4150);
        assert.equal(await debtEngine.getStatus(ids[0]), 2);
        assert.equal(await testModel.getPaid(ids[0]), 3000);
    });

    it('Should apply rate even when tokens is not divisible by 10', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        // 0.82711175222132156792 ETH = 4000.23333566612312 RCN
        const data = await testOracle.encodeRate(400023333566612312000000, 82711175222132156792);

        await rcn.setBalance(accounts[0], 4836388);
        await rcn.approve(debtEngine.address, 4836388);

        await debtEngine.pay(id, 1000, 0x0, data);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
    });

    it('Should apply rate with token more expensive than currency', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        // 1.22 RCN = 22.94 ETH :)
        const data = await testOracle.encodeRate(122, 2294);

        await rcn.setBalance(accounts[0], '53182214472537054');
        await rcn.approve(debtEngine.address, '53182214472537054');

        await debtEngine.pay(id, web3.toWei(1), 0x0, data);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
    });

    it('Should apply rate pay tokens even when tokens is not divisible by 10', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        // 2.82711175222132156792 ETH = 4010.23333566612312 RCN
        const data = await testOracle.encodeRate(401023333566612312000000, 282711175222132156792);

        await rcn.setBalance(accounts[0], web3.toWei(1));
        await rcn.approve(debtEngine.address, web3.toWei(1));

        await debtEngine.payToken(id, web3.toWei(1), 0x0, data);

        assert.equal(await rcn.balanceOf(accounts[0]), 248);
        assert.equal(await testModel.getPaid(id), 704974378193313);
    });

    it('Should apply rate pay tokens with token more expensive than currency', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        // 4.122224 RCN = 0.5 ETH :)
        const data = await testOracle.encodeRate(41222240, 5);

        await rcn.setBalance(accounts[0], web3.toWei(2));
        await rcn.approve(debtEngine.address, web3.toWei(2));

        await debtEngine.payToken(id, web3.toWei(2), 0x0, data);

        assert.equal(await rcn.balanceOf(accounts[0]), 1834816);
        assert.equal(await testModel.getPaid(id), 242587496458);
    });

    it('Should apply rate pay batch with token more expensive than currency', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        // 1.22 RCN = 22.94 ETH :)
        const data = await testOracle.encodeRate(122, 2294);

        await rcn.setBalance(accounts[0], '53182214472537054');
        await rcn.approve(debtEngine.address, web3.toWei(1));

        await debtEngine.payBatch([id], [web3.toWei(1)], 0x0, testOracle.address, data);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
    });

    it('Should apply rate pay batch tokens even when tokens is not divisible by 10', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        // 2.82711175222132156792 ETH = 4010.23333566612312 RCN
        const data = await testOracle.encodeRate(401023333566612312000000, 282711175222132156792);

        await rcn.setBalance(accounts[0], web3.toWei(1));
        await rcn.approve(debtEngine.address, web3.toWei(1));

        await debtEngine.payTokenBatch([id], [web3.toWei(1)], 0x0, testOracle.address, data);

        assert.equal(await rcn.balanceOf(accounts[0]), 248);
        assert.equal(await testModel.getPaid(id), 704974378193313);
    });

    it('Should apply rate pay batch tokens with token more expensive than currency', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        // 4.122224 RCN = 0.5 ETH :)
        const data = await testOracle.encodeRate(41222240, 5);

        await rcn.setBalance(accounts[0], web3.toWei(2));
        await rcn.approve(debtEngine.address, web3.toWei(2));

        await debtEngine.payTokenBatch([id], [web3.toWei(2)], 0x0, testOracle.address, data);

        assert.equal(await rcn.balanceOf(accounts[0]), 1834816);
        assert.equal(await testModel.getPaid(id), 242587496458);
    });

    it('Calling pay, payTokens, payBatch or payBatchTokens should get the same rate', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        const id3 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        const id4 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        // 4 RCN = 22.94 ETH :)
        const data = await testOracle.encodeRate(4, 2294);

        await rcn.setBalance(accounts[0], web3.toWei(2000));
        await rcn.approve(debtEngine.address, web3.toWei(2000));

        await debtEngine.payToken(id1, web3.toWei(1), 0x0, data);
        await debtEngine.payTokenBatch([id3], [web3.toWei(1)], 0x0, testOracle.address, data);

        const paid1 = await testModel.getPaid(id1);
        paid1.should.be.bignumber.equal(await testModel.getPaid(id3));

        await debtEngine.pay(id2, paid1, 0x0, data);
        await debtEngine.payBatch([id4], [paid1], 0x0, testOracle.address, data);

        paid1.should.be.bignumber.equal(await testModel.getPaid(id4));
        paid1.should.be.bignumber.equal(await testModel.getPaid(id2));
    });

    it('Pay should fail if rate includes zero', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        let data = await testOracle.encodeRate(0, 82711175222132156792);

        await rcn.setBalance(accounts[0], 10 ** 32);
        await rcn.approve(debtEngine.address, 10 ** 32);

        await Helper.assertThrow(debtEngine.pay(id, 1000, 0x0, data));

        assert.equal(await rcn.balanceOf(accounts[0]), 10 ** 32);
        assert.equal(await testModel.getPaid(id), 0);

        data = await testOracle.encodeRate(14123, 0);

        await Helper.assertThrow(debtEngine.pay(id, 1000, 0x0, data));

        assert.equal(await rcn.balanceOf(accounts[0]), 10 ** 32);
        assert.equal(await testModel.getPaid(id), 0);
    });

    it('Pay tokens fail if rate includes zero', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(web3.toWei('900000'), (await Helper.getBlockTime()) + 2000)
        ));

        let data = await testOracle.encodeRate(0, 82711175222132156792);

        await rcn.setBalance(accounts[0], 10 ** 32);
        await rcn.approve(debtEngine.address, 10 ** 32);

        await Helper.assertThrow(debtEngine.payToken(id, 1000, 0x0, data));

        assert.equal(await rcn.balanceOf(accounts[0]), 10 ** 32);
        assert.equal(await testModel.getPaid(id), 0);

        data = await testOracle.encodeRate(14123, 0);

        await Helper.assertThrow(debtEngine.payToken(id, 1000, 0x0, data));

        assert.equal(await rcn.balanceOf(accounts[0]), 10 ** 32);
        assert.equal(await testModel.getPaid(id), 0);
    });

    it('Pay should fail if paid is more than requested', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 10000);
        await rcn.approve(debtEngine.address, 10000);

        const prevBalance = await rcn.balanceOf(accounts[0]);

        await testModel.setErrorFlag(id, 9);

        await Helper.assertThrow(debtEngine.pay(id, 100, 0x0, 0x0));

        assert.equal(await testModel.getPaid(id), 0);
        assert.equal((await rcn.balanceOf(accounts[0])).toNumber(), prevBalance.toNumber());
    });

    it('Pay tokens should fail if paid is more than requested', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 10000);
        await rcn.approve(debtEngine.address, 10000);

        const prevBalance = await rcn.balanceOf(accounts[0]);

        await testModel.setErrorFlag(id, 9);

        await Helper.assertThrow(debtEngine.payToken(id, 100, 0x0, 0x0));

        assert.equal(await testModel.getPaid(id), 0);
        assert.equal((await rcn.balanceOf(accounts[0])).toNumber(), prevBalance.toNumber());
    });

    it('Pay batch should fail if one debt paid is more than requested', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 10000);
        await rcn.approve(debtEngine.address, 10000);

        const prevBalance = await rcn.balanceOf(accounts[0]);

        await testModel.setErrorFlag(id1, 9);

        await Helper.assertThrow(debtEngine.payBatch([id1, id2], [1000, 1000], 0x0, 0x0, []));

        assert.equal(await testModel.getPaid(id1), 0);
        assert.equal(await testModel.getPaid(id2), 0);
        assert.equal((await rcn.balanceOf(accounts[0])).toNumber(), prevBalance.toNumber());
    });

    it('Pay tokens batch should fail if one debt paid is more than requested', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 10000);
        await rcn.approve(debtEngine.address, 10000);

        const prevBalance = await rcn.balanceOf(accounts[0]);

        await testModel.setErrorFlag(id2, 9);

        await Helper.assertThrow(debtEngine.payTokenBatch([id1, id2], [1000, 1000], 0x0, 0x0, []));

        assert.equal(await testModel.getPaid(id1), 0);
        assert.equal(await testModel.getPaid(id2), 0);
        assert.equal((await rcn.balanceOf(accounts[0])).toNumber(), prevBalance.toNumber());
    });

    it('Pay should fail if payer has not enought balance', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 1000);
        await rcn.approve(debtEngine.address, 1000);

        await Helper.assertThrow(debtEngine.pay(id, 2000, 0x0, 0x0));

        assert.equal(await testModel.getPaid(id), 0);
    });

    it('Pay tokens should fail if payer has not enought balance', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 1000);
        await rcn.approve(debtEngine.address, 1000);

        await Helper.assertThrow(debtEngine.payToken(id, 2000, 0x0, 0x0));

        assert.equal(await testModel.getPaid(id), 0);
    });

    it('Pay batch should fail if payer has balance for zero payments', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 500);
        await rcn.approve(debtEngine.address, 500);

        await Helper.assertThrow(debtEngine.payBatch([id1, id2], [1000, 1000], 0x0, 0x0, []));

        assert.equal(await testModel.getPaid(id1), 0);
        assert.equal(await testModel.getPaid(id2), 0);
    });

    it('Pay tokens batch should fail if payer has balance for zero payments', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 500);
        await rcn.approve(debtEngine.address, 500);

        await Helper.assertThrow(debtEngine.payTokenBatch([id1, id2], [1000, 1000], 0x0, 0x0, []));

        assert.equal(await testModel.getPaid(id1), 0);
        assert.equal(await testModel.getPaid(id2), 0);
    });

    it('Pay batch should fail if payer has balance below total', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 1500);
        await rcn.approve(debtEngine.address, 1500);

        await Helper.assertThrow(debtEngine.payBatch([id1, id2], [1000, 1000], 0x0, 0x0, []));

        assert.equal(await testModel.getPaid(id1), 0);
        assert.equal(await testModel.getPaid(id2), 0);
    });

    it('Pay tokens batch should fail if payer has balance below total', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 1500);
        await rcn.approve(debtEngine.address, 1500);

        await Helper.assertThrow(debtEngine.payTokenBatch([id1, id2], [1000, 1000], 0x0, 0x0, []));

        assert.equal(await testModel.getPaid(id1), 0);
        assert.equal(await testModel.getPaid(id2), 0);
    });

    it('Pay shoud not overflow the debt balance', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(10, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setErrorFlag(id, 10);

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.pay(id, 3000, 0x0, 0x0);

        const debt = await debtEngine.debts(id);
        assert.equal(debt[1], 3000);

        await rcn.setBalance(accounts[0], 2 ** 129);
        await rcn.approve(debtEngine.address, 2 ** 129);

        await Helper.assertThrow(debtEngine.pay(id, 2 ** 129, 0x0, 0x0));

        const ndebt = await debtEngine.debts(id);
        assert.equal(ndebt[1], 3000);

        await rcn.setBalance(accounts[2], 0);
        await debtEngine.withdrawal(id, accounts[2], { from: accounts[2] });
        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
    });

    it('Pay token shoud not overflow the debt balance', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(10, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setErrorFlag(id, 10);

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.payToken(id, 3000, 0x0, 0x0);

        const debt = await debtEngine.debts(id);
        assert.equal(debt[1], 3000);

        await rcn.setBalance(accounts[0], 2 ** 130);
        await rcn.approve(debtEngine.address, 2 ** 130);

        await Helper.assertThrow(debtEngine.payToken(id, 2 ** 129, 0x0, 0x0));

        const ndebt = await debtEngine.debts(id);
        assert.equal(ndebt[1], 3000);

        await rcn.setBalance(accounts[2], 0);
        await debtEngine.withdrawal(id, accounts[2], { from: accounts[2] });
        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
    });

    it('Pay batch shoud not overflow the debt balance', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(10, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setErrorFlag(id, 10);

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.pay(id, 3000, 0x0, 0x0);

        const debt = await debtEngine.debts(id);
        assert.equal(debt[1], 3000);

        await rcn.setBalance(accounts[0], 2 ** 130);
        await rcn.approve(debtEngine.address, 2 ** 130);

        await Helper.assertThrow(debtEngine.payBatch([id2, id], [10, 2 ** 129], 0x0, 0x0, []));

        assert.equal((await testModel.getPaid(id)).toNumber(), 3000);
        assert.equal(await testModel.getPaid(id2), 0);

        const ndebt = await debtEngine.debts(id);
        assert.equal(ndebt[1], 3000);

        await rcn.setBalance(accounts[2], 0);
        await debtEngine.withdrawal(id, accounts[2], { from: accounts[2] });
        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
    });

    it('Pay token batch shoud not overflow the debt balance', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(10, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await testModel.setErrorFlag(id, 10);

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.pay(id, 3000, 0x0, 0x0);

        const debt = await debtEngine.debts(id);
        assert.equal(debt[1], 3000);

        await rcn.setBalance(accounts[0], 2 ** 129);
        await rcn.approve(debtEngine.address, 2 ** 129);

        await Helper.assertThrow(debtEngine.payTokenBatch([id2, id], [10, 2 ** 129], 0x0, 0x0, []));

        assert.equal(await testModel.getPaid(id), 3000);
        assert.equal(await testModel.getPaid(id2), 0);

        const ndebt = await debtEngine.debts(id);
        assert.equal(ndebt[1], 3000);

        await rcn.setBalance(accounts[2], 0);
        await debtEngine.withdrawal(id, accounts[2], { from: accounts[2] });
        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
    });

    it('Should fail withdraw not authorized', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.pay(id, 3000, 0x0, 0x0);

        await rcn.setBalance(accounts[3], 0);
        await rcn.setBalance(accounts[2], 0);
        await Helper.assertThrow(debtEngine.withdrawal(id, accounts[3], { from: accounts[3] }));
        await Helper.assertThrow(debtEngine.withdrawal(id, accounts[2], { from: accounts[3] }));

        assert.equal(await rcn.balanceOf(accounts[3]), 0);
        assert.equal(await rcn.balanceOf(accounts[2]), 0);

        await debtEngine.withdrawal(id, accounts[2], { from: accounts[2] });
        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
        await debtEngine.withdrawal(id, accounts[2], { from: accounts[2] });
        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
    });

    it('Should fail withdraw if debt engine has no funds', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.pay(id, 3000, 0x0, 0x0);

        const auxBalance = await rcn.balanceOf(debtEngine.address);
        await rcn.setBalance(debtEngine.address, 0);

        await rcn.setBalance(accounts[2], 0);
        await Helper.assertThrow(debtEngine.withdrawal(id, accounts[2], { from: accounts[2] }));

        assert.equal(await rcn.balanceOf(accounts[2]), 0);

        await rcn.setBalance(debtEngine.address, auxBalance);
    });

    it('Should fail withdraw batch if debt engine has no funds', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.payBatch([id, id2], [1500, 1500], 0x0, 0x0, 0x0);

        const auxBalance = await rcn.balanceOf(debtEngine.address);
        await rcn.setBalance(debtEngine.address, 0);

        await rcn.setBalance(accounts[2], 0);
        await Helper.assertThrow(debtEngine.withdrawalList([id, id2], accounts[2], { from: accounts[2] }));

        assert.equal(await rcn.balanceOf(accounts[2]), 0);

        await rcn.setBalance(debtEngine.address, auxBalance);
    });

    it('Should fail withdraw batch not authorized', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.payBatch([id1, id2], [1500, 1500], 0x0, 0x0, 0x0);

        await rcn.setBalance(accounts[3], 0);
        await rcn.setBalance(accounts[2], 0);
        await debtEngine.withdrawalList([id1, id2], accounts[3], { from: accounts[3] });
        await debtEngine.withdrawalList([id1, id2], accounts[2], { from: accounts[3] });

        assert.equal(await rcn.balanceOf(accounts[3]), 0);
        assert.equal(await rcn.balanceOf(accounts[2]), 0);

        await debtEngine.withdrawalList([id1, id2], accounts[2], { from: accounts[2] });
        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
        await debtEngine.withdrawalList([id1, id2], accounts[2], { from: accounts[2] });
        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
    });

    it('Should fail withdraw batch not authorized mixed', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[4],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.payBatch([id1, id2], [1500, 1500], 0x0, 0x0, 0x0);

        await rcn.setBalance(accounts[3], 0);
        await rcn.setBalance(accounts[2], 0);
        await debtEngine.withdrawalList([id1, id2], accounts[3], { from: accounts[3] });
        await debtEngine.withdrawalList([id1, id2], accounts[2], { from: accounts[3] });

        assert.equal(await rcn.balanceOf(accounts[3]), 0);
        assert.equal(await rcn.balanceOf(accounts[2]), 0);

        await rcn.setBalance(accounts[4], 0);
        await debtEngine.withdrawalList([id1, id2], accounts[4], { from: accounts[4] });

        assert.equal(await rcn.balanceOf(accounts[4]), 1500);
    });

    it('Pay batch multiple times multiple id should be like paying the sum', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.payBatch([id1, id1, id2], [1000, 1000, 500], 0x0, 0x0, []);

        assert.equal(await rcn.balanceOf(accounts[0]), 500);
        assert.equal(await testModel.getPaid(id1), 2000);
        assert.equal(await testModel.getPaid(id2), 500);

        const debt1 = await debtEngine.debts(id1);
        assert.equal(debt1[1], 2000);

        const debt2 = await debtEngine.debts(id2);
        assert.equal(debt2[1], 500);
    });

    it('Pay tokens batch multiple times multiple id should be like paying the sum', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.payTokenBatch([id1, id2, id1], [1000, 500, 1000], 0x0, 0x0, []);

        assert.equal(await rcn.balanceOf(accounts[0]), 500);
        assert.equal(await testModel.getPaid(id1), 2000);
        assert.equal(await testModel.getPaid(id2), 500);

        const debt1 = await debtEngine.debts(id1);
        assert.equal(debt1[1], 2000);

        const debt2 = await debtEngine.debts(id2);
        assert.equal(debt2[1], 500);
    });

    it('Withdraw multiple times same id should make no difference', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            0x0,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        await rcn.setBalance(accounts[0], 3000);
        await rcn.approve(debtEngine.address, 3000);

        await debtEngine.payBatch([id, id2], [1500, 1500], 0x0, 0x0, 0x0);

        await rcn.setBalance(accounts[2], 0);
        await debtEngine.withdrawalList([id, id, id2, id, id, id, id], accounts[2], { from: accounts[2] });

        assert.equal(await rcn.balanceOf(accounts[2]), 3000);
    });

    it('Withdraw zero debts should have no effect', async function () {
        await rcn.setBalance(accounts[7], 0);
        await debtEngine.withdrawalList([], accounts[7], { from: accounts[7] });
        assert.equal(await rcn.balanceOf(accounts[7]), 0);
    });

    it('Should pay batch with tokens less expensive than currency', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[4],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const data = await legacyOracle.dummyData3();

        await rcn.setBalance(accounts[0], 6000);
        await rcn.approve(debtEngine.address, 6000);

        await debtEngine.payBatch([id1, id2], [2000, 1000], accounts[4], oracle.address, data);

        assert.equal(await testModel.getPaid(id1), 2000);
        assert.equal(await testModel.getPaid(id2), 1000);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
    });

    it('Pay batch should emit pay event', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[4],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const data = await legacyOracle.dummyData2();

        await rcn.setBalance(accounts[0], 1500);
        await rcn.approve(debtEngine.address, 1500);

        const receipt = await debtEngine.payBatch([id1, id2], [2000, 1000], accounts[4], oracle.address, data);

        // Test read oracle event
        const oracleEvent = receipt.logs.find((l) => l.event === 'ReadedOracleBatch');
        assert.isOk(oracleEvent);
        oracleEvent.args._count.should.be.bignumber.equal(2);
        oracleEvent.args._tokens.should.be.bignumber.equal(5);
        oracleEvent.args._equivalent.should.be.bignumber.equal(10);

        // Test paid events
        const paidLogs = receipt.logs.filter((l) => l.event === 'Paid');
        paidLogs.length.should.be.equal(2);
        paidLogs.filter((e) => e.args._id === id1).length.should.be.equal(1);
        paidLogs.filter((e) => e.args._id === id2).length.should.be.equal(1);
        paidLogs.forEach((event) => {
            switch (event.args._id) {
            case id1:
                const args = event.args;
                args._requested.should.be.bignumber.equal(2000);
                args._requestedTokens.should.be.bignumber.equal(0);
                args._paid.should.be.bignumber.equal(2000);
                args._tokens.should.be.bignumber.equal(1000);
                args._sender.should.be.equal(accounts[0]);
                args._origin.should.be.equal(accounts[4]);
                break;
            case id2:
                const args2 = event.args;
                args2._requested.should.be.bignumber.equal(1000);
                args2._requestedTokens.should.be.bignumber.equal(0);
                args2._paid.should.be.bignumber.equal(1000);
                args2._tokens.should.be.bignumber.equal(500);
                args2._sender.should.be.equal(accounts[0]);
                args2._origin.should.be.equal(accounts[4]);
                break;
            }
        });
    });

    it('Pay token batch should emit pay event', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[4],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const data = await legacyOracle.dummyData2();

        await rcn.setBalance(accounts[0], 1500);
        await rcn.approve(debtEngine.address, 1500);

        const receipt = await debtEngine.payTokenBatch([id1, id2], [1000, 500], accounts[4], oracle.address, data);

        // Test read oracle event
        const oracleEvent = receipt.logs.find((l) => l.event === 'ReadedOracleBatch');
        assert.isOk(oracleEvent);
        oracleEvent.args._count.should.be.bignumber.equal(2);
        oracleEvent.args._tokens.should.be.bignumber.equal(5);
        oracleEvent.args._equivalent.should.be.bignumber.equal(10);

        // Test paid events
        const paidLogs = receipt.logs.filter((l) => l.event === 'Paid');
        paidLogs.length.should.be.equal(2);
        paidLogs.filter((e) => e.args._id === id1).length.should.be.equal(1);
        paidLogs.filter((e) => e.args._id === id2).length.should.be.equal(1);
        paidLogs.forEach((event) => {
            switch (event.args._id) {
            case id1:
                const args = event.args;
                args._requested.should.be.bignumber.equal(0);
                args._requestedTokens.should.be.bignumber.equal(1000);
                args._paid.should.be.bignumber.equal(2000);
                args._tokens.should.be.bignumber.equal(1000);
                args._sender.should.be.equal(accounts[0]);
                args._origin.should.be.equal(accounts[4]);
                break;
            case id2:
                const args2 = event.args;
                args2._requested.should.be.bignumber.equal(0);
                args2._requestedTokens.should.be.bignumber.equal(500);
                args2._paid.should.be.bignumber.equal(1000);
                args2._tokens.should.be.bignumber.equal(500);
                args2._sender.should.be.equal(accounts[0]);
                args2._origin.should.be.equal(accounts[4]);
                break;
            }
        });
    });

    it('Should pay tokens batch with tokens less expensive than currency', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[4],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const data = await legacyOracle.dummyData3();

        await rcn.setBalance(accounts[0], 6000);
        await rcn.approve(debtEngine.address, 6000);

        await debtEngine.payTokenBatch([id1, id2], [4000, 2000], accounts[4], oracle.address, data);

        assert.equal(await testModel.getPaid(id1), 2000);
        assert.equal(await testModel.getPaid(id2), 1000);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
    });

    it('Should pay batch with tokens more expensive than currency', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[4],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const data = await legacyOracle.dummyData2();

        await rcn.setBalance(accounts[0], 1500);
        await rcn.approve(debtEngine.address, 1500);

        await debtEngine.payBatch([id1, id2], [2000, 1000], accounts[4], oracle.address, data);

        assert.equal(await testModel.getPaid(id1), 2000);
        assert.equal(await testModel.getPaid(id2), 1000);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
    });

    it('Should pay tokens batch with tokens more expensive than currency', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[4],
            oracle.address,
            await testModel.encodeData(3000, (await Helper.getBlockTime()) + 2000)
        ));

        const data = await legacyOracle.dummyData2();

        await rcn.setBalance(accounts[0], 1500);
        await rcn.approve(debtEngine.address, 1500);

        await debtEngine.payTokenBatch([id1, id2], [1000, 500], accounts[4], oracle.address, data);

        assert.equal(await testModel.getPaid(id1), 2000);
        assert.equal(await testModel.getPaid(id2), 1000);

        assert.equal(await rcn.balanceOf(accounts[0]), 0);
    });

    it('Should always round in favor of the owner', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            testOracle.address,
            await testModel.encodeData(10, (await Helper.getBlockTime()) + 2000)
        ));

        // 2 ETH = 1 RCN
        const data = await testOracle.encodeRate(1, 2);

        await rcn.setBalance(accounts[0], 0);
        await rcn.approve(debtEngine.address, 0);

        await Helper.assertThrow(debtEngine.pay(id, 1, 0x0, data));

        (await testModel.getPaid(id)).should.be.bignumber.equal(0);
    });

    // Notice: Keep this test last
    it('Should not be possible to brute-forze an infinite loop', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
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
        for (let i = 20000; i < 8000000; i += 1010) {
            try {
                await debtEngine.payToken(id, 100, accounts[3], [], { gas: i });
            } catch (ignored) {
            }

            assert.equal(await debtEngine.getStatus(id), 1);
            // eslint-disable-next-line eqeqeq
            if (await testModel.getPaid(id) == 150) {
                break;
            }
        }

        // Should have failed and the status should be 1
        assert.equal(await debtEngine.getStatus(id), 1);
        assert.equal(await testModel.getPaid(id), 150);
    });
});
