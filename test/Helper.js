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
      cosigner: log.args._cosigner,
    };
  } else if (log.event == PARTIALPAYMENT) {
    return {
      index: log.args._index.toString(),
      sender: log.args._sender,
      from: log.args._from,
      amount: log.args._amount.toString(),
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

function hexArrayToBytesOfBytes32(array) {
    let bytes = "0x";
    for(let i = 0; i < array.length; i++){
        let bytes32 = array[i].toString().replace("0x", "");
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

module.exports = { hexArrayToBytesOfBytes32, toEvents, CREATEDLOAN, APPROVEDBY, LENT, PARTIALPAYMENT, TOTALPAYMENT, DESTROYEDBY };
