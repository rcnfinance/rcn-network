
module.exports.address0x = '0x0000000000000000000000000000000000000000';

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

module.exports.increaseTime = function increaseTime(duration) {
    const id = Date.now();

    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [duration],
            id: id
        },
        err1 => {
            if (err1) return reject(err1);

            web3.currentProvider.send({
                jsonrpc: "2.0",
                method: "evm_mine",
                id: id + 1
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
    return (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
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
    assert.fail('Expected throw not received');
};

// the promiseFunction should be a function
module.exports.tryCatchRevert = async (promise, message) => {
    let headMsg = 'revert ';
    if (message === '') {
        headMsg = headMsg.slice(0, headMsg.length - 1);
    //  console.warn("    \033[93m\033[2m⬐\033[0m \033[1;30m\033[2mWarning: There is an empty revert/require message");
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
            'Expected a revert \'' + headMsg + message + '\', got ' + error.message + '\' instead'
        );
        return;
    }
    assert.fail('Expected throw not received');
};

module.exports.toInterestRate = (interest) => {
    return Math.floor((10000000 / interest) * 360 * 86400);
};

module.exports.buyTokens = async (token, amount, account) => {
    const prevAmount = await token.balanceOf(account);
    await token.buyTokens(account, { from: account, value: amount / 4000 });
    const newAmount = await token.balanceOf(account);
    assert.equal(newAmount - prevAmount, amount, 'Should have minted tokens');
};

module.exports.searchEvent = (tx, eventName) => {
    const event = tx.logs.filter(x => x.event === eventName).map(x => x.args);
    assert.equal(event.length, 1, 'Should have only one ' + eventName);
    return event[0];
};

module.exports.eventNotEmitted = async (receipt, eventName) => {
    const logsCount = receipt.logs.length;
    assert.equal(logsCount, 0, 'Should have not emitted the event ' + eventName);
};

module.exports.almostEqual = async (p1, p2, reason, margin = 3) => {
    assert.isBelow(Math.abs(await p1 - await p2), margin, reason);
};
