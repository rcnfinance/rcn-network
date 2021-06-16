const TestModel = artifacts.require('TestModel');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestRateOracle = artifacts.require('TestRateOracle');

const {
    constants,
    time,
    expectEvent,
    expectRevert,
} = require('@openzeppelin/test-helpers');

const {
    expect,
    bn,
    STATUS_PAID,
    STATUS_ONGOING,
    STATUS_ERROR,
    toEvents,
    random32bn,
} = require('./Helper.js');

function toWei (stringNumber) {
    return bn(stringNumber).mul(bn(10).pow(bn(18)));
}

contract('Test DebtEngine Diaspore', function (accounts) {
    let rcn;
    let debtEngine;
    let testModel;
    let oracle;

    const burner = accounts[5];

    async function toTokens (amount, oracle = { address: constants.ZERO_ADDRESS }, oracleData = '') {
        if (oracle.address === constants.ZERO_ADDRESS) {
            return amount;
        }

        const sample = await oracle.readSample.call(oracleData);
        const tokens = sample.tokens;
        const equivalent = sample.equivalent;

        if (tokens === 0 && equivalent === 0) {
            throw new Error('Oracle provided invalid rate');
        }

        const aux = tokens.mul(amount);
        const result = aux.div(equivalent);

        if (aux % equivalent > 0) {
            return result.add(bn(1));
        } else {
            return result;
        }
    }

    async function withFee (amount, oracle = { address: constants.ZERO_ADDRESS }, oracleData = '') {
        return bn(amount).add(await toFee(amount, oracle, oracleData));
    }

    async function toFee (amount, oracle = { address: constants.ZERO_ADDRESS }, oracleData = '') {
        const amountTokens = await toTokens(amount, oracle, oracleData);

        const feePerc = await debtEngine.fee();
        const BASE = await debtEngine.BASE();

        return bn(amountTokens).mul(feePerc).div(BASE);
    }

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Created2' || l.event === 'Created3' || l.event === 'Created');
        return event.args._id;
    }

    before('Create engine and model', async function () {
        rcn = await TestToken.new();
        debtEngine = await DebtEngine.new(rcn.address, burner, 0);
        testModel = await TestModel.new();
        oracle = await TestRateOracle.new();
        await testModel.setEngine(debtEngine.address);
    });

    it('Should generate diferents ids create and create2', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            constants.ZERO_ADDRESS,
            await testModel.encodeData(
                bn('1000'),
                (await time.latest()).add(bn(2000)),
                1,
                (await time.latest()).add(bn(2000)),
            ),
        ));
        const id2 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            constants.ZERO_ADDRESS,
            await debtEngine.nonces(accounts[0]),
            await testModel.encodeData(
                bn('1000'),
                (await time.latest()).add(bn(2000)),
                1,
                (await time.latest()).add(bn(2000)),
            ),
        ));
        assert.notEqual(id1, id2);
    });
    it('Should create different ids create2 and create3', async function () {
        const expireTime = (await time.latest()).add(bn(2000));
        const id1 = await getId(debtEngine.create2(
            testModel.address,
            accounts[0],
            constants.ZERO_ADDRESS,
            bn('89999'),
            await testModel.encodeData(bn('1001'), expireTime, 0, expireTime),
        ));

        const id2 = await getId(debtEngine.create3(
            testModel.address,
            accounts[0],
            constants.ZERO_ADDRESS,
            bn('89999'),
            await testModel.encodeData(bn('1001'), expireTime, 0, expireTime),
        ));

        assert.notEqual(id1, id2);
    });
    it('Funds should follow the debt', async function () {
        const laonAmount = bn(3000);
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            constants.ZERO_ADDRESS,
            await testModel.encodeData(laonAmount, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
        ));

        const payAmount = bn(4000);
        const payer = accounts[3];
        await rcn.setBalance(payer, payAmount);
        await rcn.approve(debtEngine.address, payAmount, { from: payer });

        await debtEngine.pay(id, payAmount, payer, [], { from: payer });

        expect(await rcn.balanceOf(payer)).to.eq.BN(payAmount.sub(await withFee(laonAmount)));
        expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_PAID);
        expect(await testModel.getPaid(id)).to.eq.BN(laonAmount);

        // Transfer debt
        await debtEngine.transferFrom(accounts[0], accounts[6], id);

        // Withdraw funds
        await rcn.setBalance(accounts[6], 0);
        await debtEngine.withdraw(id, accounts[6], { from: accounts[6] });
        expect(await rcn.balanceOf(accounts[6])).to.eq.BN(laonAmount);
    });
    it('Calling pay, payTokens, payBatch or payBatchTokens should get the same rate', async function () {
        const id1 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
        ));

        const id2 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
        ));

        const id3 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
        ));

        const id4 = await getId(debtEngine.create(
            testModel.address,
            accounts[0],
            oracle.address,
            await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
        ));

        // 4 RCN = 22.94 ETH :)
        const data = await oracle.encodeRate(4, 2294);

        await rcn.setBalance(accounts[0], toWei(2000));
        await rcn.approve(debtEngine.address, toWei(2000));

        await debtEngine.payToken(id1, toWei(1), constants.ZERO_ADDRESS, data);
        await debtEngine.payTokenBatch([id3], [toWei(1)], constants.ZERO_ADDRESS, oracle.address, data);

        const paid1 = await testModel.getPaid(id1);
        expect(paid1).to.eq.BN(await testModel.getPaid(id3));

        await debtEngine.pay(id2, paid1, constants.ZERO_ADDRESS, data);
        await debtEngine.payBatch([id4], [paid1], constants.ZERO_ADDRESS, oracle.address, data);

        expect(paid1).to.eq.BN(await testModel.getPaid(id4));
        expect(paid1).to.eq.BN(await testModel.getPaid(id2));
    });
    it('Try run a debt/s with invalid id/s', async function () {
        await expectRevert(
            debtEngine.run(
                constants.ZERO_BYTES32,
            ),
            'Debt does not exist',
        );

        await expectRevert(
            debtEngine.run(
                web3.utils.randomHex(32),
            ),
            'Debt does not exist',
        );
    });
    // Notice: Keep this test last
    it('Should not be possible to brute-forze an infinite loop', async function () {
        const id = await getId(debtEngine.create(
            testModel.address,
            accounts[2],
            constants.ZERO_ADDRESS,
            await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
        ));

        await rcn.setBalance(accounts[0], 50);

        await rcn.approve(debtEngine.address, 50);
        await debtEngine.payToken(id, 50, accounts[3], []);

        expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
        expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
        expect(await testModel.getPaid(id)).to.eq.BN('50');

        await rcn.setBalance(accounts[0], await withFee(100));
        await rcn.approve(debtEngine.address, await withFee(100));

        // Try to pay with different gas limits
        const minGas = await debtEngine.methods['payToken(bytes32,uint256,address,bytes)'].estimateGas(id, 100, accounts[3], []);
        const blockGasLimit = (await web3.eth.getBlock('latest')).gasLimit;
        for (let i = minGas; i < blockGasLimit; i += 1010) {
            try {
                await debtEngine.payToken(id, 100, accounts[3], [], { gas: i });
            } catch (ignored) {
                console.log(ignored);
            }

            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            // eslint-disable-next-line eqeqeq
            if (await testModel.getPaid(id) == 150) {
                break;
            }
        }

        // Should have failed and the status should be 1
        expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
        expect(await testModel.getPaid(id)).to.eq.BN('150');
    });
    describe('Constructor', function () {
        it('Creation should fail if token is not a contract', async function () {
            await expectRevert(
                DebtEngine.new(
                    accounts[2],
                    burner,
                    0,
                ),
                'Token should be a contract',
            );
        });
        it('Try create a DebtEngine with address 0x0 as burner', async function () {
            await expectRevert(
                DebtEngine.new(
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    0,
                ),
                'Burner 0x0 is not valid',
            );
        });
        it('Try create a DebtEngine with a high fee', async function () {
            await expectRevert(
                DebtEngine.new(
                    rcn.address,
                    burner,
                    101,
                ),
                'The fee should be lower or equal than 1%',
            );
        });
    });
    describe('Function setBurner', function () {
        it('Should set the burner', async function () {
            const newBurner = accounts[6];

            expectEvent(
                await debtEngine.setBurner(newBurner, { from: accounts[0] }),
                'SetBurner',
                { _burner: newBurner },
            );

            assert.equal(await debtEngine.burner(), newBurner);

            await debtEngine.setBurner(burner, { from: accounts[0] });
        });
        it('Try set address 0x0 as burner', async function () {
            await expectRevert(
                debtEngine.setBurner(
                    constants.ZERO_ADDRESS,
                    { from: accounts[0] },
                ),
                'Burner 0x0 is not valid',
            );
        });
        it('Try set burner without ownership', async function () {
            await expectRevert.unspecified(
                debtEngine.setBurner(
                    accounts[1],
                    { from: accounts[1] },
                ),
            );
        });
    });
    describe('Function setFee', function () {
        it('Should set the set fee', async function () {
            const newFee = 100;

            const SetFee = await toEvents(
                debtEngine.setFee(
                    newFee,
                    { from: accounts[0] },
                ),
                'SetFee',
            );

            assert.equal(SetFee._fee, newFee);
            assert.equal(await debtEngine.fee(), newFee);

            await debtEngine.setFee(0, { from: accounts[0] });
        });
        it('Try set fee without ownership', async function () {
            await expectRevert.unspecified(
                debtEngine.setFee(
                    0,
                    { from: accounts[1] },
                ),
            );
        });
        it('Try set a high fee', async function () {
            await expectRevert(
                debtEngine.setFee(
                    101,
                    { from: accounts[0] },
                ),
                'The fee should be lower or equal than 1%',
            );
        });
    });
    describe('Function create', function () {
        it('Should create a debt using create', async function () {
            const owner = accounts[1];
            const creator = accounts[2];
            const nonce = await debtEngine.nonces(creator);
            const data = await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(1000)), 0, (await time.latest()).add(bn(1000)));
            const calcId = await debtEngine.buildId(
                creator,
                nonce,
            );
            const prevBalAcc1 = await debtEngine.balanceOf(accounts[1]);

            const Created = await toEvents(
                debtEngine.create(
                    testModel.address,
                    owner,
                    constants.ZERO_ADDRESS,
                    data,
                    { from: creator },
                ),
                'Created',
            );

            assert.equal(Created._id, calcId);
            expect(Created._nonce).to.eq.BN(nonce);
            assert.equal(Created._data, data);

            // Check Debt
            const debt = await debtEngine.debts(calcId);
            assert.equal(debt.error, false);
            expect(debt.balance).to.eq.BN('0');
            expect(debt.fee).to.eq.BN('0');
            assert.equal(debt.model, testModel.address);
            assert.equal(debt.creator, creator);
            assert.equal(debt.oracle, constants.ZERO_ADDRESS);

            assert.equal(await debtEngine.ownerOf(calcId), owner);

            expect(await debtEngine.balanceOf(accounts[1])).to.eq.BN(prevBalAcc1.add(bn('1')), 'Account 1 should have a new asset');
        });
        it('Differents debt engine should give differents ids, create', async function () {
            const engine1 = await DebtEngine.new(rcn.address, burner, 0);
            const engine2 = await DebtEngine.new(rcn.address, burner, 0);

            await testModel.setEngine(engine1.address);

            const id1 = await getId(engine1.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setEngine(engine2.address);

            const id2 = await getId(engine2.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setEngine(debtEngine.address);

            assert.notEqual(id1, id2);
        });
        it('Should fail to create if model returned false', async function () {
            await testModel.setGlobalErrorFlag(bn('8'));

            const data = await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(1000)), 0, (await time.latest()).add(bn(1000)));

            await expectRevert(
                debtEngine.create(
                    testModel.address,
                    accounts[1],
                    constants.ZERO_ADDRESS,
                    data,
                ),
                'Error creating debt in model',
            );

            await testModel.setGlobalErrorFlag('0');
        });
    });
    describe('Function create2', function () {
        it('Should create a debt using create2', async function () {
            const owner = accounts[1];
            const creator = accounts[2];
            const salt = random32bn();
            const data = await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));
            const calcId = await debtEngine.buildId2(
                creator,
                testModel.address,
                constants.ZERO_ADDRESS,
                salt,
                data,
            );
            const prevBalAcc1 = await debtEngine.balanceOf(accounts[1]);

            const Created2 = await toEvents(
                debtEngine.create2(
                    testModel.address,
                    owner,
                    constants.ZERO_ADDRESS,
                    salt,
                    data,
                    { from: creator },
                ),
                'Created2',
            );

            assert.equal(Created2._id, calcId);
            expect(Created2._salt).to.eq.BN(salt);
            assert.equal(Created2._data, data);

            // Check Debt
            const debt = await debtEngine.debts(calcId);
            assert.equal(debt.error, false);
            expect(debt.balance).to.eq.BN('0');
            expect(debt.fee).to.eq.BN('0');
            assert.equal(debt.model, testModel.address);
            assert.equal(debt.creator, creator);
            assert.equal(debt.oracle, constants.ZERO_ADDRESS);

            assert.equal(await debtEngine.ownerOf(calcId), owner);
            expect(await debtEngine.balanceOf(accounts[1])).to.eq.BN(prevBalAcc1.add(bn('1')), 'Account 1 should have a new asset');
        });
        it('Should create 2 debts using create2', async function () {
            const prevBalAcc1 = await debtEngine.balanceOf(accounts[1]);
            const prevBalAcc2 = await debtEngine.balanceOf(accounts[2]);

            await debtEngine.create2(
                testModel.address,
                accounts[1],
                constants.ZERO_ADDRESS,
                bn('8000000'),
                await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            );

            expect(await debtEngine.balanceOf(accounts[1])).to.eq.BN(prevBalAcc1.add(bn('1')), 'Account 1 should have a new asset');

            await debtEngine.create2(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                bn('8000001'),
                await testModel.encodeData(bn('2000'), (await time.latest()).add(bn(3000)), 0, (await time.latest()).add(bn(3000))),
            );

            expect(await debtEngine.balanceOf(accounts[2])).to.eq.BN(prevBalAcc2.add(bn('1')), 'Account 2 should have a new asset');
        });
        it('Should predict Ids', async function () {
            const pid1 = await debtEngine.buildId2(
                accounts[0],
                testModel.address,
                constants.ZERO_ADDRESS,
                bn('12000'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            );

            const id1 = await getId(debtEngine.create2(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                bn('12000'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            assert.equal(pid1, id1);

            const pid2 = await debtEngine.buildId(
                accounts[0],
                await debtEngine.nonces(accounts[0]),
            );

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            assert.equal(pid2, id2);
        });
        it('Differents debt engine should give differents ids, create2', async function () {
            const engine1 = await DebtEngine.new(rcn.address, burner, 0);
            const engine2 = await DebtEngine.new(rcn.address, burner, 0);

            await testModel.setEngine(engine1.address);

            const id1 = await getId(engine1.create2(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                bn('768484844'),
                await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setEngine(engine2.address);

            const id2 = await getId(engine2.create2(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                bn('768484844'),
                await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setEngine(debtEngine.address);

            assert.notEqual(id1, id2);
        });
        it('Should fail to create2 if model returned false', async function () {
            await testModel.setGlobalErrorFlag(bn('8'));

            const data = await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(1000)), 0, (await time.latest()).add(bn(1000)));

            await expectRevert(
                debtEngine.create2(
                    testModel.address,
                    accounts[1],
                    constants.ZERO_ADDRESS,
                    bn('9489342'),
                    data,
                ),
                'Error creating debt in model',
            );

            await testModel.setGlobalErrorFlag('0');
        });
        it('Should fail to create2 with the same nonce', async function () {
            const expireTime = (await time.latest()).add(bn(2000));
            await debtEngine.create2(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                bn('9999'),
                await testModel.encodeData(bn('1000'), expireTime, 0, expireTime),
            );

            const data = await testModel.encodeData(bn('1000'), expireTime, 0, expireTime);

            await expectRevert(
                debtEngine.create2(
                    testModel.address,
                    accounts[0],
                    constants.ZERO_ADDRESS,
                    bn('9999'),
                    data,
                ),
                'ERC721: token already minted',
            );
        });
    });
    describe('Function create3', function () {
        it('Should create a debt using create3', async function () {
            const owner = accounts[1];
            const creator = accounts[2];
            const salt = random32bn();
            const data = await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));
            const calcId = await debtEngine.buildId3(
                creator,
                salt,
            );
            const prevBalAcc1 = await debtEngine.balanceOf(accounts[1]);

            const Created3 = await toEvents(
                debtEngine.create3(
                    testModel.address,
                    owner,
                    constants.ZERO_ADDRESS,
                    salt,
                    data,
                    { from: creator },
                ),
                'Created3',
            );

            assert.equal(Created3._id, calcId);
            expect(Created3._salt).to.eq.BN(salt);
            assert.equal(Created3._data, data);

            // Check Debt
            const debt = await debtEngine.debts(calcId);
            assert.equal(debt.error, false);
            expect(debt.balance).to.eq.BN('0');
            expect(debt.fee).to.eq.BN('0');
            assert.equal(debt.model, testModel.address);
            assert.equal(debt.creator, creator);
            assert.equal(debt.oracle, constants.ZERO_ADDRESS);

            assert.equal(await debtEngine.ownerOf(calcId), owner);
            expect(await debtEngine.balanceOf(accounts[1])).to.eq.BN(prevBalAcc1.add(bn('1')), 'Account 1 should have a new asset');
        });
        it('Differents debt engine should give differents ids, create3', async function () {
            const engine1 = await DebtEngine.new(rcn.address, burner, 0);
            const engine2 = await DebtEngine.new(rcn.address, burner, 0);

            await testModel.setEngine(engine1.address);

            const id1 = await getId(engine1.create3(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                bn('768484844'),
                await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setEngine(engine2.address);

            const id2 = await getId(engine2.create3(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                bn('768484844'),
                await testModel.encodeData(bn('3000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setEngine(debtEngine.address);

            assert.notEqual(id1, id2);
        });
        it('Try withdrawBatch funds to 0x0 address', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 10000);

            await rcn.approve(debtEngine.address, 10000);
            await debtEngine.pay(id, 4000, accounts[3], []);

            await expectRevert(
                debtEngine.withdrawBatch(
                    [id],
                    constants.ZERO_ADDRESS,
                ),
                '_to should not be 0x0',
            );
        });
        it('Try withdraw funds to 0x0 address', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 10000);

            await rcn.approve(debtEngine.address, 10000);
            await debtEngine.pay(id, 4000, accounts[3], []);

            await expectRevert(
                debtEngine.withdraw(
                    id,
                    constants.ZERO_ADDRESS,
                ),
                '_to should not be 0x0',
            );
        });
        it('Try withdrawPartial funds to 0x0 address', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 10000);

            await rcn.approve(debtEngine.address, 10000);
            await debtEngine.pay(id, 4000, accounts[3], []);

            await expectRevert(
                debtEngine.withdrawPartial(
                    id,
                    constants.ZERO_ADDRESS,
                    '1',
                ),
                '_to should not be 0x0',
            );
        });
        it('Should predict id create 3', async function () {
            const pid = await debtEngine.buildId3(
                accounts[0],
                bn('12200'),
            );

            const id = await getId(debtEngine.create3(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                bn('12200'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            assert.equal(pid, id);
        });
        it('Should fail to create3 if model returned false', async function () {
            await testModel.setGlobalErrorFlag(bn('8'));

            const data = await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(1000)), 0, (await time.latest()).add(bn(1000)));

            await expectRevert(
                debtEngine.create3(
                    testModel.address,
                    accounts[1],
                    constants.ZERO_ADDRESS,
                    bn('948934233'),
                    data,
                ),
                'Error creating debt in model',
            );

            await testModel.setGlobalErrorFlag('0');
        });
        it('Should fail to create3 with the same nonce', async function () {
            const expireTime = (await time.latest()).add(bn(2000));

            await debtEngine.create3(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                bn('79999'),
                await testModel.encodeData(bn('1200'), expireTime, 0, expireTime),
            );

            const data = await testModel.encodeData(bn('1000'), expireTime, 0, expireTime);

            await expectRevert(
                debtEngine.create3(
                    testModel.address,
                    accounts[0],
                    constants.ZERO_ADDRESS,
                    bn('79999'),
                    data,
                ),
                'ERC721: token already minted',
            );
        });
    });
    describe('Function buildId2', function () {
        it('It should create diferent IDs create2 with any change', async function () {
            const ids = [];

            ids.push(await debtEngine.buildId2(
                accounts[0],
                testModel.address,
                constants.ZERO_ADDRESS,
                bn('1200'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            ids.push(await debtEngine.buildId2(
                accounts[1],
                testModel.address,
                constants.ZERO_ADDRESS,
                bn('1200'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            ids.push(await debtEngine.buildId2(
                accounts[0],
                accounts[3],
                constants.ZERO_ADDRESS,
                bn('1200'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            ids.push(await debtEngine.buildId2(
                accounts[0],
                testModel.address,
                accounts[3],
                bn('1200'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            ids.push(await debtEngine.buildId2(
                accounts[0],
                testModel.address,
                constants.ZERO_ADDRESS,
                bn('1200'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2200)), 0, (await time.latest()).add(bn(2200))),
            ));

            ids.push(await debtEngine.buildId2(
                accounts[0],
                testModel.address,
                constants.ZERO_ADDRESS,
                bn('1200'),
                await testModel.encodeData(bn('1001'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            ids.push(await debtEngine.buildId2(
                accounts[0],
                testModel.address,
                constants.ZERO_ADDRESS,
                bn('1201'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            ids.push(await debtEngine.buildId2(
                accounts[0],
                testModel.address,
                constants.ZERO_ADDRESS,
                bn('1200'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2001)), 0, (await time.latest()).add(bn(2001))),
            ));

            ids.push(await debtEngine.buildId2(
                accounts[0],
                testModel.address,
                accounts[9],
                bn('2200'),
                await testModel.encodeData(bn('1000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            assert.equal(new Set(ids).size, 9);
        });
    });
    describe('Function pay', function () {
        it('Should create and pay a debt', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const originPayer = accounts[3];
            const oracle = constants.ZERO_ADDRESS;
            const amount = bn('3000');
            const data = await testModel.encodeData(amount, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle,
                data,
            ));

            const plusAmount = bn('561321');
            await rcn.setBalance(payer, amount.add(plusAmount));
            await rcn.approve(debtEngine.address, amount.add(plusAmount), { from: payer });

            const Paid = await toEvents(
                debtEngine.pay(
                    id,
                    amount,
                    originPayer,
                    [],
                    { from: payer },
                ),
                'Paid',
            );

            assert.equal(Paid._id, id);
            assert.equal(Paid._sender, payer);
            assert.equal(Paid._origin, originPayer);

            expect(Paid._requested).to.eq.BN(amount);
            expect(Paid._requestedTokens).to.eq.BN('0');
            expect(Paid._paid).to.eq.BN(amount);
            expect(Paid._tokens).to.eq.BN(amount);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN(amount);

            expect(await rcn.balanceOf(payer)).to.eq.BN(plusAmount);
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_PAID);
            expect(await testModel.getPaid(id)).to.eq.BN(amount);
        });
        it('Should pay using an Oracle', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const originPayer = accounts[3];
            const payAmountOracle = bn('60000');
            const totalDebt = bn(10000);
            const data = await testModel.encodeData(totalDebt, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle.address,
                data,
            ));

            // 1 ETH WEI = 6000 RCN WEI
            const oracleTokens = bn('6000');
            const oracleEquivalent = bn('1');
            const _paid = payAmountOracle.mul(oracleEquivalent).div(oracleTokens);

            await rcn.setBalance(payer, payAmountOracle);
            await rcn.approve(debtEngine.address, payAmountOracle, { from: payer });

            const oracleData = await oracle.encodeRate(oracleTokens, oracleEquivalent);

            const payEvents = await toEvents(
                debtEngine.pay(
                    id,
                    _paid,
                    originPayer,
                    oracleData,
                    { from: payer },
                ),
                'Paid',
                'ReadedOracle',
            );

            const Paid = payEvents[0];
            assert.equal(Paid._id, id);
            assert.equal(Paid._sender, payer);
            assert.equal(Paid._origin, originPayer);
            expect(Paid._requested).to.eq.BN(_paid);
            expect(Paid._requestedTokens).to.eq.BN('0');
            expect(Paid._paid).to.eq.BN(_paid);
            expect(Paid._tokens).to.eq.BN(payAmountOracle);

            const ReadedOracle = payEvents[1];
            assert.equal(ReadedOracle._id, id);
            expect(ReadedOracle._tokens).to.eq.BN(oracleTokens);
            expect(ReadedOracle._equivalent).to.eq.BN(oracleEquivalent);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN(payAmountOracle);

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN(_paid);

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await testModel.getPaid(id)).to.eq.BN(_paid);

            const payAmountOracle2 = bn(1000);
            // 1 ETH WEI = 5 RCN WEI
            const oracleTokens2 = bn(5);
            const oracleEquivalent2 = bn(1);
            const _paid2 = payAmountOracle2.mul(oracleEquivalent2).div(oracleTokens2);
            const oracleData2 = await oracle.encodeRate(oracleTokens2, oracleEquivalent2);

            await rcn.approve(debtEngine.address, payAmountOracle2, { from: originPayer });
            await rcn.setBalance(originPayer, payAmountOracle2);

            await debtEngine.pay(id, _paid2, constants.ZERO_ADDRESS, oracleData2, { from: originPayer });

            expect(await rcn.balanceOf(originPayer)).to.eq.BN(0);
            expect(await testModel.getPaid(id)).to.eq.BN(_paid.add(_paid2));

            const restDebt = totalDebt.sub(_paid).sub(_paid2);
            const restDebtOracle3 = restDebt.mul(oracleTokens2).div(oracleEquivalent2);
            const payerBal = restDebt.mul(bn(50));
            const payAmountOracle3 = payerBal.mul(oracleTokens2).div(oracleEquivalent2);

            await rcn.approve(debtEngine.address, payAmountOracle3, { from: originPayer });
            await rcn.setBalance(originPayer, payAmountOracle3);
            await debtEngine.pay(id, payerBal, accounts[0], oracleData2, { from: originPayer });

            expect(await rcn.balanceOf(originPayer)).to.eq.BN(payAmountOracle3.sub(restDebtOracle3));
            expect(await testModel.getPaid(id)).to.eq.BN(totalDebt);
            expect(await debtEngine.getStatus(id)).to.eq.BN(2);
        });
        it('Should pay with fee', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const originPayer = accounts[3];
            const payAmount = bn('1000');
            const loanTotalAmount = bn('10000');
            const data = await testModel.encodeData(loanTotalAmount, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            // Set 10% fee
            await debtEngine.setFee(100, { from: accounts[0] });

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                constants.ZERO_ADDRESS,
                data,
            ));

            const feeAmount = await toFee(payAmount);
            const prevBurnerBal = await rcn.balanceOf(burner);

            const amountWithFee = await withFee(payAmount);
            await rcn.setBalance(payer, amountWithFee);
            await rcn.approve(debtEngine.address, amountWithFee, { from: payer });

            const events = await toEvents(
                debtEngine.pay(
                    id,
                    payAmount,
                    originPayer,
                    [],
                    { from: payer },
                ),
                'Paid',
                'ChargeBurnFee',
            );

            const Paid = events[0];
            assert.equal(Paid._id, id);
            assert.equal(Paid._sender, payer);
            assert.equal(Paid._origin, originPayer);
            expect(Paid._requested).to.eq.BN(payAmount);
            expect(Paid._requestedTokens).to.eq.BN('0');
            expect(Paid._paid).to.eq.BN(payAmount);
            expect(Paid._tokens).to.eq.BN(payAmount);

            const ChargeBurnFee = events[1];
            assert.equal(ChargeBurnFee._id, id);
            expect(ChargeBurnFee._amount).to.eq.BN(feeAmount);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN(payAmount);
            expect(await rcn.balanceOf(burner)).to.eq.BN(prevBurnerBal.add(feeAmount));

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN(payAmount);

            // Pay total amount
            const payTotalAmount = await testModel.getClosingObligation(id);
            const feeAmount2 = await toFee(payTotalAmount);
            const prevBurnerBal2 = await rcn.balanceOf(burner);

            const amountWithFee2 = await withFee(payTotalAmount);
            await rcn.setBalance(payer, amountWithFee2);
            await rcn.approve(debtEngine.address, amountWithFee2, { from: payer });

            const events2 = await toEvents(
                debtEngine.pay(
                    id,
                    payTotalAmount,
                    originPayer,
                    [],
                    { from: payer },
                ),
                'Paid',
                'ChargeBurnFee',
            );

            const Paid2 = events2[0];
            assert.equal(Paid2._id, id);
            assert.equal(Paid2._sender, payer);
            assert.equal(Paid2._origin, originPayer);
            expect(Paid2._requested).to.eq.BN(payTotalAmount);
            expect(Paid2._requestedTokens).to.eq.BN('0');
            expect(Paid2._paid).to.eq.BN(payTotalAmount);
            expect(Paid2._tokens).to.eq.BN(payTotalAmount);

            const ChargeBurnFee2 = events2[1];
            assert.equal(ChargeBurnFee2._id, id);
            expect(ChargeBurnFee2._amount).to.eq.BN(feeAmount2);

            const debt2 = await debtEngine.debts(id);
            expect(debt2.balance).to.eq.BN(loanTotalAmount);
            expect(await rcn.balanceOf(burner)).to.eq.BN(prevBurnerBal2.add(feeAmount2));

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await testModel.getPaid(id)).to.eq.BN(loanTotalAmount);
            expect(await debtEngine.getStatus(id)).to.eq.BN('2');

            await debtEngine.setFee(0, { from: accounts[0] });
        });
        it('Should pay using an Oracle with fee', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const originPayer = accounts[3];
            const payAmount = bn('1000');
            const loanTotalAmount = bn('10000');
            const data = await testModel.encodeData(loanTotalAmount, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));
            const oracleData = await oracle.encodeRate(6000, 1);

            await debtEngine.setFee(100, { from: accounts[0] });

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle.address,
                data,
            ));

            const feeAmount = await toFee(payAmount, oracle, oracleData);
            const prevBurnerBal = await rcn.balanceOf(burner);

            const payAmountTokens = await toTokens(payAmount, oracle, oracleData);
            const amountWithFee = await withFee(payAmountTokens);

            await rcn.setBalance(payer, amountWithFee);
            await rcn.approve(debtEngine.address, amountWithFee, { from: payer });

            const events = await toEvents(
                debtEngine.pay(
                    id,
                    payAmount,
                    originPayer,
                    oracleData,
                    { from: payer },
                ),
                'Paid',
                'ReadedOracle',
                'ChargeBurnFee',
            );

            const Paid = events[0];
            assert.equal(Paid._id, id);
            assert.equal(Paid._sender, payer);
            assert.equal(Paid._origin, originPayer);
            expect(Paid._requested).to.eq.BN(payAmount);
            expect(Paid._requestedTokens).to.eq.BN('0');
            expect(Paid._paid).to.eq.BN(payAmount);
            expect(Paid._tokens).to.eq.BN(payAmountTokens);

            const ReadedOracle = events[1];
            assert.equal(ReadedOracle._id, id);
            const sample = await oracle.readSample.call(oracleData);
            expect(ReadedOracle._tokens).to.eq.BN(sample.tokens);
            expect(ReadedOracle._equivalent).to.eq.BN(sample.equivalent);

            const ChargeBurnFee = events[2];
            assert.equal(ChargeBurnFee._id, id);
            expect(ChargeBurnFee._amount).to.eq.BN(feeAmount);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN(payAmountTokens);
            expect(await rcn.balanceOf(burner)).to.eq.BN(prevBurnerBal.add(feeAmount));

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN(payAmount);

            // Pay total amount
            const payTotalAmount = await testModel.getClosingObligation(id);
            const payTotalAmountTokens = await toTokens(payTotalAmount, oracle, oracleData);
            const feeAmount2 = await toFee(payTotalAmount, oracle, oracleData);
            const prevBurnerBal2 = await rcn.balanceOf(burner);

            const amountWithFee2 = await withFee(payTotalAmountTokens);
            await rcn.setBalance(payer, amountWithFee2);
            await rcn.approve(debtEngine.address, amountWithFee2, { from: payer });

            const events2 = await toEvents(
                debtEngine.pay(
                    id,
                    payTotalAmount,
                    originPayer,
                    oracleData,
                    { from: payer },
                ),
                'Paid',
                'ReadedOracle',
                'ChargeBurnFee',
            );

            const Paid2 = events2[0];
            assert.equal(Paid2._id, id);
            assert.equal(Paid2._sender, payer);
            assert.equal(Paid2._origin, originPayer);
            expect(Paid2._requested).to.eq.BN(payTotalAmount);
            expect(Paid2._requestedTokens).to.eq.BN('0');
            expect(Paid2._paid).to.eq.BN(payTotalAmount);
            expect(Paid2._tokens).to.eq.BN(payTotalAmountTokens);

            const ReadedOracle2 = events2[1];
            assert.equal(ReadedOracle2._id, id);
            const sample2 = await oracle.readSample.call(oracleData);
            expect(ReadedOracle2._tokens).to.eq.BN(sample2.tokens);
            expect(ReadedOracle2._equivalent).to.eq.BN(sample2.equivalent);

            const ChargeBurnFee2 = events2[2];
            assert.equal(ChargeBurnFee2._id, id);
            expect(ChargeBurnFee2._amount).to.eq.BN(feeAmount2);

            const debt2 = await debtEngine.debts(id);
            expect(debt2.balance).to.eq.BN(await toTokens(loanTotalAmount, oracle, oracleData));
            expect(await rcn.balanceOf(burner)).to.eq.BN(prevBurnerBal2.add(feeAmount2));

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await testModel.getPaid(id)).to.eq.BN(loanTotalAmount);
            expect(await debtEngine.getStatus(id)).to.eq.BN('2');

            await debtEngine.setFee(0, { from: accounts[0] });
        });
        it('Pay should round in favor of the owner', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(10, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 2 ETH = 1 RCN
            const data = await oracle.encodeRate(1, 2);

            await rcn.setBalance(accounts[0], 0);
            await rcn.approve(debtEngine.address, 0);

            await expectRevert(
                debtEngine.pay(id, 1, constants.ZERO_ADDRESS, data),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await testModel.getPaid(id)).to.eq.BN('0');
        });
        it('Should apply rate even when tokens is not divisible by 10', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 0.82711175222132156792 ETH = 4000.23333566612312 RCN
            const data = await oracle.encodeRate(bn('400023333566612312000000'), bn('82711175222132156792'));

            await rcn.setBalance(accounts[0], 4836388);
            await rcn.approve(debtEngine.address, 4836388);

            await debtEngine.pay(id, 1000, constants.ZERO_ADDRESS, data);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
        });
        it('Should apply rate with token more expensive than currency', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 1.22 RCN = 22.94 ETH :)
            const data = await oracle.encodeRate(122, 2294);

            await rcn.setBalance(accounts[0], '53182214472537054');
            await rcn.approve(debtEngine.address, '53182214472537054');

            await debtEngine.pay(id, toWei(1), constants.ZERO_ADDRESS, data);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
        });
        it('Pay should fail if paid is more than requested', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 10000);
            await rcn.approve(debtEngine.address, 10000);

            const prevBalance = await rcn.balanceOf(accounts[0]);

            await testModel.setErrorFlag(id, 9);

            await expectRevert(
                debtEngine.pay(id, 100, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS),
                'Paid can\'t be more than requested',
            );

            expect(await testModel.getPaid(id)).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(prevBalance);
        });
        it('Pay should fail if rate includes zero', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            let data = await oracle.encodeRate(0, bn('82711175222132156792'));

            const value = bn('10').pow(bn('32'));
            await rcn.setBalance(accounts[0], value);
            await rcn.approve(debtEngine.address, value);

            await expectRevert(
                debtEngine.pay(id, 1000, constants.ZERO_ADDRESS, data),
                'Oracle provided invalid rate',
            );

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(value);
            expect(await testModel.getPaid(id)).to.eq.BN('0');

            data = await oracle.encodeRate(14123, 0);

            await expectRevert(
                debtEngine.pay(id, 1000, constants.ZERO_ADDRESS, data),
                'Oracle provided invalid rate',
            );

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(value);
            expect(await testModel.getPaid(id)).to.eq.BN('0');
        });
        it('Pay should fail if payer has not enought balance', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1000);
            await rcn.approve(debtEngine.address, 1000);

            await expectRevert(
                debtEngine.pay(id, 2000, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await testModel.getPaid(id)).to.eq.BN('0');
        });
        it('Should catch and recover from a pay error', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 50, accounts[3], []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 1);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.pay(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('100');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.pay(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('150');
        });
        it('Should catch and recover from a pay infinite loop', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 50, accounts[3], []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 2);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.pay(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(100);
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN(50);

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.pay(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(0);
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN(150);
        });
        it('Should catch and recover from a pay error, with an Oracle', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 25);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 50, accounts[3], oracleData);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(0);
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 1);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 100, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('50');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 100, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(0);
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('150');
        });
        it('Try use pay to pay a debt with invalid id', async function () {
            await rcn.setBalance(accounts[0], 1);
            await rcn.approve(debtEngine.address, 1);

            await expectRevert(
                debtEngine.pay(
                    constants.ZERO_BYTES32,
                    '1',
                    accounts[0],
                    [],
                ),
                'Debt does not exist',
            );

            await expectRevert(
                debtEngine.pay(
                    web3.utils.randomHex(32),
                    '1',
                    accounts[0],
                    [],
                ),
                'Debt does not exist',
            );
        });
    });
    describe('Function payToken', function () {
        it('Should create and pay a debt using payToken', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const originPayer = accounts[3];
            const oracle = constants.ZERO_ADDRESS;
            const amount = bn('3000');
            const data = await testModel.encodeData(amount, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle,
                data,
            ));

            const plusAmount = bn('561321');
            await rcn.setBalance(payer, amount.add(plusAmount));
            await rcn.approve(debtEngine.address, amount.add(plusAmount), { from: payer });

            const Paid = await toEvents(
                debtEngine.payToken(
                    id,
                    amount,
                    originPayer,
                    [],
                    { from: payer },
                ),
                'Paid',
            );
            assert.equal(Paid._id, id);
            assert.equal(Paid._sender, payer);
            assert.equal(Paid._origin, originPayer);
            expect(Paid._requested).to.eq.BN(0);
            expect(Paid._requestedTokens).to.eq.BN(amount);
            expect(Paid._paid).to.eq.BN(amount);
            expect(Paid._tokens).to.eq.BN(amount);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN(amount);

            expect(await rcn.balanceOf(payer)).to.eq.BN(plusAmount);
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_PAID);
            expect(await testModel.getPaid(id)).to.eq.BN(amount);
        });
        it('Should payToken using an Oracle', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const originPayer = accounts[3];
            const payAmountOracle = bn('60000');
            const data = await testModel.encodeData(bn('10000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle.address,
                data,
            ));

            // 1 ETH WEI = 6000 RCN WEI
            const oracleTokens = bn('6000');
            const oracleEquivalent = bn('1');
            const _paid = payAmountOracle.mul(oracleEquivalent).div(oracleTokens);
            const payAmountToken = _paid.mul(oracleTokens).div(oracleEquivalent);
            const oracleData1 = await oracle.encodeRate(6000, 1);

            await rcn.setBalance(payer, payAmountToken);
            await rcn.approve(debtEngine.address, payAmountToken, { from: payer });

            const payTokenEvents = await toEvents(
                debtEngine.payToken(
                    id,
                    payAmountOracle,
                    originPayer,
                    oracleData1,
                    { from: payer },
                ),
                'Paid',
                'ReadedOracle',
            );

            const Paid = payTokenEvents[0];
            assert.equal(Paid._id, id);
            assert.equal(Paid._sender, payer);
            assert.equal(Paid._origin, originPayer);
            expect(Paid._requested).to.eq.BN('0');
            expect(Paid._requestedTokens).to.eq.BN(payAmountOracle);
            expect(Paid._paid).to.eq.BN(_paid);
            expect(Paid._tokens).to.eq.BN(payAmountToken);

            const ReadedOracle = payTokenEvents[1];
            assert.equal(ReadedOracle._id, id);
            expect(ReadedOracle._tokens).to.eq.BN(oracleTokens);
            expect(ReadedOracle._equivalent).to.eq.BN(oracleEquivalent);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN(payAmountOracle);

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN(_paid);

            const payAmountOracle2 = bn('500');
            const oracleTokens2 = bn('5');
            const oracleEquivalent2 = bn('10');
            const _paid2 = payAmountOracle2.mul(oracleEquivalent2).div(oracleTokens2);
            const oracleData2 = await oracle.encodeRate(5, 10);

            await rcn.approve(debtEngine.address, payAmountOracle2, { from: payer });
            await rcn.setBalance(payer, payAmountOracle2);
            await debtEngine.payToken(
                id,
                payAmountOracle2,
                constants.ZERO_ADDRESS,
                oracleData2,
                { from: payer },
            );

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await testModel.getPaid(id)).to.eq.BN(_paid.add(_paid2));

            const payer2 = accounts[5];
            await rcn.setBalance(payer2, bn('10000'));
            await rcn.approve(debtEngine.address, bn('6000'), { from: payer2 });
            await debtEngine.payToken(
                id,
                bn('19000'),
                accounts[0],
                oracleData2,
                { from: payer2 },
            );

            // 10000 - (10000 - 1010) / 2
            const expectBalance = bn('10000').sub(bn('10000').sub(bn('1010')).divRound(bn('2')));
            expect(await rcn.balanceOf(payer2)).to.eq.BN(expectBalance);
            expect(await testModel.getPaid(id)).to.eq.BN('10000');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_PAID);
        });
        it('Should payToken using with fee', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const originPayer = accounts[3];
            const payAmount = bn('6000');
            const loanTotalAmount = bn('10000');
            const data = await testModel.encodeData(loanTotalAmount, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            await debtEngine.setFee(100, { from: accounts[0] });

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                constants.ZERO_ADDRESS,
                data,
            ));

            const feeAmount = await toFee(payAmount);
            const prevBurnerBal = await rcn.balanceOf(burner);
            const amountWithFee = await withFee(payAmount);

            await rcn.setBalance(payer, amountWithFee);
            await rcn.approve(debtEngine.address, amountWithFee, { from: payer });

            const events = await toEvents(
                debtEngine.payToken(
                    id,
                    payAmount,
                    originPayer,
                    [],
                    { from: payer },
                ),
                'Paid',
                'ChargeBurnFee',
            );

            const Paid = events[0];
            assert.equal(Paid._id, id);
            assert.equal(Paid._sender, payer);
            assert.equal(Paid._origin, originPayer);
            expect(Paid._requested).to.eq.BN('0');
            expect(Paid._requestedTokens).to.eq.BN(payAmount);
            expect(Paid._paid).to.eq.BN(payAmount);
            expect(Paid._tokens).to.eq.BN(payAmount);

            const ChargeBurnFee = events[1];
            assert.equal(ChargeBurnFee._id, id);
            expect(ChargeBurnFee._amount).to.eq.BN(feeAmount);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN(payAmount);
            expect(await rcn.balanceOf(burner)).to.eq.BN(prevBurnerBal.add(feeAmount));

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN(payAmount);

            // Pay total amount
            const payTotalAmount = await testModel.getClosingObligation(id);
            const feeAmount2 = await toFee(payTotalAmount);
            const prevBurnerBal2 = await rcn.balanceOf(burner);

            const amountWithFee2 = await withFee(payTotalAmount);
            await rcn.setBalance(payer, amountWithFee2);
            await rcn.approve(debtEngine.address, amountWithFee2, { from: payer });

            const events2 = await toEvents(
                debtEngine.payToken(
                    id,
                    payTotalAmount,
                    originPayer,
                    [],
                    { from: payer },
                ),
                'Paid',
                'ChargeBurnFee',
            );

            const Paid2 = events2[0];
            assert.equal(Paid2._id, id);
            assert.equal(Paid2._sender, payer);
            assert.equal(Paid2._origin, originPayer);
            expect(Paid2._requested).to.eq.BN('0');
            expect(Paid2._requestedTokens).to.eq.BN(payTotalAmount);
            expect(Paid2._paid).to.eq.BN(payTotalAmount);
            expect(Paid2._tokens).to.eq.BN(payTotalAmount);

            const ChargeBurnFee2 = events2[1];
            assert.equal(ChargeBurnFee2._id, id);
            expect(ChargeBurnFee2._amount).to.eq.BN(feeAmount2);

            const debt2 = await debtEngine.debts(id);
            expect(debt2.balance).to.eq.BN(loanTotalAmount);
            expect(await rcn.balanceOf(burner)).to.eq.BN(prevBurnerBal2.add(feeAmount2));

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await testModel.getPaid(id)).to.eq.BN(loanTotalAmount);
            expect(await debtEngine.getStatus(id)).to.eq.BN('2');

            await debtEngine.setFee(0, { from: accounts[0] });
        });
        it('Should payToken using an Oracle with fee', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const originPayer = accounts[3];
            const payAmountTokens = bn('60000');
            const loanTotalAmount = bn('10000');
            const data = await testModel.encodeData(loanTotalAmount, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));
            const oracleData = await oracle.encodeRate(6000, 1);

            await debtEngine.setFee(100, { from: accounts[0] });

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle.address,
                data,
            ));

            const feeAmount = await toFee(payAmountTokens);
            const prevBurnerBal = await rcn.balanceOf(burner);

            // 1 ETH WEI = 6000 RCN WEI
            const oracleTokens = bn('6000');
            const oracleEquivalent = bn('1');
            const _paid = payAmountTokens.mul(oracleEquivalent).div(oracleTokens);

            const amountWithFee = await withFee(payAmountTokens);

            await rcn.setBalance(payer, amountWithFee);
            await rcn.approve(debtEngine.address, amountWithFee, { from: payer });

            const events = await toEvents(
                debtEngine.payToken(
                    id,
                    payAmountTokens,
                    originPayer,
                    oracleData,
                    { from: payer },
                ),
                'Paid',
                'ReadedOracle',
                'ChargeBurnFee',
            );

            const Paid = events[0];
            assert.equal(Paid._id, id);
            assert.equal(Paid._sender, payer);
            assert.equal(Paid._origin, originPayer);
            expect(Paid._requested).to.eq.BN('0');
            expect(Paid._requestedTokens).to.eq.BN(payAmountTokens);
            expect(Paid._paid).to.eq.BN(_paid);
            expect(Paid._tokens).to.eq.BN(payAmountTokens);

            const ReadedOracle = events[1];
            assert.equal(ReadedOracle._id, id);
            const sample = await oracle.readSample.call(oracleData);
            expect(ReadedOracle._tokens).to.eq.BN(sample.tokens);
            expect(ReadedOracle._equivalent).to.eq.BN(sample.equivalent);

            const ChargeBurnFee = events[2];
            assert.equal(ChargeBurnFee._id, id);
            expect(ChargeBurnFee._amount).to.eq.BN(feeAmount);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN(payAmountTokens);
            expect(await rcn.balanceOf(burner)).to.eq.BN(prevBurnerBal.add(feeAmount));

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN(_paid);

            // Pay total amount
            const payTotalAmount = await testModel.getClosingObligation(id);
            const payTotalAmountTokens = await toTokens(payTotalAmount, oracle, oracleData);
            const feeAmount2 = await toFee(payTotalAmount, oracle, oracleData);
            const prevBurnerBal2 = await rcn.balanceOf(burner);

            const amountWithFee2 = await withFee(payTotalAmountTokens);
            await rcn.setBalance(payer, amountWithFee2);
            await rcn.approve(debtEngine.address, amountWithFee2, { from: payer });

            const events2 = await toEvents(
                debtEngine.payToken(
                    id,
                    payTotalAmountTokens,
                    originPayer,
                    oracleData,
                    { from: payer },
                ),
                'Paid',
                'ReadedOracle',
                'ChargeBurnFee',
            );

            const Paid2 = events2[0];
            assert.equal(Paid2._id, id);
            assert.equal(Paid2._sender, payer);
            assert.equal(Paid2._origin, originPayer);
            expect(Paid2._requested).to.eq.BN('0');
            expect(Paid2._requestedTokens).to.eq.BN(payTotalAmountTokens);
            expect(Paid2._paid).to.eq.BN(payTotalAmount);
            expect(Paid2._tokens).to.eq.BN(payTotalAmountTokens);

            const ReadedOracle2 = events2[1];
            assert.equal(ReadedOracle2._id, id);
            const sample2 = await oracle.readSample.call(oracleData);
            expect(ReadedOracle2._tokens).to.eq.BN(sample2.tokens);
            expect(ReadedOracle2._equivalent).to.eq.BN(sample2.equivalent);

            const ChargeBurnFee2 = events2[2];
            assert.equal(ChargeBurnFee2._id, id);
            expect(ChargeBurnFee2._amount).to.eq.BN(feeAmount2);

            const debt2 = await debtEngine.debts(id);
            expect(debt2.balance).to.eq.BN(await toTokens(loanTotalAmount, oracle, oracleData));
            expect(await rcn.balanceOf(burner)).to.eq.BN(prevBurnerBal2.add(feeAmount2));

            expect(await rcn.balanceOf(payer)).to.eq.BN('0');
            expect(await testModel.getPaid(id)).to.eq.BN(loanTotalAmount);
            expect(await debtEngine.getStatus(id)).to.eq.BN('2');

            await debtEngine.setFee(0, { from: accounts[0] });
        });
        it('Pay tokens round in favor of the owner', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(10, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 1 ETH = 2 RCN
            const data = await oracle.encodeRate(2, 1);

            await rcn.setBalance(accounts[0], 1);
            await rcn.approve(debtEngine.address, 1);

            await debtEngine.payToken(id, 1, constants.ZERO_ADDRESS, data);

            expect(await testModel.getPaid(id)).to.eq.BN('0');
        });
        it('Should apply rate pay tokens even when tokens is not divisible by 10', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 2.82711175222132156792 ETH = 4010.23333566612312 RCN
            const data = await oracle.encodeRate(bn('401023333566612312000000'), bn('282711175222132156792'));

            await rcn.setBalance(accounts[0], toWei(1));
            await rcn.approve(debtEngine.address, toWei(1));

            await debtEngine.payToken(id, toWei(1), constants.ZERO_ADDRESS, data);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('342');
            expect(await testModel.getPaid(id)).to.eq.BN(bn('704974378193313'));
        });
        it('Should apply rate pay tokens with token more expensive than currency', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 4.122224 RCN = 0.5 ETH :)
            const data = await oracle.encodeRate(41222240, 5);

            await rcn.setBalance(accounts[0], toWei(2));
            await rcn.approve(debtEngine.address, toWei(2));

            await debtEngine.payToken(id, toWei(2), constants.ZERO_ADDRESS, data);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(bn('1834816'));
            expect(await testModel.getPaid(id)).to.eq.BN(bn('242587496458'));
        });
        it('Should catch and recover from a payToken infinite loop', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.payToken(id, 50, accounts[3], []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 2);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.payToken(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('100');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.payToken(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('150');
        });
        it('Should catch and recover from a payToken infinite loop, with an Oracle', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 25);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.payToken(id, 25, accounts[3], oracleData);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 2);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.payToken(id, 50, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('50');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.payToken(id, 50, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('150');
        });
        it('Should catch and recover from a payToken error, with an Oracle', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 25);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.payToken(id, 25, accounts[3], oracleData);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 1);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.payToken(id, 50, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('50');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.payToken(id, 50, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('150');
        });
        it('Should catch and recover from a payToken error', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.payToken(id, 50, accounts[3], []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 1);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.payToken(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('100');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.payToken(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('150');
        });
        it('Pay tokens should fail if paid is more than requested', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 10000);
            await rcn.approve(debtEngine.address, 10000);

            const prevBalance = await rcn.balanceOf(accounts[0]);

            await testModel.setErrorFlag(id, 9);

            await expectRevert(
                debtEngine.payToken(id, 100, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS),
                'Paid can\'t exceed available',
            );

            expect(await testModel.getPaid(id)).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(prevBalance);
        });
        it('Pay tokens should fail if payer has not enought balance', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1000);
            await rcn.approve(debtEngine.address, 1000);

            await expectRevert(
                debtEngine.payToken(id, 2000, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await testModel.getPaid(id)).to.eq.BN('0');
        });
        it('Pay tokens fail if rate includes zero', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            let data = await oracle.encodeRate(0, bn('82711175222132156792'));

            const value = bn('10').pow(bn('32'));
            await rcn.setBalance(accounts[0], value);
            await rcn.approve(debtEngine.address, value);

            await expectRevert(
                debtEngine.payToken(id, 1000, constants.ZERO_ADDRESS, data),
                'Oracle provided invalid rate',
            );

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(value);
            expect(await testModel.getPaid(id)).to.eq.BN('0');

            data = await oracle.encodeRate(14123, 0);

            await expectRevert(
                debtEngine.payToken(id, 1000, constants.ZERO_ADDRESS, data),
                'Oracle provided invalid rate',
            );

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(value);
            expect(await testModel.getPaid(id)).to.eq.BN('0');
        });
        it('Try use payToken to pay a debt with invalid id', async function () {
            await rcn.setBalance(accounts[0], 1);
            await rcn.approve(debtEngine.address, 1);

            await expectRevert(
                debtEngine.payToken(
                    constants.ZERO_BYTES32,
                    '1',
                    accounts[0],
                    [],
                ),
                'Debt does not exist',
            );

            await expectRevert(
                debtEngine.payToken(
                    web3.utils.randomHex(32),
                    '1',
                    accounts[0],
                    [],
                ),
                'Debt does not exist',
            );
        });
    });
    describe('Function payBatch', function () {
        it('Should fail because are different size input arrays)', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));
            await expectRevert(
                debtEngine.payBatch(
                    [id],
                    [10, 20],
                    accounts[1],
                    oracle.address,
                    constants.ZERO_ADDRESS,
                    { from: accounts[2] },
                ),
                '_ids and _amounts should have the same length',
            );
            await expectRevert(
                debtEngine.payBatch(
                    [id, id],
                    [10],
                    accounts[1],
                    oracle.address,
                    constants.ZERO_ADDRESS,
                    { from: accounts[2] },
                ),
                '_ids and _amounts should have the same length',
            );
        });
        it('Pay 0 loans should make no change', async function () {
            await rcn.setBalance(accounts[2], 0);
            await debtEngine.payBatch(
                [],
                [],
                accounts[1],
                constants.ZERO_ADDRESS,
                constants.ZERO_ADDRESS,
                { from: accounts[2] },
            );
        });
        it('Pay batch should emit pay event', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[4],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 1500);
            await rcn.approve(debtEngine.address, 1500);

            const receipt = await debtEngine.payBatch([id1, id2], [2000, 1000], accounts[4], oracle.address, oracleData);

            // Test read oracle event
            const oracleEvent = receipt.logs.find((l) => l.event === 'ReadedOracleBatch');
            assert.isOk(oracleEvent);
            expect(oracleEvent.args._count).to.eq.BN('2');
            expect(oracleEvent.args._tokens).to.eq.BN('5');
            expect(oracleEvent.args._equivalent).to.eq.BN('10');

            // Test paid events
            const paidLogs = receipt.logs.filter((l) => l.event === 'Paid');
            assert.equal(paidLogs.length, 2);
            assert.equal(paidLogs.filter((e) => e.args._id === id1).length, 1);
            assert.equal(paidLogs.filter((e) => e.args._id === id2).length, 1);
            paidLogs.forEach((event) => {
                switch (event.args._id) {
                case id1: {
                    const args = event.args;
                    expect(args._requested).to.eq.BN('2000');
                    expect(args._requestedTokens).to.eq.BN('0');
                    expect(args._paid).to.eq.BN('2000');
                    expect(args._tokens).to.eq.BN('1000');
                    assert.equal(args._sender, accounts[0]);
                    assert.equal(args._origin, accounts[4]);
                    break;
                }
                case id2: {
                    const args2 = event.args;
                    expect(args2._requested).to.eq.BN('1000');
                    expect(args2._requestedTokens).to.eq.BN('0');
                    expect(args2._paid).to.eq.BN('1000');
                    expect(args2._tokens).to.eq.BN('500');
                    assert.equal(args2._sender, accounts[0]);
                    assert.equal(args2._origin, accounts[4]);
                    break;
                }
                }
            });
        });
        it('Pay batch multiple times multiple id should be like paying the sum', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.payBatch([id1, id1, id2], [1000, 1000, 500], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('500');
            expect(await testModel.getPaid(id1)).to.eq.BN('2000');
            expect(await testModel.getPaid(id2)).to.eq.BN('500');

            const debt1 = await debtEngine.debts(id1);
            expect(debt1[1]).to.eq.BN('2000');

            const debt2 = await debtEngine.debts(id2);
            expect(debt2[1]).to.eq.BN('500');
        });
        it('Should create and pay debts in batch', async function () {
            const ids = [];
            ids[0] = await getId(
                debtEngine.create(
                    testModel.address, // model
                    accounts[2],       // owner
                    constants.ZERO_ADDRESS,               // oracle
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))), // data
                ),
            );
            ids[1] = await getId(
                debtEngine.create(
                    testModel.address, // model
                    accounts[2],       // owner
                    constants.ZERO_ADDRESS,               // oracle
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))), // data
                ),
            );
            ids[2] = await getId(
                debtEngine.create(
                    testModel.address, // model
                    accounts[2],       // owner
                    constants.ZERO_ADDRESS,               // oracle
                    await testModel.encodeData(100, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))), // data
                ),
            );

            const amounts = [4000, 3000, 150];

            await rcn.setBalance(accounts[0], 7150);
            await rcn.approve(debtEngine.address, 7150);

            await debtEngine.payBatch(ids, amounts, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('1050');
            expect(await debtEngine.getStatus(ids[0])).to.eq.BN(STATUS_PAID);
            expect(await testModel.getPaid(ids[0])).to.eq.BN('3000');
        });
        it('Should pay batch using a oracle', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(10000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[2], 500);
            await rcn.approve(debtEngine.address, 500, { from: accounts[2] });

            await debtEngine.payBatch([id], [1000], accounts[1], oracle.address, oracleData, { from: accounts[2] });

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');
            expect(await testModel.getPaid(id)).to.eq.BN('1000');
        });
        it('Pay batch should round in favor of the owner', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(10, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 2 ETH = 1 RCN
            const data = await oracle.encodeRate(1, 2);

            await rcn.setBalance(accounts[0], 0);
            await rcn.approve(debtEngine.address, 0);

            await expectRevert(
                debtEngine.payBatch([id, id], [1, 0], constants.ZERO_ADDRESS, oracle.address, data),
                'ERC20: transfer amount exceeds balance',
            );
            await expectRevert(
                debtEngine.payBatch([id], [1], constants.ZERO_ADDRESS, oracle.address, data),
                'ERC20: transfer amount exceeds balance',
            );
            await debtEngine.payBatch([id], [0], constants.ZERO_ADDRESS, oracle.address, data);

            expect(await testModel.getPaid(id)).to.eq.BN('0');
        });
        it('Should apply rate pay batch with token more expensive than currency', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 1.22 RCN = 22.94 ETH :)
            const data = await oracle.encodeRate(122, 2294);

            await rcn.setBalance(accounts[0], '53182214472537054');
            await rcn.approve(debtEngine.address, toWei(1));

            await debtEngine.payBatch([id], [toWei(1)], constants.ZERO_ADDRESS, oracle.address, data);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
        });
        it('Pay batch should fail if one debt paid is more than requested', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 10000);
            await rcn.approve(debtEngine.address, 10000);

            const prevBalance = await rcn.balanceOf(accounts[0]);

            await testModel.setErrorFlag(id1, 9);

            await expectRevert(
                debtEngine.payBatch([id1, id2], [1000, 1000], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []),
                'Paid can\'t be more than requested',
            );

            expect(await testModel.getPaid(id1)).to.eq.BN('0');
            expect(await testModel.getPaid(id2)).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(prevBalance);
        });
        it('Pay batch should fail if payer has balance for zero payments', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 500);
            await rcn.approve(debtEngine.address, 500);

            await expectRevert(
                debtEngine.payBatch([id1, id2], [1000, 1000], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await testModel.getPaid(id1)).to.eq.BN('0');
            expect(await testModel.getPaid(id2)).to.eq.BN('0');
        });
        it('Pay batch should fail if payer has balance below total', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1500);
            await rcn.approve(debtEngine.address, 1500);

            await expectRevert(
                debtEngine.payBatch([id1, id2], [1000, 1000], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await testModel.getPaid(id1)).to.eq.BN('0');
            expect(await testModel.getPaid(id2)).to.eq.BN('0');
        });
        it('Should pay batch with tokens less expensive than currency', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[4],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(2, 1);

            await rcn.setBalance(accounts[0], 6000);
            await rcn.approve(debtEngine.address, 6000);

            await debtEngine.payBatch([id1, id2], [2000, 1000], accounts[4], oracle.address, oracleData);

            expect(await testModel.getPaid(id1)).to.eq.BN('2000');
            expect(await testModel.getPaid(id2)).to.eq.BN('1000');

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
        });
        it('Should pay batch with tokens more expensive than currency', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[4],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 1500);
            await rcn.approve(debtEngine.address, 1500);

            await debtEngine.payBatch([id1, id2], [2000, 1000], accounts[4], oracle.address, oracleData);

            expect(await testModel.getPaid(id1)).to.eq.BN('2000');
            expect(await testModel.getPaid(id2)).to.eq.BN('1000');

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
        });
        it('Should create and pay a debts using payTokens in batch', async function () {
            const ids = [];
            ids[0] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );
            ids[1] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );
            ids[2] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(100, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );

            const amounts = [4000, 3000, 150];

            await rcn.setBalance(accounts[0], 7150);
            await rcn.approve(debtEngine.address, 7150);

            await debtEngine.payTokenBatch(ids, amounts, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('1050');
            expect(await debtEngine.getStatus(ids[0])).to.eq.BN(STATUS_PAID);
            expect(await testModel.getPaid(ids[0])).to.eq.BN('3000');
        });
        it('Try use payTokenBatch to pay a debt/s with invalid id/s', async function () {
            await rcn.setBalance(accounts[0], 1);
            await rcn.approve(debtEngine.address, 1);

            await expectRevert(
                debtEngine.payTokenBatch(
                    [constants.ZERO_BYTES32],
                    ['1'],
                    accounts[0],
                    constants.ZERO_ADDRESS,
                    [],
                ),
                'Debt does not exist',
            );

            await expectRevert(
                debtEngine.payTokenBatch(
                    [web3.utils.randomHex(32)],
                    ['1'],
                    accounts[0],
                    constants.ZERO_ADDRESS,
                    [],
                ),
                'Debt does not exist',
            );

            await expectRevert(
                debtEngine.payTokenBatch(
                    [constants.ZERO_BYTES32, web3.utils.randomHex(32)],
                    ['0', '1'],
                    accounts[0],
                    constants.ZERO_ADDRESS,
                    [],
                ),
                'Debt does not exist',
            );
        });
    });
    describe('Function payTokenBatch', function () {
        it('Should fail because are different size input arrays)', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));
            await expectRevert(
                debtEngine.payTokenBatch(
                    [id],
                    [10, 20],
                    accounts[1],
                    oracle.address,
                    constants.ZERO_ADDRESS,
                    { from: accounts[2] },
                ),
                '_ids and _amounts should have the same length',
            );
            await expectRevert(
                debtEngine.payTokenBatch(
                    [id, id],
                    [10],
                    accounts[1],
                    oracle.address,
                    constants.ZERO_ADDRESS,
                    { from: accounts[2] },
                ),
                '_ids and _amounts should have the same length',
            );
        });
        it('Pay token batch shoud not overflow the debt balance', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(10, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setErrorFlag(id, 10);

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.pay(id, 3000, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS);

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('3000');

            const value = bn('2').pow(bn('129'));
            await rcn.setBalance(accounts[0], value);
            await rcn.approve(debtEngine.address, value);

            await expectRevert(
                debtEngine.payTokenBatch([id2, id], [10, value], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await testModel.getPaid(id)).to.eq.BN('3000');
            expect(await testModel.getPaid(id2)).to.eq.BN('0');

            const ndebt = await debtEngine.debts(id);
            expect(ndebt[1]).to.eq.BN('3000');

            await rcn.setBalance(accounts[2], 0);
            await debtEngine.withdraw(id, accounts[2], { from: accounts[2] });
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
        });
        it('Pay tokens batch should fail if one debt paid is more than requested', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 10000);
            await rcn.approve(debtEngine.address, 10000);

            const prevBalance = await rcn.balanceOf(accounts[0]);

            await testModel.setErrorFlag(id2, 9);

            await expectRevert(
                debtEngine.payTokenBatch([id1, id2], [1000, 1000], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []),
                'Paid can\'t be more than requested',
            );

            expect(await testModel.getPaid(id1)).to.eq.BN('0');
            expect(await testModel.getPaid(id2)).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(prevBalance);
        });
        it('Pay tokens batch should fail if payer has balance for zero payments', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 500);
            await rcn.approve(debtEngine.address, 500);

            await expectRevert(
                debtEngine.payTokenBatch([id1, id2], [1000, 1000], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await testModel.getPaid(id1)).to.eq.BN('0');
            expect(await testModel.getPaid(id2)).to.eq.BN('0');
        });
        it('Pay tokens batch should fail if payer has balance below total', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1500);
            await rcn.approve(debtEngine.address, 1500);

            await expectRevert(
                debtEngine.payTokenBatch([id1, id2], [1000, 1000], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await testModel.getPaid(id1)).to.eq.BN('0');
            expect(await testModel.getPaid(id2)).to.eq.BN('0');
        });
        it('Should create and pay a debts using payTokens in batch', async function () {
            const ids = [];
            ids[0] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );
            ids[1] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );
            ids[2] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(100, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );

            const amounts = [4000, 3000, 150];

            await rcn.setBalance(accounts[0], 7150);
            await rcn.approve(debtEngine.address, 7150);

            await debtEngine.payTokenBatch(ids, amounts, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('1050');
            expect(await debtEngine.getStatus(ids[0])).to.eq.BN(STATUS_PAID);
            expect(await testModel.getPaid(ids[0])).to.eq.BN('3000');
        });
        it('Should pay tokens batch with tokens less expensive than currency', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[4],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(2, 1);

            await rcn.setBalance(accounts[0], 6000);
            await rcn.approve(debtEngine.address, 6000);

            await debtEngine.payTokenBatch([id1, id2], [4000, 2000], accounts[4], oracle.address, oracleData);

            expect(await testModel.getPaid(id1)).to.eq.BN('2000');
            expect(await testModel.getPaid(id2)).to.eq.BN('1000');

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
        });
        it('Should pay tokens batch with tokens more expensive than currency', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[4],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 1500);
            await rcn.approve(debtEngine.address, 1500);

            await debtEngine.payTokenBatch([id1, id2], [1000, 500], accounts[4], oracle.address, oracleData);

            expect(await testModel.getPaid(id1)).to.eq.BN('2000');
            expect(await testModel.getPaid(id2)).to.eq.BN('1000');

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
        });
        it('Should pay token batch using a oracle', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(10000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[2], 500);
            await rcn.approve(debtEngine.address, 500, { from: accounts[2] });

            await debtEngine.payTokenBatch([id], [500], accounts[1], oracle.address, oracleData, { from: accounts[2] });

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');
            expect(await testModel.getPaid(id)).to.eq.BN('1000');
        });
        it('Should create and pay a debts using payTokens in batch', async function () {
            const ids = [];
            ids[0] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );
            ids[1] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );
            ids[2] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(100, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );

            const amounts = [4000, 3000, 150];

            await rcn.setBalance(accounts[0], 7150);
            await rcn.approve(debtEngine.address, 7150);

            await debtEngine.payTokenBatch(ids, amounts, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('1050');
            expect(await debtEngine.getStatus(ids[0])).to.eq.BN(STATUS_PAID);
            expect(await testModel.getPaid(ids[0])).to.eq.BN('3000');
        });
        it('Pay tokens batch round in favor of the owner', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(10, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 1 ETH = 2 RCN
            const data = await oracle.encodeRate(2, 1);

            await rcn.setBalance(accounts[0], 2);
            await rcn.approve(debtEngine.address, 2);

            await debtEngine.payTokenBatch([id, id], [1, 1], constants.ZERO_ADDRESS, oracle.address, data);

            expect(await testModel.getPaid(id)).to.eq.BN('0');
        });
        it('Should not pay the third debt because not correspond the currency and oracle.', async function () {
            const ids = [];
            ids[0] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    constants.ZERO_ADDRESS,
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );
            ids[1] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    oracle.address,
                    await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );
            ids[2] = await getId(
                debtEngine.create(
                    testModel.address,
                    accounts[2],
                    oracle.address,
                    await testModel.encodeData(100, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
                ),
            );

            const amounts = [4000, 3000, 150];

            await rcn.setBalance(accounts[0], 7150);
            await rcn.approve(debtEngine.address, 7150);

            await debtEngine.payTokenBatch(ids, amounts, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('4150');
            expect(await debtEngine.getStatus(ids[0])).to.eq.BN(STATUS_PAID);
            expect(await testModel.getPaid(ids[0])).to.eq.BN('3000');
        });
        it('Should apply rate pay batch tokens even when tokens is not divisible by 10', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 2.82711175222132156792 ETH = 4010.23333566612312 RCN
            const data = await oracle.encodeRate(bn('401023333566612312000000'), bn('282711175222132156792'));

            await rcn.setBalance(accounts[0], toWei(1));
            await rcn.approve(debtEngine.address, toWei(1));

            await debtEngine.payTokenBatch([id], [toWei(1)], constants.ZERO_ADDRESS, oracle.address, data);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('342');
            expect(await testModel.getPaid(id)).to.eq.BN(bn('704974378193313'));
        });
        it('Should apply rate pay batch tokens with token more expensive than currency', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(toWei('900000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // 4.122224 RCN = 0.5 ETH :)
            const data = await oracle.encodeRate(41222240, 5);

            await rcn.setBalance(accounts[0], toWei(2));
            await rcn.approve(debtEngine.address, toWei(2));

            await debtEngine.payTokenBatch([id], [toWei(2)], constants.ZERO_ADDRESS, oracle.address, data);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN(bn('1834816'));
            expect(await testModel.getPaid(id)).to.eq.BN(bn('242587496458'));
        });
        it('Pay tokens batch multiple times multiple id should be like paying the sum', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.payTokenBatch([id1, id2, id1], [1000, 500, 1000], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('500');
            expect(await testModel.getPaid(id1)).to.eq.BN('2000');
            expect(await testModel.getPaid(id2)).to.eq.BN('500');

            const debt1 = await debtEngine.debts(id1);
            expect(debt1[1]).to.eq.BN('2000');

            const debt2 = await debtEngine.debts(id2);
            expect(debt2[1]).to.eq.BN('500');
        });
        it('Pay token batch should emit pay event', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[4],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 1500);
            await rcn.approve(debtEngine.address, 1500);

            const receipt = await debtEngine.payTokenBatch([id1, id2], [1000, 500], accounts[4], oracle.address, oracleData);

            // Test read oracle event
            const oracleEvent = receipt.logs.find((l) => l.event === 'ReadedOracleBatch');
            assert.isOk(oracleEvent);
            expect(oracleEvent.args._count).to.eq.BN('2');
            expect(oracleEvent.args._tokens).to.eq.BN('5');
            expect(oracleEvent.args._equivalent).to.eq.BN('10');

            // Test paid events
            const paidLogs = receipt.logs.filter((l) => l.event === 'Paid');
            assert.equal(paidLogs.length, 2);
            assert.equal(paidLogs.filter((e) => e.args._id === id1).length, 1);
            assert.equal(paidLogs.filter((e) => e.args._id === id2).length, 1);
            paidLogs.forEach((event) => {
                switch (event.args._id) {
                case id1: {
                    const args = event.args;
                    expect(args._requested).to.eq.BN('0');
                    expect(args._requestedTokens).to.eq.BN('1000');
                    expect(args._paid).to.eq.BN('2000');
                    expect(args._tokens).to.eq.BN('1000');
                    assert.equal(args._sender, accounts[0]);
                    assert.equal(args._origin, accounts[4]);
                    break;
                }
                case id2: {
                    const args2 = event.args;
                    expect(args2._requested).to.eq.BN('0');
                    expect(args2._requestedTokens).to.eq.BN('500');
                    expect(args2._paid).to.eq.BN('1000');
                    expect(args2._tokens).to.eq.BN('500');
                    assert.equal(args2._sender, accounts[0]);
                    assert.equal(args2._origin, accounts[4]);
                    break;
                }
                }
            });
        });
        it('Try use payBatch to pay a debt/s with invalid id/s', async function () {
            await rcn.setBalance(accounts[0], 1);
            await rcn.approve(debtEngine.address, 1);

            await expectRevert(
                debtEngine.payBatch(
                    [constants.ZERO_BYTES32],
                    ['1'],
                    accounts[0],
                    constants.ZERO_ADDRESS,
                    [],
                ),
                'Debt does not exist',
            );

            await expectRevert(
                debtEngine.payBatch(
                    [web3.utils.randomHex(32)],
                    ['1'],
                    accounts[0],
                    constants.ZERO_ADDRESS,
                    [],
                ),
                'Debt does not exist',
            );

            await expectRevert(
                debtEngine.payBatch(
                    [constants.ZERO_BYTES32, web3.utils.randomHex(32)],
                    ['0', '1'],
                    accounts[0],
                    constants.ZERO_ADDRESS,
                    [],
                ),
                'Debt does not exist',
            );
        });
    });
    describe('Function withdraw', function () {
        it('Should withdraw funds from payment', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const beneficiary = accounts[3];
            const oracle = constants.ZERO_ADDRESS;
            const amount = bn('3000');
            const data = await testModel.encodeData(amount, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle,
                data,
            ));

            const plusAmount = bn('561321');
            await rcn.setBalance(payer, amount.add(plusAmount));
            await rcn.approve(debtEngine.address, amount.add(plusAmount), { from: payer });

            await debtEngine.payToken(
                id,
                amount,
                payer,
                [],
                { from: payer },
            );

            // Withdraw funds
            await rcn.setBalance(beneficiary, '0');
            const Withdrawn1 = await toEvents(
                debtEngine.withdraw(
                    id,
                    beneficiary,
                    { from: owner },
                ),
                'Withdrawn',
            );

            assert.equal(Withdrawn1._id, id);
            assert.equal(Withdrawn1._sender, owner);
            assert.equal(Withdrawn1._to, beneficiary);
            expect(Withdrawn1._amount).to.eq.BN(amount);

            const debt = await debtEngine.debts(id);
            expect(debt.balance).to.eq.BN('0');

            expect(await rcn.balanceOf(beneficiary)).to.eq.BN(amount);

            // Withdraw again, should be 0
            await rcn.setBalance(beneficiary, '0');
            const Withdrawn2 = await toEvents(
                debtEngine.withdraw(
                    id,
                    beneficiary,
                    { from: owner },
                ),
                'Withdrawn',
            );

            assert.equal(Withdrawn2._id, id);
            assert.equal(Withdrawn2._sender, owner);
            assert.equal(Withdrawn2._to, beneficiary);
            expect(Withdrawn2._amount).to.eq.BN('0');

            expect(await rcn.balanceOf(beneficiary)).to.eq.BN('0');
        });
        it('Pay shoud not overflow the debt balance', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(10, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setErrorFlag(id, 10);

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.pay(id, 3000, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS);

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('3000');

            const value = bn('2').pow(bn('129'));
            await rcn.setBalance(accounts[0], value);
            await rcn.approve(debtEngine.address, value);

            await expectRevert(
                debtEngine.pay(id, value, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS),
                'uint128 Overflow',
            );

            const ndebt = await debtEngine.debts(id);
            expect(ndebt[1]).to.eq.BN('3000');

            await rcn.setBalance(accounts[2], 0);
            await debtEngine.withdraw(id, accounts[2], { from: accounts[2] });
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
        });
        it('Pay token shoud not overflow the debt balance', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(10, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setErrorFlag(id, 10);

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.payToken(id, 3000, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS);

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('3000');

            const value = bn('2').pow(bn('130'));
            await rcn.setBalance(accounts[0], value);
            await rcn.approve(debtEngine.address, value);

            await expectRevert(
                debtEngine.payToken(id, bn('2').pow(bn('129')), constants.ZERO_ADDRESS, constants.ZERO_ADDRESS),
                'uint128 Overflow',
            );

            const ndebt = await debtEngine.debts(id);
            expect(ndebt[1]).to.eq.BN('3000');

            await rcn.setBalance(accounts[2], 0);
            await debtEngine.withdraw(id, accounts[2], { from: accounts[2] });
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
        });
        it('Pay batch shoud not overflow the debt balance', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(10, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await testModel.setErrorFlag(id, 10);

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.pay(id, 3000, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS);

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('3000');

            const value = bn('2').pow(bn('130'));
            await rcn.setBalance(accounts[0], value);
            await rcn.approve(debtEngine.address, value);

            await expectRevert(
                debtEngine.payBatch([id2, id], [10, bn('2').pow(bn('129'))], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []),
                'uint128 Overflow',
            );

            expect(await testModel.getPaid(id)).to.eq.BN('3000');
            expect(await testModel.getPaid(id2)).to.eq.BN('0');

            const ndebt = await debtEngine.debts(id);
            expect(ndebt[1]).to.eq.BN('3000');

            await rcn.setBalance(accounts[2], 0);
            await debtEngine.withdraw(id, accounts[2], { from: accounts[2] });
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
        });
        it('Should fail withdraw not authorized', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.pay(id, 3000, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS);

            await rcn.setBalance(accounts[3], 0);
            await rcn.setBalance(accounts[2], 0);
            await expectRevert(
                debtEngine.withdraw(id, accounts[3], { from: accounts[3] }),
                'Sender not authorized',
            );
            await expectRevert(
                debtEngine.withdraw(id, accounts[2], { from: accounts[3] }),
                'Sender not authorized',
            );

            expect(await rcn.balanceOf(accounts[3])).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');

            await debtEngine.withdraw(id, accounts[2], { from: accounts[2] });
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
            await debtEngine.withdraw(id, accounts[2], { from: accounts[2] });
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
        });
        it('Should fail withdraw if debt engine has no funds', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.pay(id, 3000, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS);

            const auxBalance = await rcn.balanceOf(debtEngine.address);
            await rcn.setBalance(debtEngine.address, 0);

            await rcn.setBalance(accounts[2], 0);
            await expectRevert(
                debtEngine.withdraw(id, accounts[2], { from: accounts[2] }),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');

            await rcn.setBalance(debtEngine.address, auxBalance);
        });
        it('Should withdraw partial payments, authorized', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(1000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 4000);

            await rcn.approve(debtEngine.address, 4000);
            await debtEngine.pay(id, 50, accounts[3], []);

            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            await debtEngine.pay(id, 50, accounts[3], []);

            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('100');

            await debtEngine.setApprovalForAll(accounts[7], true);
            await rcn.setBalance(accounts[7], 0);
            await debtEngine.withdraw(id, accounts[7], { from: accounts[7] });
            await debtEngine.setApprovalForAll(accounts[7], false);
            expect(await rcn.balanceOf(accounts[7])).to.eq.BN('100');

            await rcn.setBalance(accounts[2], 200);
            await debtEngine.pay(id, 200, accounts[2], []);

            // Next withdraw should fail, no longer approved
            await rcn.setBalance(accounts[7], 0);
            await expectRevert(
                debtEngine.withdraw(id, accounts[7], { from: accounts[7] }),
                'Sender not authorized',
            );
            debtEngine.withdrawBatch([id], accounts[7], { from: accounts[7] });
            expect(await rcn.balanceOf(accounts[7])).to.eq.BN('0');

            await debtEngine.approve(accounts[8], id);
            await rcn.setBalance(accounts[8], 0);
            await debtEngine.withdrawBatch([id], accounts[8], { from: accounts[8] });
            expect(await rcn.balanceOf(accounts[8])).to.eq.BN('200');
        });
    });
    describe('Function withdrawPartial', function () {
        it('Should fail to withdraw partially if sender is not authorized', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[1],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(1000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1000);
            await rcn.approve(debtEngine.address, 1000);

            await debtEngine.pay(id, 1000, accounts[0], []);

            await expectRevert(debtEngine.withdrawPartial(id, accounts[0], 500), 'Sender not authorized');
            await expectRevert(debtEngine.withdrawPartial(id, accounts[1], 500), 'Sender not authorized');

            expect(await rcn.balanceOf(accounts[1])).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('1000');
        });
        it('Should withdraw partially if sender is authorized', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[1],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(1000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[2], 0);
            await rcn.setBalance(accounts[0], 1000);
            await rcn.approve(debtEngine.address, 1000);
            await debtEngine.approve(accounts[0], id, { from: accounts[1] });

            await debtEngine.pay(id, 1000, accounts[0], []);

            await debtEngine.withdrawPartial(id, accounts[2], 600);

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('600');
            expect(await rcn.balanceOf(accounts[1])).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('400');
        });
        it('Should withdraw partially total amount', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(1000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1000);
            await rcn.approve(debtEngine.address, 1000);

            await debtEngine.pay(id, 1000, accounts[0], []);

            await rcn.setBalance(accounts[0], 0);
            await rcn.setBalance(accounts[2], 0);

            await debtEngine.withdrawPartial(id, accounts[2], 1000);

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('1000');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('0');
        });
        it('Should fail to withdraw more than available', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(1000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1000);
            await rcn.approve(debtEngine.address, 1000);

            await debtEngine.pay(id, 1000, accounts[0], []);

            await rcn.setBalance(accounts[0], 0);
            await rcn.setBalance(accounts[2], 0);

            await expectRevert.unspecified(debtEngine.withdrawPartial(id, accounts[2], 1100));

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('1000');
        });
        it('Should fail to withdraw a more than possible balance', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(1000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1000);
            await rcn.approve(debtEngine.address, 1000);

            await debtEngine.pay(id, 1000, accounts[0], []);

            await rcn.setBalance(accounts[0], 0);
            await rcn.setBalance(accounts[2], 0);

            await expectRevert.unspecified(
                debtEngine.withdrawPartial(
                    id,
                    accounts[2],
                    '0xfffffffffffffffffffffffffffffffff',
                ),
            );

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('1000');
        });
        it('Should fail to withdraw if debt engine has no tokens', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(1000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 1000);
            await rcn.approve(debtEngine.address, 1000);

            await debtEngine.pay(id, 1000, accounts[0], []);

            await rcn.setBalance(accounts[0], 0);
            await rcn.setBalance(accounts[2], 0);

            const prevBalance = await rcn.balanceOf(debtEngine.address);
            await rcn.setBalance(debtEngine.address, 0);
            await expectRevert(debtEngine.withdrawPartial(id, accounts[2], 200), 'ERC20: transfer amount exceeds balance');
            await rcn.setBalance(debtEngine.address, prevBalance);

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');

            const debt = await debtEngine.debts(id);
            expect(debt[1]).to.eq.BN('1000');
        });
    });
    describe('Function withdrawBatch', function () {
        it('Should withdraw funds from multiple debts', async function () {
            const owner = accounts[1];
            const payer = accounts[2];
            const beneficiary = accounts[3];
            const oracle = constants.ZERO_ADDRESS;

            const amount1 = bn('3000');
            const data1 = await testModel.encodeData(amount1, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            const amount2 = bn('7000');
            const data2 = await testModel.encodeData(amount2, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            const id1 = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle,
                data1,
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle,
                data2,
            ));

            await rcn.setBalance(payer, amount1.add(amount2));
            await rcn.approve(debtEngine.address, amount1.add(amount2));

            await debtEngine.payTokenBatch(
                [id1, id2],
                [amount1, amount2],
                payer,
                oracle,
                [],
                { from: payer },
            );

            // Withdraw funds
            await rcn.setBalance(beneficiary, 0);
            const Withdrawn = await toEvents(
                debtEngine.withdrawBatch(
                    [id1, id2],
                    beneficiary,
                    { from: owner },
                ),
                'Withdrawn',
            );

            assert.equal(Withdrawn[0]._id, id1);
            assert.equal(Withdrawn[0]._sender, owner);
            assert.equal(Withdrawn[0]._to, beneficiary);
            expect(Withdrawn[0]._amount).to.eq.BN(amount1);

            assert.equal(Withdrawn[1]._id, id2);
            assert.equal(Withdrawn[1]._sender, owner);
            assert.equal(Withdrawn[1]._to, beneficiary);
            expect(Withdrawn[1]._amount).to.eq.BN(amount2);

            const debt1 = await debtEngine.debts(id1);
            expect(debt1.balance).to.eq.BN('0');

            const debt2 = await debtEngine.debts(id2);
            expect(debt2.balance).to.eq.BN('0');

            expect(await rcn.balanceOf(beneficiary)).to.eq.BN('10000');

            // Withdraw again, should be 0
            await rcn.setBalance(beneficiary, 0);
            await debtEngine.withdraw(id1, beneficiary, { from: owner });
            await debtEngine.withdraw(id2, beneficiary, { from: owner });
            await debtEngine.withdrawBatch([id1, id2], beneficiary, { from: owner });
            expect(await rcn.balanceOf(beneficiary)).to.eq.BN('0');
        });
        it('Should pay using an Oracle and withdraw', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[0],
                oracle.address,
                await testModel.encodeData(10000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData1 = await oracle.encodeRate(6000, 1);
            const oracleData2 = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[2], 60000);
            await rcn.approve(debtEngine.address, 60000, { from: accounts[2] });
            await debtEngine.pay(id, 10, accounts[1], oracleData1, { from: accounts[2] });

            await rcn.approve(debtEngine.address, 500, { from: accounts[3] });
            await rcn.setBalance(accounts[3], 500);
            await debtEngine.pay(id, 1000, constants.ZERO_ADDRESS, oracleData2, { from: accounts[3] });

            await rcn.approve(debtEngine.address, 6000, { from: accounts[3] });
            await rcn.setBalance(accounts[3], 10000);
            await debtEngine.pay(id, 10000, accounts[0], oracleData2, { from: accounts[3] });

            // Withdraw
            await debtEngine.transferFrom(accounts[0], accounts[9], id);
            await rcn.setBalance(accounts[9], 0);
            await debtEngine.withdrawBatch([id], accounts[9], { from: accounts[9] });

            // 60000 + 500 + (10000 - 1010) / 2)
            const expectBalance = bn('60000').add(bn('500')).add((bn('10000').sub(bn('1010')).divRound(bn('2'))));
            expect(await rcn.balanceOf(accounts[9])).to.eq.BN(expectBalance);

            // Withdraw again should transfer 0
            await rcn.setBalance(accounts[9], 0);
            await debtEngine.approve(accounts[3], id, { from: accounts[9] });
            await debtEngine.withdrawBatch([id], accounts[9], { from: accounts[3] });
            expect(await rcn.balanceOf(accounts[9])).to.eq.BN('0');
        });
        it('Should fail withdraw batch if debt engine has no funds', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.payBatch([id, id2], [1500, 1500], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            const auxBalance = await rcn.balanceOf(debtEngine.address);
            await rcn.setBalance(debtEngine.address, 0);

            await rcn.setBalance(accounts[2], 0);
            await expectRevert(
                debtEngine.withdrawBatch([id, id2], accounts[2], { from: accounts[2] }),
                'ERC20: transfer amount exceeds balance',
            );

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');

            await rcn.setBalance(debtEngine.address, auxBalance);
        });
        it('Should fail withdraw batch not authorized', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.payBatch([id1, id2], [1500, 1500], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            await rcn.setBalance(accounts[3], 0);
            await rcn.setBalance(accounts[2], 0);
            await debtEngine.withdrawBatch([id1, id2], accounts[3], { from: accounts[3] });
            await debtEngine.withdrawBatch([id1, id2], accounts[2], { from: accounts[3] });

            expect(await rcn.balanceOf(accounts[3])).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');

            await debtEngine.withdrawBatch([id1, id2], accounts[2], { from: accounts[2] });
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
            await debtEngine.withdrawBatch([id1, id2], accounts[2], { from: accounts[2] });
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
        });
        it('Should fail withdraw batch not authorized mixed', async function () {
            const id1 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[4],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.payBatch([id1, id2], [1500, 1500], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            await rcn.setBalance(accounts[3], 0);
            await rcn.setBalance(accounts[2], 0);
            await debtEngine.withdrawBatch([id1, id2], accounts[3], { from: accounts[3] });
            await debtEngine.withdrawBatch([id1, id2], accounts[2], { from: accounts[3] });

            expect(await rcn.balanceOf(accounts[3])).to.eq.BN('0');
            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0');

            await rcn.setBalance(accounts[4], 0);
            await debtEngine.withdrawBatch([id1, id2], accounts[4], { from: accounts[4] });

            expect(await rcn.balanceOf(accounts[4])).to.eq.BN('1500');
        });
        it('Withdraw multiple times same id should make no difference', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const id2 = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            await rcn.setBalance(accounts[0], 3000);
            await rcn.approve(debtEngine.address, 3000);

            await debtEngine.payBatch([id, id2], [1500, 1500], constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, []);

            await rcn.setBalance(accounts[2], 0);
            await debtEngine.withdrawBatch([id, id, id2, id, id, id, id], accounts[2], { from: accounts[2] });

            expect(await rcn.balanceOf(accounts[2])).to.eq.BN('3000');
        });
        it('Withdraw zero debts should have no effect', async function () {
            await rcn.setBalance(accounts[7], 0);
            await debtEngine.withdrawBatch([], accounts[7], { from: accounts[7] });
            expect(await rcn.balanceOf(accounts[7])).to.eq.BN('0');
        });
    });
    describe('Function getFeeAmount', function () {
        it('Get fee amount with 0% fee', async function () {
            await debtEngine.setFee(0, { from: accounts[0] });

            const feeAmount = await debtEngine.getFeeAmount(
                constants.ZERO_BYTES32,
                0,
                [],
            );

            expect(feeAmount).to.eq.BN(0);

            const feeAmount2 = await debtEngine.getFeeAmount(
                constants.ZERO_BYTES32,
                random32bn(),
                [],
            );

            expect(feeAmount2).to.eq.BN(0);
        });
        it('Get fee amount with % fee', async function () {
            await debtEngine.setFee(99, { from: accounts[0] });

            const feeAmount = await debtEngine.getFeeAmount(
                constants.ZERO_BYTES32,
                0,
                [],
            );

            expect(feeAmount).to.eq.BN(0);

            const data = await testModel.encodeData(bn('10000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[1],
                constants.ZERO_ADDRESS,
                data,
            ));

            const payAmount = bn(123456789123456789);
            const feeAmount2 = await debtEngine.getFeeAmount(
                id,
                payAmount,
                [],
            );

            expect(feeAmount2).to.eq.BN(await toFee(payAmount));

            await debtEngine.setFee(0, { from: accounts[0] });
        });
        it('Get fee amount with % fee and oracle', async function () {
            const owner = accounts[1];
            const data = await testModel.encodeData(bn('10000'), (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000)));

            await debtEngine.setFee(99, { from: accounts[0] });

            const id = await getId(debtEngine.create(
                testModel.address,
                owner,
                oracle.address,
                data,
            ));

            const oracleData = await oracle.encodeRate(6000, 1);

            const feeAmount = await debtEngine.getFeeAmount(
                id,
                0,
                oracleData,
            );

            expect(feeAmount).to.eq.BN(0);

            const payAmount = bn(123456789123456789);
            const feeAmount2 = await debtEngine.getFeeAmount(
                id,
                payAmount,
                oracleData,
            );

            expect(feeAmount2).to.eq.BN(await toFee(payAmount, oracle, oracleData));

            await debtEngine.setFee(0, { from: accounts[0] });
        });
    });
    describe('Errors tests', function () {
        it('Should catch and recover from a pay infinite loop, with an Oracle', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 25);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 50, accounts[3], oracleData);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 2);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 100, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('50');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 100, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('150');
        });
        it('Should catch and recover from a pay infinite loop, with an Oracle', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                oracle.address,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            const oracleData = await oracle.encodeRate(5, 10);

            await rcn.setBalance(accounts[0], 25);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 50, accounts[3], oracleData);

            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Set the error flag
            await testModel.setErrorFlag(id, 2);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 100, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('50');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);
            expect(await testModel.getPaid(id)).to.eq.BN('50');

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 50);

            await rcn.approve(debtEngine.address, 50);
            await debtEngine.pay(id, 100, accounts[3], oracleData);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('150');
        });
        it('Should catch a getStatus error', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // Set the error flag
            await testModel.setErrorFlag(id, 3);

            // Try to read status
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.payToken(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('100');
        });
        it('Should catch a getStatus infinite loop', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // Set the error flag
            await testModel.setErrorFlag(id, 4);

            // Try to read status
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.payToken(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('100');
        });
        it('Should catch and recover from a run error', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // Set the error flag
            await testModel.setErrorFlag(id, 6);

            // Run and read status
            await debtEngine.run(id);
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await debtEngine.run(id);

            // Should have failed and the status should be 4
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
        });
        it('Should catch and recover from a run infinite loop', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // Set the error flag
            await testModel.setErrorFlag(id, 7);

            // Run and read status
            await debtEngine.run(id);
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await debtEngine.run(id);

            // Should have failed and the status should be 4
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
        });
        it('Should catch a getStatus write storage error', async function () {
            const id = await getId(debtEngine.create(
                testModel.address,
                accounts[2],
                constants.ZERO_ADDRESS,
                await testModel.encodeData(3000, (await time.latest()).add(bn(2000)), 0, (await time.latest()).add(bn(2000))),
            ));

            // Set the error flag
            await testModel.setErrorFlag(id, 5);

            // Try to read status
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ERROR);

            // Remove the flag
            await testModel.setErrorFlag(id, 0);

            // Try to pay
            await rcn.setBalance(accounts[0], 100);

            await rcn.approve(debtEngine.address, 100);
            await debtEngine.payToken(id, 100, accounts[3], []);

            // Should have failed and the status should be 4
            expect(await rcn.balanceOf(accounts[0])).to.eq.BN('0');
            expect(await debtEngine.getStatus(id)).to.eq.BN(STATUS_ONGOING);
            expect(await testModel.getPaid(id)).to.eq.BN('100');
        });
    });
});
