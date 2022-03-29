const { ethers } = require("hardhat");

module.exports.STATUS_REQUEST = '0';
module.exports.STATUS_ONGOING = '1';
module.exports.STATUS_PAID = '2';
module.exports.STATUS_ERROR = '4';

module.exports.bn = (number) => {
  return ethers.BigNumber.from(number);
};

module.exports.randomHex = (l = 32) => {
  return ethers.utils.hexlify(ethers.utils.randomBytes(l));
};

module.exports.toBytes32 = (x) => {
  return ethers.utils.hexZeroPad(x, 32);
};

module.exports.increaseTime = async (t) => {
  await ethers.provider.send('evm_increaseTime', [t]);
  await ethers.provider.send('evm_mine', []);
}

module.exports.getNow = async () => {
  const nowBlock = await ethers.provider.getBlock();
  return this.bn(nowBlock.timestamp);
}



/*



module.exports.arrayToBytesOfBytes32 = (array) => {
  let bytes = '0x';
  for (let i = 0; i < array.length; i++) {
    let bytes32 = module.exports.toBytes32(array[i]).toString().replace('0x', '');
    if (bytes32.length < 64) {
      const diff = 64 - bytes32.length;
      bytes32 = '0'.repeat(diff) + bytes32;
    }
    bytes += bytes32;
  }

  return bytes;
};

module.exports.getTxTime = async (tx) => {
  if (tx instanceof Promise) {
    tx = await tx;
  }

  const blockNumber = tx.receipt.blockNumber;
  const block = await web3.eth.getBlock(blockNumber);
  return this.bn(block.timestamp);
};

module.exports.toInterestRate = (interest) => {
  const secondsInYear = 360 * 86400;
  const rawInterest = Math.floor(10000000 / interest);
  return rawInterest * secondsInYear;
};

module.exports.almostEqual = (p1, p2, reason, margin = 100) => {
  margin = this.bn(margin);
  const a = this.bn(p1);
  const b = this.bn(p2);
  const diff = a.sub(b).abs();

  assert.isTrue(diff.lte(margin), reason);
};

module.exports.balanceSnap = async (token, address, account = '') => {
  const snapBalance = await token.balanceOf(address);
  return {
    requireConstant: async () => {
      expect(
        snapBalance,
        `${account} balance should remain constant`,
      ).to.equal(
        await token.balanceOf(address),
      );
    },
    requireIncrease: async (delta) => {
      expect(
        snapBalance.add(delta),
        `${account} should increase by ${delta}`,
      ).to.equal(
        await token.balanceOf(address),
      );
    },
    requireDecrease: async (delta) => {
      expect(
        snapBalance.sub(delta),
        `${account} should decrease by ${delta}`,
      ).to.equal(
        await token.balanceOf(address),
      );
    },
    restore: async () => {
      await token.setBalance(address, snapBalance);
    },
  };
};
*/