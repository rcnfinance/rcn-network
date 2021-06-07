const TestBytesUtils = artifacts.require('TestBytesUtils');

const { time, expectRevert } = require('@openzeppelin/test-helpers');
const { bn } = require('../Helper.js');

contract('Test BytesUtils', function ([_]) {
    let bytesUtils;
    let testData;
    let testStr;
    let dataDecode;
    let now;

    before('Create contracts', async function () {
        bytesUtils = await TestBytesUtils.new();

        testStr = web3.utils.toTwosComplement(web3.utils.soliditySha3('Test'));
        testData = web3.eth.abi.encodeParameters(
            ['uint256', 'address', 'bytes32', 'uint256'],
            [
                bn('123'),
                (bytesUtils.address),
                testStr,
                bn('789'),
            ],
        );

        now = await time.latest();
        dataDecode = [
            '0x0c',
            '0x01',
            testStr,
            bytesUtils.address,
            '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            web3.utils.padLeft(now, 16),
        ];
        dataDecode = '0x' + dataDecode.map(x => x.slice(2)).join('');
    });

    describe('Function readBytes32', async function () {
        it('Read bytes32', async function () {
            assert.equal(await bytesUtils.pReadBytes32(testData, 0), web3.utils.toTwosComplement('123'));
            assert.equal(await bytesUtils.pReadBytes32(testData, 1), web3.utils.toTwosComplement(bytesUtils.address));
            assert.equal(await bytesUtils.pReadBytes32(testData, 2), testStr);
            assert.equal(await bytesUtils.pReadBytes32(testData, 3), web3.utils.toTwosComplement('789'));
        });
        it('Try read out of array', async function () {
            await expectRevert(
                () => bytesUtils.pReadBytes32(
                    testData,
                    4,
                ),
                'Reading bytes out of bounds',
            );

            await expectRevert(
                () => bytesUtils.pReadBytes32(
                    [],
                    0,
                ),
                'Reading bytes out of bounds',
            );
        });
        it('Try invalid length bytes', async function () {
            let testData = web3.eth.abi.encodeParameters(
                ['bytes32', 'bytes32', 'bytes32'],
                [
                    web3.utils.toTwosComplement('123'),
                    web3.utils.toTwosComplement(bytesUtils.address),
                    testStr,
                ],
            );
            testData = testData.slice(0, testData.length - 2);

            // Reading 0 & 1 items should work
            assert.equal(await bytesUtils.pReadBytes32(testData, 0), web3.utils.toTwosComplement('123'));
            assert.equal(await bytesUtils.pReadBytes32(testData, 1), web3.utils.toTwosComplement(bytesUtils.address));

            // Reading index 2 should fail, the word has less than 32 bytes
            await expectRevert(
                () => bytesUtils.pReadBytes32(
                    testData,
                    2,
                ),
                'Reading bytes out of bounds',
            );
        });
    });
    describe('Function read', async function () {
        it('Read offset', async function () {
            assert.equal(await bytesUtils.pRead(testData, 0, 32), web3.utils.toTwosComplement('123'));
            assert.equal(await bytesUtils.pRead(testData, 32, 32), web3.utils.toTwosComplement(bytesUtils.address));
            assert.equal(await bytesUtils.pRead(testData, 64, 32), testStr);
            assert.equal(await bytesUtils.pRead(testData, 96, 32), web3.utils.toTwosComplement('789'));
        });
        it('Read offset packed', async function () {
            const test4 = web3.utils.toTwosComplement(web3.utils.soliditySha3('Test4'));
            const test5 = web3.utils.toTwosComplement(web3.utils.soliditySha3('Test5'));
            const test6 = web3.utils.toTwosComplement(web3.utils.soliditySha3('Test6'));
            let data = [
                '0x0c',
                bytesUtils.address,
                test4,
                test5,
                test6,
                '0x0000000000000000000000000000007c',
                '0x01',
                '0x14eb',
            ];
            data = '0x' + data.map(x => x.slice(2)).join('');

            assert.equal(await bytesUtils.pRead(data, 0, 1), web3.utils.toTwosComplement('12'));
            assert.equal(await bytesUtils.pRead(data, 1, 20), web3.utils.toTwosComplement(bytesUtils.address));
            assert.equal(await bytesUtils.pRead(data, 1 + 20, 32), test4);
            assert.equal(await bytesUtils.pRead(data, 1 + 20 + 32, 32), test5);
            assert.equal(await bytesUtils.pRead(data, 1 + 20 + 32 + 32, 32), test6);
            assert.equal(await bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32, 16), web3.utils.toTwosComplement('124'));
            assert.equal(await bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32 + 16, 1), web3.utils.toTwosComplement('1'));
            assert.equal(await bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32 + 16 + 1, 2), web3.utils.toTwosComplement('5355'));
        });
    });
    describe('Functions decode', async function () {
        it('Decode 1 item', async function () {
            const ret = await bytesUtils.pDecode(dataDecode, 1);

            assert.equal(ret, web3.utils.toTwosComplement('12'));
        });
        it('Decode 2 items', async function () {
            const ret = await bytesUtils.pDecode(dataDecode, 1, 1);

            assert.equal(ret[0], web3.utils.toTwosComplement('12'));
            assert.equal(ret[1], web3.utils.toTwosComplement('1'));
        });
        it('Decode 3 items', async function () {
            const ret = await bytesUtils.pDecode(dataDecode, 1, 1, 32);

            assert.equal(ret[0], web3.utils.toTwosComplement('12'));
            assert.equal(ret[1], web3.utils.toTwosComplement('1'));
            assert.equal(ret[2], testStr);
        });
        it('Decode 4 items', async function () {
            const ret = await bytesUtils.pDecode(dataDecode, 1, 1, 32, 20);

            assert.equal(ret[0], web3.utils.toTwosComplement('12'));
            assert.equal(ret[1], web3.utils.toTwosComplement('1'));
            assert.equal(ret[2], testStr);
            assert.equal(ret[3], web3.utils.toTwosComplement(bytesUtils.address));
        });
        it.skip('Decode 5 items', async function () {
            const ret = await bytesUtils.pDecode(dataDecode, 1, 1, 32, 20, 32);

            assert.equal(ret[0], web3.utils.toTwosComplement('12'));
            assert.equal(ret[1], web3.utils.toTwosComplement('1'));
            assert.equal(ret[2], testStr);
            assert.equal(ret[3], web3.utils.toTwosComplement(bytesUtils.address));
            assert.equal(ret[4], '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        });
        it.skip('Decode 6 items', async function () {
            const ret = await bytesUtils.pDecode(dataDecode, 1, 1, 32, 20, 32, 8);

            assert.equal(ret[0], web3.utils.toTwosComplement('12'));
            assert.equal(ret[1], web3.utils.toTwosComplement('1'));
            assert.equal(ret[2], testStr);
            assert.equal(ret[3], web3.utils.toTwosComplement(bytesUtils.address));
            assert.equal(ret[4], '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
            assert.equal(ret[5], web3.utils.toTwosComplement(now));
        });
    });
});
