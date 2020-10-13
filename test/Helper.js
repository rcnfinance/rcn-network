const BN = web3.utils.BN;

const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

module.exports.expect = expect;

module.exports.address0x = '0x0000000000000000000000000000000000000000';
module.exports.bytes320x = '0x0000000000000000000000000000000000000000000000000000000000000000';

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

module.exports.increaseTime = function increaseTime (duration) {
    const id = Date.now();
    const delta = duration.toNumber !== undefined ? duration.toNumber() : duration;

    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [delta],
            id: id,
        },
        err1 => {
            if (err1) return reject(err1);

            web3.currentProvider.send({
                jsonrpc: '2.0',
                method: 'evm_mine',
                id: id + 1,
            },
            (err2, res) => {
                return err2 ? reject(err2) : resolve(res);
            });
        });
    });
};

module.exports.isRevertErrorMessage = (error) => {
    if (error.message.search('invalid opcode') >= 0) return true;
    if (error.message.search('revert') >= 0) return true;
    if (error.message.search('out of gas') >= 0) return true;
    return false;
};

module.exports.getBlockTime = async () => {
    const block = await web3.eth.getBlock(await web3.eth.getBlockNumber());
    return block.timestamp;
};

module.exports.getTxTime = async (tx) => {
    if (tx instanceof Promise) {
        tx = await tx;
    }

    const blockNumber = tx.receipt.blockNumber;
    const block = await web3.eth.getBlock(blockNumber);
    return block.timestamp;
};

module.exports.assertThrow = async (promise) => {
    try {
        await promise;
    } catch (error) {
        const invalidJump = error.message.search('invalid JUMP') >= 0;
        const revert = error.message.search('revert') >= 0;
        const invalidOpcode = error.message.search('invalid opcode') > 0;
        const outOfGas = error.message.search('out of gas') >= 0;
        assert(
            invalidJump || outOfGas || revert || invalidOpcode,
            'Expected throw, got \'' + error + '\' instead',
        );
        return;
    }
    throw new Error('Expected throw not received');
};

// the promiseFunction should be a function
module.exports.tryCatchRevert = async (promise, message, headMsg = 'revert ') => {
    if (message === '') {
        headMsg = headMsg.slice(0, -1);
        console.log('    \u001b[93m\u001b[2m\u001b[1m⬐ Warning:\u001b[0m\u001b[30m\u001b[1m There is an empty revert/require message');
    }
    try {
        if (promise instanceof Function) {
            await promise();
        } else {
            await promise;
        }
    } catch (error) {
        assert(
            error.message.search(headMsg + message) >= 0 || process.env.SOLIDITY_COVERAGE,
            'Expected a revert \'' + headMsg + message + '\', got \'' + error.message + '\' instead'
        );
        return;
    }
    throw new Error('Expected throw not received');
};

module.exports.toInterestRate = (interest) => {
    const secondsInYear = 360 * 86400;
    const rawInterest = Math.floor(10000000 / interest);
    return rawInterest * secondsInYear;
};

module.exports.buyTokens = async (token, amount, account) => {
    const prevAmount = await token.balanceOf(account);
    await token.buyTokens(account, { from: account, value: amount / 4000 });
    const newAmount = await token.balanceOf(account);
    assert.equal(newAmount.sub(prevAmount), amount.toString(), 'Should have minted tokens');
};

module.exports.searchEvent = (tx, eventName) => {
    const event = tx.logs.filter(x => x.event === eventName).map(x => x.args);
    assert.equal(event.length, 1, 'Should have only one ' + eventName);
    return event[0];
};

module.exports.toEvents = async (tx, ...events) => {
    if (tx instanceof Promise) {
        tx = await tx;
    }

    const logs = tx.logs;

    let eventObjs = [].concat.apply(
        [],
        events.map(
            event => logs.filter(
                log => log.event === event
            )
        )
    );

    if (eventObjs.length === 0 || eventObjs.some(x => x === undefined)) {
        console.log('\t\u001b[91m\u001b[2m\u001b[1mError: The event dont find');
        assert.fail();
    }
    eventObjs = eventObjs.map(x => x.args);
    return (eventObjs.length === 1) ? eventObjs[0] : eventObjs;
};

module.exports.eventNotEmitted = async (receipt, eventName) => {
    const logsCount = receipt.logs.length;
    assert.equal(logsCount, 0, 'Should have not emitted the event ' + eventName);
};

module.exports.almostEqual = async (p1, p2, reason, margin = 3) => {
    margin = this.bn(margin);
    const a = this.bn(await p1);
    const b = this.bn(await p2);
    const diff = a.sub(b).abs();

    assert.isTrue(diff.lt(margin), reason);
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
