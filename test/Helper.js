const BN = web3.utils.BN;

const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

module.exports.expect = expect;

module.exports.STATUS_REQUEST = '0';
module.exports.STATUS_ONGOING = '1';
module.exports.STATUS_PAID = '2';
module.exports.STATUS_ERROR = '4';

module.exports.bn = (number) => {
    return web3.utils.toBN(number);
};

module.exports.random32 = () => {
    return this.bn(web3.utils.randomHex(32));
};

module.exports.random32bn = () => {
    return this.bn(this.random32());
};

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

module.exports.toBytes32 = (source) => {
    source = web3.utils.toHex(source);
    const rl = 64;
    source = source.toString().replace('0x', '');
    if (source.length < rl) {
        const diff = 64 - source.length;
        source = '0'.repeat(diff) + source;
    }
    return '0x' + source;
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
                `${account} balance should remain constant`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        requireIncrease: async (delta) => {
            expect(
                snapBalance.add(delta),
                `${account} should increase by ${delta}`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        requireDecrease: async (delta) => {
            expect(
                snapBalance.sub(delta),
                `${account} should decrease by ${delta}`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        restore: async () => {
            await token.setBalance(address, snapBalance);
        },
    };
};
