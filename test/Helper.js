const CREATEDLOAN = 'CreatedLoan';

function toEvents(logs, event) {
  return logs.filter( x => x.event == event).map( x => toEvent(x) );
}

function toEvent(log) {
  if(log.event == CREATEDLOAN)
    return {
      index: log.args._index.toString(),
      borrower: log.args._borrower,
      creator: log.args._creator
    };
  else
    return console.log('-----------Event not found------------');
}

module.exports = { toEvents, CREATEDLOAN };
