function arrayToBytesOfBytes32(array) {
  let bytes = "0x";
  for(let i = 0; i < array.length; i++){
    let bytes32 = toBytes32(array[i]).toString().replace("0x", "");
    if (bytes32.length < 64) {
      const diff = 64 - bytes32.length;
      bytes32 = "0".repeat(diff) + bytes32;
    }
    bytes += bytes32;
  }

  return bytes;
}

function toBytes32(source) {
  source = web3.toHex(source);
  const rl = 64;
  source = source.toString().replace("0x", "");
  if (source.length < rl) {
    const diff = 64 - source.length;
    source = "0".repeat(diff) + source;
  }
  return "0x" + source;
}

async function increaseTime(delta) {
  await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [delta], id: 0});
}

function isRevertErrorMessage( error ) {
  if( error.message.search('invalid opcode') >= 0 ) return true;
  if( error.message.search('revert') >= 0 ) return true;
  if( error.message.search('out of gas') >= 0 ) return true;
  return false;
}

async function getBlockTime() {
  return (await web3.eth.getBlock("pending")).timestamp;
}

async function assertThrow(promise) {
  try {
    await promise;
  } catch (error) {
    const invalidJump = error.message.search('invalid JUMP') >= 0;
    const revert = error.message.search('revert') >= 0;
    const invalidOpcode = error.message.search('invalid opcode') >0;
    const outOfGas = error.message.search('out of gas') >= 0;
    assert(
      invalidJump || outOfGas || revert || invalidOpcode,
      "Expected throw, got '" + error + "' instead",
    );
    return;
  }
  assert.fail('Expected throw not received');
};
// the promiseFunction should be a function
async function tryCatchRevert(promiseFunction, message) {
  let headMsg = 'revert ';
  if(message == "") {
    headMsg = headMsg.slice(0, headMsg.length -1);
    console.warn("    \033[93m\033[2m⬐\033[0m \033[1;30m\033[2mWarning: There is an empty revert/require message");
  }
  try {
    await promiseFunction();
  } catch (error) {
    assert(
      error.message.search(headMsg + message) >= 0,
      "Expected a revert '" + headMsg + message + "', got '" + error.message + "' instead"
    );
    return;
  }
  assert.fail('Expected throw not received');
}

function toInterestRate(interest) {
  return Math.floor((10000000 / interest) * 360 * 86400);
}

async function buyTokens(token, amount, account) {
  const prevAmount = await token.balanceOf(account);
  const buyResult = await token.buyTokens(account, { from: account, value: amount / 4000 });
  const newAmount = await token.balanceOf(account);
  assert.equal(newAmount.toNumber() - prevAmount.toNumber(), amount, "Should have minted tokens")
}

function searchEvent(tx, eventName) {
    const event = tx.logs.filter( x => x.event == eventName).map( x => x.args );
    assert.equal(event.length, 1, "Should have only one " + eventName);
    return event[0];
}

async function almostEqual(p1, p2, reason, margin = 3) {
  assert.isBelow(Math.abs(await p1 - await p2), margin, reason);
}

module.exports = {
  arrayToBytesOfBytes32, assertThrow, tryCatchRevert,
  toBytes32, increaseTime, searchEvent, getBlockTime,
  toInterestRate, buyTokens, isRevertErrorMessage, almostEqual
};
