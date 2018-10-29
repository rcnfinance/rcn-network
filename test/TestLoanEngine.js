const LoanEngine = artifacts.require("./cobalt/LoanEngine.sol");
const TestToken = artifacts.require("./utils/test/TestToken.sol");
const TestOracle = artifacts.require("./utils/test/TestOracle.sol");
const TestCosigner = artifacts.require("./utils/test/TestCosigner.sol");
const Helper = require('./Helper.js');

contract('LoanEngine', function(accounts) {
  let rcn;
  let engine;
  let oracle;
  let cosigner;

  function readLoanId(tx) {
    return Helper.searchEvent(tx, 'CreatedLoan')._index;
  }

  before("Create engine and token", async function(){
    rcn = await TestToken.new();
    engine = await LoanEngine.new(rcn.address, {from:accounts[0]});
    oracle = await TestOracle.new();
    cosigner = await TestCosigner.new(rcn.address);
  })

  it("check events", async function(){
    // CreatedLoan(uint _index, address _borrower, address _creator);
    const createdLoan = Helper.searchEvent(
      await engine.requestLoan(
        0x0, accounts[8], 0x0, Helper.toInterestRate(240), 2000, 2000, 1, 30 * 86400, 10 ** 10, "events test", { from: accounts[9] }
      ), 'CreatedLoan'
    );

    assert.equal(createdLoan._index, (await engine.getTotalLoans()).toNumber() - 1);
    assert.equal(createdLoan._borrower, accounts[8], "The borrower of the event should be the borrower of the loan" );
    assert.equal(createdLoan._creator, accounts[9], "The creator of the event should be the creator of the loan" );
    const loanId = createdLoan._index;

    // ApprovedBy(uint _index, address _address);
    const approvedBy = Helper.searchEvent(
      await engine.approveLoan(loanId, { from: accounts[8] }),
      'ApprovedBy'
    );

    assert.equal(approvedBy._index.toString(), loanId.toString(), "The index of the event should be the " + loanId.toString());
    assert.equal(approvedBy._address, accounts[8], "The address of the event should be the borrower");

    // Lent(uint _index, address _lender, address _cosigner);
    await Helper.buyTokens(rcn, 8000, accounts[2]);
    await rcn.approve(engine.address, 8000, { from: accounts[2] });
    const cosignerData = Helper.arrayToBytesOfBytes32([web3.sha3("test_oracle"), loanId]);
    const lent = await Helper.searchEvent(
      await engine.lend(loanId, [], cosigner.address, cosignerData, { from: accounts[2] }),
      'Lent'
    );

    assert.equal(lent._index.toString(), loanId.toString(), "The index of the event should be the " + loanId.toString());
    assert.equal(lent._lender, accounts[2], "The lender of the event should be the lender");
    assert.equal(lent._cosigner, cosigner.address, "The cosigner of the event should be the cosigner");

    // PartialPayment(uint _index, address _sender, address _from, uint256 _total, uint256 _interest);
    await Helper.buyTokens(rcn, 8000, accounts[3]);
    await rcn.approve(engine.address, 8000, { from: accounts[3] });

    const partialPayment = await Helper.searchEvent(
      await engine.pay(loanId, 10, accounts[4], 0x0, { from: accounts[2] }),
      'PartialPayment'
    );

    assert.equal(partialPayment._index.toString(), loanId.toString(), "The index of the event should be the " + loanId.toString());
    assert.equal(partialPayment._sender, accounts[2], "The lender of the event should be the lender");
    assert.equal(partialPayment._from, accounts[4], "The cosigner of the event should be the cosigner");
    assert.equal(partialPayment._total, 10, "The total of the event should be 10");
    assert.equal(partialPayment._interest, 0, "The interest of the event should be 0");
    // Partial pay to a loan with interest
    await Helper.increaseTime(31 * 86400);
    await Helper.buyTokens(rcn, 8000, accounts[3]);
    await rcn.approve(engine.address, 8000, { from: accounts[3] });

    const partialPaymentWithInterest = await Helper.searchEvent(
      await engine.pay(loanId, 100, accounts[4], 0x0, { from: accounts[2] }),
      'PartialPayment'
    );

    assert.equal(partialPaymentWithInterest._interest, 13, "The interest of the event should be 13");

    // TotalPayment(uint _index);
    await Helper.buyTokens(rcn, 8000, accounts[3]);
    await rcn.approve(engine.address, 8000, { from: accounts[3] });

    const totalPayment = await Helper.searchEvent(
      await engine.pay(loanId, 3000, accounts[4], 0x0, { from: accounts[2] }),
      'PartialPayment'
    );

    assert.equal(totalPayment._index.toString(), loanId.toString(), "The index of the event should be the " + loanId.toString());

    // DestroyedBy(uint _index, address _address);
    const loanId2 = readLoanId(
      await engine.requestLoan(0x0, accounts[8], 0x0, Helper.toInterestRate(240), 2000, 100, 20, 30 * 86400, 10 ** 10, "destroy test")
    );

    const destroyedBy = await Helper.searchEvent(
      await engine.destroy(loanId2, { from: accounts[8] }),
      'DestroyedBy'
    );

    assert.equal(destroyedBy._index.toString(), loanId2.toString(), "The index of the event should be the " + loanId2.toString());
    assert.equal(destroyedBy._address, accounts[8], "The address of the event should be the borrower");
  })

  it("approve loan test", async function(){
    const loanId = readLoanId(await engine.requestLoan(
      0x0,                        // oracle
      accounts[8],                // borrower
      0x0,                        // currency
      Helper.toInterestRate(240), // interestRatePunitory
      100,                        // amount
      10,                         // cuota
      10,                         // installments
      30 * 86400,                 // installmentDuration
      10 ** 10,                   // requestExpiration
      "approveLoan()"             // metadata
    ));
    assert.equal(await engine.getApproved(loanId), false, "The loan must not be approved");
    // try approve a loan with other account
    await Helper.tryCatchRevert(() => engine.approveLoan(loanId, { from: accounts[1] }), "Only the borrower can approve the loan");
    // approve a loan approveLoan()
    await engine.approveLoan(loanId, { from: accounts[8] });
    assert.equal(await engine.getApproved(loanId), true, "The loan should be approved");
     // try approve an appoved loan
    await Helper.tryCatchRevert(() => engine.approveLoan(loanId, { from: accounts[8] }), "The loan should be not approved");
    // try to approve a loan with a status other than request
    const loanId2 = readLoanId(await engine.requestLoan(
      0x0,                        // oracle
      accounts[8],                // borrower
      0x0,                        // currency
      Helper.toInterestRate(240), // interestRatePunitory
      100,                        // amount
      10,                         // cuota
      10,                         // installments
      30 * 86400,                 // installmentDuration
      10 ** 10,                   // requestExpiration
      "approveLoan2()"            // metadata
    ));
    await engine.destroy(loanId2, { from: accounts[8] });
    // approve a loan with identifier approveLoanIdentifier()
    const loanId3 = readLoanId(await engine.requestLoan(
      0x0,                        // oracle
      accounts[8],                // borrower
      0x0,                        // currency
      Helper.toInterestRate(240), // interestRatePunitory
      100,                        // amount
      10,                         // cuota
      10,                         // installments
      30 * 86400,                 // installmentDuration
      10 ** 10,                   // requestExpiration
      "approveLoanIdentifier()"   // metadata
    ));
    const identifier3 = await engine.getIdentifier(loanId3);
    await engine.approveLoanIdentifier(identifier3, { from: accounts[8] });
    assert.equal(await engine.getApproved(loanId3), true, "The loan should be approved");
  })

  it("It should fail creating two identical loans", async() => {
    // create a new loan
    let loanId1 = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(12),
      Helper.toInterestRate(22),
      web3.toWei(2),
      2,
      86400,
      10 ** 10,
      "This is the a loan"
    ));
    assert.equal(loanId1, (await engine.getTotalLoans()).toNumber() - 1);

    // create one a little bit different
    let loanId2 = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(12),
      Helper.toInterestRate(22),
      web3.toWei(2),
      6,
      86400,
      10 ** 10,
      "This is the a loan"
    ));
    assert.equal(loanId2, (await engine.getTotalLoans()).toNumber() - 1);

    // create a new identical
    await Helper.tryCatchRevert(() => engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(12),
      Helper.toInterestRate(22),
      web3.toWei(2),
      2,
      86400,
      10 ** 10,
      "This is the a loan"
    ), "Loan already exists");
  })

  it("It should handle a loan with a single installment", async function(){
    let loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(20),
      web3.toWei(100),
      web3.toWei(110),
      1,
      360 * 86400,
      10 ** 10,
      "Really really quick loan"
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await Helper.buyTokens(rcn, web3.toWei(100), accounts[2]);
    await rcn.approve(engine.address, web3.toWei(100), { from: accounts[2] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[2] });

    assert.equal(await engine.ownerOf(loanId), accounts[2], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getInstallments(loanId), 1, "The loan should be in the first installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), web3.toWei(110), "installment debt should be 100 plus interest")

    await Helper.buyTokens(rcn, web3.toWei(10), accounts[1]);
    await rcn.approve(engine.address, web3.toWei(110), { from: accounts[1] });
    await engine.pay(loanId, web3.toWei(110), accounts[1], 0x0, { from: accounts[1] });

    assert.equal(await engine.getPaid(loanId), web3.toWei(110), "Paid should be 110 RCN");
    assert.equal(await engine.getStatus(loanId), 2, "Loan should be paid");
  })
  it("It should return the tokens if an extra paid is made on a loan of a single installment", async function(){
    let loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(20),
      web3.toWei(100),
      web3.toWei(110),
      1,
      360 * 86400,
      10 ** 10,
      "Really really quick loan 2"
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await Helper.buyTokens(rcn, web3.toWei(100), accounts[2]);
    await rcn.approve(engine.address, web3.toWei(100), { from: accounts[2] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[2] });

    assert.equal(await engine.ownerOf(loanId), accounts[2], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal((await engine.getCheckpoint(loanId)).toNumber(), 1, "The loan should be in the first installment");
    assert.equal(await engine.getCurrentDebt(loanId), web3.toWei(110), "installment debt should be 100 plus interest")

    await Helper.buyTokens(rcn, web3.toWei(20), accounts[1]);
    await rcn.approve(engine.address, web3.toWei(120), { from: accounts[1] });
    await engine.pay(loanId, web3.toWei(120), accounts[1], 0x0, { from: accounts[1] });

    assert.equal(await engine.getPaid(loanId), web3.toWei(110), "Paid should be 110 RCN");
    assert.equal(await engine.getStatus(loanId), 2, "Loan should be paid");
    assert.equal(await rcn.balanceOf(accounts[1]), web3.toWei(10), "The borrower should have it's 10 RCN back")
  })
  it("It should handle a loan with more than a installment", async function(){
    let loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(240),
      300,
      110,
      3,
      30 * 86400,
      10 ** 10,
      "Really really quick loan"
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await Helper.buyTokens(rcn, 40000, accounts[2]);
    await rcn.approve(engine.address, 300, { from: accounts[2] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[2] });

    assert.equal(await engine.ownerOf(loanId), accounts[2], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first installment");
    assert.equal(await engine.getCurrentDebt(loanId), 330 / 3, "installment debt should be 100 plus interest = 110")

    await Helper.buyTokens(rcn, 4000, accounts[8]);
    await rcn.approve(engine.address, 110, { from: accounts[8] });
    await engine.pay(loanId, 110, accounts[8], 0x0, { from: accounts[8] });

    assert.equal(await engine.getPaid(loanId), 110, "Paid should be 110 RCN");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be still ongoing");
  })
  it("It should handle a loan with more than a installment in advance, totally", async function(){
    let loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[8],
      0x0,
      Helper.toInterestRate(240),
      1000,
      110,
      10,
      30 * 86400,
      10 ** 10,
      ""
    ));

    await engine.approveLoan(loanId, { from: accounts[8] })

    await Helper.buyTokens(rcn, 4000, accounts[3]);
    await rcn.approve(engine.address, 1000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first installment");
    assert.equal(await engine.getCurrentDebt(loanId), 110, "installment debt should be 100 plus interest = 110")

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await Helper.buyTokens(rcn, 4000, accounts[8]);
    await rcn.approve(engine.address, 4000, { from: accounts[8] });
    await engine.pay(loanId, 4000, accounts[8], 0x0, { from: accounts[8] });

    assert.equal(await engine.getStatus(loanId), 2, "Loan should be paid");
    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 10, "Paid should be 1100 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 1100, "Expended amount should be 1100 RCN");
  })
  it("It should handle a loan with more than a installment in advance, partially", async function(){
    let loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[8],
      0x0,
      Helper.toInterestRate(240),
      1000,
      110,
      10,
      31 * 86400,
      10 ** 10,
      "2!"
    ));

    await engine.approveLoan(loanId, { from: accounts[8] })

    await Helper.buyTokens(rcn, 4000, accounts[3]);
    await rcn.approve(engine.address, 1000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first installment");
    assert.equal(await engine.getCurrentDebt(loanId), 110, "installment debt should be 100 plus interest = 110")

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await Helper.buyTokens(rcn, 4000, accounts[8]);
    await rcn.approve(engine.address, 330, { from: accounts[8] });
    await engine.pay(loanId, 330, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 3, "Paid should be 330 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 330, "Expended amount should be 1100 RCN");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be still ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 4, "Current installment should be 4");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 110, "Current installment debt should be 110 RCN");

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await Helper.buyTokens(rcn, 4000, accounts[8]);
    await rcn.approve(engine.address, 150, { from: accounts[8] });
    await engine.pay(loanId, 150, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 3 + 150, "Paid should be 480 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 150, "Expended amount should be 1100 RCN");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be still ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 5, "Current installment should be 5");
    assert.equal(await engine.getCurrentDebt(loanId), 70, "Current installment debt should be 70 RCN");

    // Pay the rest of the loan
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await Helper.buyTokens(rcn, 4000, accounts[8]);
    await rcn.approve(engine.address, 4000, { from: accounts[8] });
    await engine.pay(loanId, 4000, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 1100, "Paid should be 1100 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 620, "Expended amount should be 620 RCN");
    assert.equal(await engine.getStatus(loanId), 2, "Loan should be still paid");
    assert.equal(await engine.getCheckpoint(loanId), 10, "Current installment should be 10");
    assert.equal(await engine.getCurrentDebt(loanId), 0, "Current installment debt should be 0 RCN");
  })
  it("Should only charge the exact extra interest", async function(){
    const loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(35 * 1,5),
      1000000,
      99963,
      12,
      30 * 86400,
      10 ** 10,
      ""
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await Helper.buyTokens(rcn, 1000000, accounts[3]);
    await rcn.approve(engine.address, 1000000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "All installments should be base 99963")
  })
  it("It should calculate the interest like the test doc test 1", async function() {
    const loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(35 * 1.5),
      1000000,
      99963,
      12,
      30 * 86400,
      10 ** 10,
      "Test table example 1"
    ), { from: accounts[1] });

    await engine.approveLoan(loanId, { from: accounts[1] })

    await Helper.buyTokens(rcn, 1000000, accounts[3]);
    await rcn.approve(engine.address, 1000000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first installment");
    assert.equal(await engine.getCurrentDebt(loanId), 99963, "installment debt should be 99963");

    // Pay the full next installment in a couple of days
    await Helper.increaseTime(7 * 86400);

    assert.equal(await engine.getCurrentDebt(loanId), 99963, "installment debt should still be 99963");

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 2, "The loan should installmentinstallmentbe in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait a month and a week
    await Helper.increaseTime((30 + 7) * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 3, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait a month and a week
    await Helper.increaseTime(30 * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 4, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait to the next payment, exactly
    await Helper.increaseTime(30 * 86400);

    // Wait to the next payment, exactly
    await Helper.increaseTime(16 * 86400);

    // Past the payment date by 5 days
    await Helper.increaseTime(5 * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 400000, accounts[8]);
    await rcn.approve(engine.address, 100691, { from: accounts[8] });
    await engine.pay(loanId, 100691, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 5, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait to the next payment, exactly
    await Helper.increaseTime(25 * 86400);

    // Pass the payment date by 20 days
    await Helper.increaseTime(20 * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 400000, accounts[8]);
    await rcn.approve(engine.address, 102878, { from: accounts[8] });
    await engine.pay(loanId, 102878, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 6, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait to the next payment minus 1 day
    await Helper.increaseTime(9 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 7, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait to the next payment
    await Helper.increaseTime(30 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 8, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait to exactly the payment date
    await Helper.increaseTime(30 * 86400);
    await Helper.increaseTime(86400);

    // Pass the payment date by 15 days
    await Helper.increaseTime(15 * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 400000, accounts[8]);
    await rcn.approve(engine.address, 102149, { from: accounts[8] });
    await engine.pay(loanId, 102149, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 9, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait for the next payment date
    await Helper.increaseTime(14 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 10, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait to the next payment
    await Helper.increaseTime(30 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 11, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait to the next payment
    await Helper.increaseTime(30 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 12, "The loan should be in the next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Wait to the next payment
    await Helper.increaseTime(30 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 100000, accounts[8]);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getStatus(loanId), 2, "The loan should be fully paid");
    assert.equal((await engine.getPaid(loanId)).toNumber(), 1205385, "The borrower should have paid 1205385 in total");
  })
  it("It should calculate the interest like the test doc test 3", async function() {
    const loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(35 * 1.5),
      1000000,
      99963,
      12,
      30 * 86400,
      10 ** 10,
      "Test table example 3"
    ), { from: accounts[1] });

    await engine.approveLoan(loanId, { from: accounts[1] })

    await Helper.buyTokens(rcn, 1000000, accounts[3]);
    await rcn.approve(engine.address, 1000000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first installment");
    assert.equal(await engine.getCurrentDebt(loanId), 99963, "installment debt should be 99963");

    // Pay the next 3 months in advance
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 10 ** 18, accounts[8]);
    await rcn.approve(engine.address, 99963 * 3, { from: accounts[8] });
    await engine.pay(loanId, 99963 * 3, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 4, "The loan should be in the 4 next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");
    assert.equal(await engine.getPaid(loanId), 99963 * 3, "Paid should be the amount of 3 installments");
    assert.equal(await engine.getLenderBalance(loanId), 99963 * 3, "Lender balance should equal pay");

    // Pass 4 months to the next loan expire time
    await Helper.increaseTime(4 * 30 * 86400);

    // Pass 12 days from the due date
    await Helper.increaseTime(12 * 86400);

    // Pay the total of the current debt
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 10 ** 18, accounts[8]);
    await rcn.approve(engine.address, 101712, { from: accounts[8] });
    await engine.pay(loanId, 101712, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 5, "The loan should now be in the 5 next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");

    // Advance to the next month
    await Helper.increaseTime(18 * 86400);

    // And to the next...
    await Helper.increaseTime(30 * 86400);

    // And to the next...
    await Helper.increaseTime(30 * 86400);

    // Pay the total of the current debt
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 10 ** 18, accounts[8]);
    await rcn.approve(engine.address, 250000, { from: accounts[8] });
    await engine.pay(loanId, 250000, accounts[8], 0x0, { from: accounts[8] }); // 250000
    assert.equal(await engine.getCheckpoint(loanId), 7, "The loan should now be in the 7 installment");

    // Advance to the next month
    await Helper.increaseTime(30 * 86400);
    // Poke the contract
    await engine.pay(loanId, 0, 0x0, 0x0);
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 165727)

    // Pay thr rest of the loan
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 10 ** 18, accounts[8]);
    await rcn.approve(engine.address, 10 ** 18, { from: accounts[8] });
    await engine.pay(loanId, 10 ** 18, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getStatus(loanId), 2, "The loan should be fully paid");
    assert.equal(await engine.getCheckpoint(loanId), 12, "The loan should now be in the 12 next installment");
    assert.equal((await engine.getPaid(loanId)).toNumber(), 1217180, "Paid should be the amount be 1214717");
    assert.equal(await engine.getLenderBalance(loanId), 1217180, "Lender balance should equal pay");
  })

  it("It should calculate the interest like the test doc test 4", async function() {
    const loanId = readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(35 * 1.5),
      1000000,
      99963,
      12,
      30 * 86400,
      10 ** 10,
      "Test table example 3",
      { from: accounts[1] })
    );

    // Lend!
    await Helper.buyTokens(rcn, 1000000, accounts[3]);
    await rcn.approve(engine.address, 1000000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first installment");
    assert.equal(await engine.getCurrentDebt(loanId), 99963, "installment debt should be 99963");

    // Pay the next 3 months in advance
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await Helper.buyTokens(rcn, 10 ** 18, accounts[8]);
    await rcn.approve(engine.address, 99963 * 4, { from: accounts[8] });
    await engine.pay(loanId, 99963 * 4, accounts[8], 0x0, { from: accounts[8] });
    assert.equal((await engine.getCheckpoint(loanId)).toNumber(), 5, "The loan should be in the 5 next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "installment debt now be 99963 again, the next installment");
    assert.equal(await engine.getPaid(loanId), 99963 * 4, "Paid should be the amount of 3 installments");
    assert.equal(await engine.getLenderBalance(loanId), 99963 * 4, "Lender balance should equal pay");

    // Lets stop the payments
    // Advance 3 months and take a look
    await Helper.increaseTime((4 + 4) * 30 * 86400);

    // Awake the loan
    // pay 0 tokens
    await engine.pay(loanId, 0, 0x0, 0x0);
    assert.equal(await engine.getCheckpoint(loanId), 8, "The loan should be in the 7 next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 426091);

    // Advance the last 4 months
    await Helper.increaseTime(4 * 30 * 86400);

    // Awake the loan
    // pay 0 tokens
    await engine.pay(loanId, 0, 0x0, 0x0);
    assert.equal(await engine.getCheckpoint(loanId), 12, "The loan should be in the 12 next installment");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 922155); // 922159
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
  })

  it("It should fail to create a loan if deprecated", async function(){
    await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(10),
      Helper.toInterestRate(20),
      web3.toWei(100),
      1,
      360 * 86400,
      10 ** 10,
      "Test create loan pre-deprecated"
    );

    await engine.setDeprecated(accounts[9]);

    await Helper.tryCatchRevert(() => engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(10),
      Helper.toInterestRate(20),
      web3.toWei(100),
      1,
      360 * 86400,
      10 ** 10,
      "This loan should fail, the engine is deprecated"
    ), "The engine is deprectaed")

    await engine.setDeprecated(0x0);

    await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      Helper.toInterestRate(10),
      Helper.toInterestRate(20),
      web3.toWei(100),
      1,
      360 * 86400,
      10 ** 10,
      "Test create loan post-deprecated"
    );
  })
})
