const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Test BytesUtils', function () {
  let bytesUtils, testData, testStr, dataDecode, now;

  before('Create contracts', async function () {
    TestBytesUtils = await ethers.getContractFactory('TestBytesUtils');
    bytesUtils = await TestBytesUtils.deploy();

    // Test Data
    testStr = ethers.utils.solidityKeccak256(['string'], ['Test']);
    testData = '0x' +
      '000000000000000000000000000000000000000000000000000000000000007b' + // 123
      '0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3' + // bytesUtils.address
      '85cc825a98ec217d960f113f5f80a95d7fd18e3725d37df428eb14f880bdfc12' + // testStr
      '0000000000000000000000000000000000000000000000000000000000000315';  // 789

    now = (await ethers.provider.getBlock()).timestamp;
    dataDecode = [
      '0x0c',
      '0x01',
      testStr,
      bytesUtils.address,
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      ethers.utils.hexZeroPad(now, 16),
    ];
    dataDecode = '0x' + dataDecode.map(x => x.slice(2)).join('');
  });

  describe('Function readBytes32', async function () {
    it('Read bytes32', async function () {
      expect(await bytesUtils.pReadBytes32(testData, 0)).to.equal(ethers.utils.hexDataSlice(testData , 0, 32));
      expect(await bytesUtils.pReadBytes32(testData, 1)).to.equal(ethers.utils.hexDataSlice(testData , 32, 64));
      expect(await bytesUtils.pReadBytes32(testData, 2)).to.equal(ethers.utils.hexDataSlice(testData , 64, 96));
      expect(await bytesUtils.pReadBytes32(testData, 3)).to.equal(ethers.utils.hexDataSlice(testData , 96, 128));
    });
    it('Try read out of array', async function () {
      await expect(
        bytesUtils.pReadBytes32(testData, 4)
      ).to.be.revertedWith('Reading bytes out of bounds');

      await expect(
        bytesUtils.pReadBytes32([], 0)
      ).to.be.revertedWith('Reading bytes out of bounds');
    });
    it('Try invalid length bytes', async function () {
      let shortTestData = '0x' +
        '000000000000000000000000000000000000000000000000000000000000007b' + // 123
        '0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3' + // bytesUtils.address
        '85cc825a98ec217d960f113f5f80a95d7fd18e3725d37df428eb14f880bdfc12';  // testStr
      shortTestData = shortTestData.slice(0, shortTestData.length - 2);

      // Reading 0 & 1 items should work
      expect(await bytesUtils.pReadBytes32(testData, 0)).to.equal(ethers.utils.hexDataSlice(testData , 0, 32));
      expect(await bytesUtils.pReadBytes32(testData, 1)).to.equal(ethers.utils.hexDataSlice(testData , 32, 64));

      // Reading index 2 should fail, the word has less than 32 bytes
      await expect(
        bytesUtils.pReadBytes32(shortTestData, 2)
      ).to.be.revertedWith('Reading bytes out of bounds');
    });
  });
  describe('Function read', async function () {
    it('Read offset', async function () {
      expect(await bytesUtils.pRead(testData, 0, 32)).to.equal(ethers.utils.hexDataSlice(testData , 0, 32));
      expect(await bytesUtils.pRead(testData, 32, 32)).to.equal(ethers.utils.hexDataSlice(testData , 32, 64));
      expect(await bytesUtils.pRead(testData, 64, 32)).to.equal(ethers.utils.hexDataSlice(testData , 64, 96));
      expect(await bytesUtils.pRead(testData, 96, 32)).to.equal(ethers.utils.hexDataSlice(testData , 96, 128));
    });
    it('Read offset packed', async function () {
      const test4 = ethers.utils.solidityKeccak256(['string'], ['Test4']);
      const test5 = ethers.utils.solidityKeccak256(['string'], ['Test5']);
      const test6 = ethers.utils.solidityKeccak256(['string'], ['Test6']);
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

      expect(await bytesUtils.pRead(data, 0, 1)).to.equal(ethers.utils.hexZeroPad(12, 32));
      expect(await bytesUtils.pRead(data, 1, 20)).to.equal("0x0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3");
      expect(await bytesUtils.pRead(data, 1 + 20, 32)).to.equal(test4);
      expect(await bytesUtils.pRead(data, 1 + 20 + 32, 32)).to.equal(test5);
      expect(await bytesUtils.pRead(data, 1 + 20 + 32 + 32, 32)).to.equal(test6);
      expect(await bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32, 16)).to.equal(ethers.utils.hexZeroPad(124, 32));
      expect(await bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32 + 16, 1)).to.equal(ethers.utils.hexZeroPad(1, 32));
      expect(await bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32 + 16 + 1, 2)).to.equal(ethers.utils.hexZeroPad(5355, 32));
    });
  });
});
