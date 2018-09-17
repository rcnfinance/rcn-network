async function timeTravel(seconds) {
  await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: 0});
  await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
};

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

function isRevertErrorMessage( error ) {
    if( error.message.search('invalid opcode') >= 0 ) return true;
    if( error.message.search('revert') >= 0 ) return true;
    if( error.message.search('out of gas') >= 0 ) return true;
    return false;
};

module.exports = {timeTravel, toBytes32, arrayToBytesOfBytes32, isRevertErrorMessage};
