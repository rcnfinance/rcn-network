const CREATEDLOAN = 'CreatedLoan';
const APPROVEDBY = 'ApprovedBy';
const LENT = 'Lent';
const PARTIALPAYMENT = 'PartialPayment';
const TOTALPAYMENT = 'TotalPayment';
const DESTROYEDBY = 'DestroyedBy';

function toEvents(logs, event) {
  return logs.filter( x => x.event == event).map( x => toEvent(x) );
}

function toEvent(log) {
  if(log.event == CREATEDLOAN) {
    return {
      index: log.args._index.toString(),
      borrower: log.args._borrower,
      creator: log.args._creator
    };
  } else if (log.event == APPROVEDBY) {
    return {
      index: log.args._index.toString(),
      address: log.args._address
    };
  } else if (log.event == LENT) {
    return {
      index: log.args._index.toString(),
      lender: log.args._lender,
      cosigner: log.args._cosigner
    };
  } else if (log.event == PARTIALPAYMENT) {
    return {
      index: log.args._index.toString(),
      sender: log.args._sender,
      from: log.args._from,
      total: log.args._total.toString(),
      interest: log.args._interest.toString()
    };
  } else if (log.event == TOTALPAYMENT) {
    return {
      index: log.args._index.toString()
    };
  } else if (log.event == DESTROYEDBY) {
    return {
      index: log.args._index.toString(),
      address: log.args._address
    };
  } else
    console.log('-----------Event not found------------');
}

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
    console.warn("Becareful the revert message its empty");
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

async function readLoanId(recepit) {
  return toEvents(recepit.logs, CREATEDLOAN)[0].index;
}

module.exports = {
  toEvents, arrayToBytesOfBytes32, getBlockTime, tryCatchRevert,
  toBytes32, increaseTime, isRevertErrorMessage, assertThrow,
  toInterestRate, buyTokens, readLoanId, isRevertErrorMessage,
  CREATEDLOAN, APPROVEDBY, LENT, PARTIALPAYMENT, TOTALPAYMENT, DESTROYEDBY
};
