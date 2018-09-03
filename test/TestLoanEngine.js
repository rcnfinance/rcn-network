var TestToken = artifacts.require("./utils/TestToken.sol");
var LoanEngine = artifacts.require("./LoanEngine.sol");
var TestOracle = artifacts.require("./examples/TestOracle.sol");
var TestCosigner = artifacts.require("./examples/TestCosigner.sol");

contract('LoanEngine', function(accounts) {
  let rcn;
  let engine;
  let oracle;
  let cosigner;

  before("Create engine and token", async function(){
    rcn = await TestToken.new();
    engine = await LoanEngine.new(rcn.address, {from:accounts[0]});
    oracle = await TestOracle.new();
    cosigner = await TestCosigner.new(rcn.address);
  })

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

  function toInterestRate(interest) { return (10000000 / interest) * 360 * 86400;  }

  async function increaseTime(delta) {
      await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [delta], id: 0});
  }

  async function buyTokens(account, amount) {
      let prevAmount = await rcn.balanceOf(account);
      let buyResult = await rcn.buyTokens(account, { from: account, value: amount / 4000 });
      let newAmount = await rcn.balanceOf(account);
      assert.equal(newAmount.toNumber() - prevAmount.toNumber(), amount, "Should have minted tokens")
  }

  async function readLoanId(recepit) {
    // FIXME: Read event logs
    return (await engine.getTotalLoans()).toNumber() - 1;
  }

  it("It should fail creating two identical loans", async() => {
    // create a new loan
    let loanId1 = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(12),
      toInterestRate(22),
      web3.toWei(2),
      2,
      86400,
      10 ** 10,
      "This is the a loan"
    ));
    assert.equal(loanId1, 1)

    // create one a little bit different
    let loanId2 = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(12),
      toInterestRate(22),
      web3.toWei(2),
      6,
      86400,
      10 ** 10,
      "This is the a loan"
    ));
    assert.equal(loanId2, 2)

    // create a new identical
    await assertThrow(engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(12),
      toInterestRate(22),
      web3.toWei(2),
      2,
      86400,
      10 ** 10,
      "This is the a loan"
    ));
  })
  it("It should handle a loan with a single period", async function(){
    let loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(20),
      web3.toWei(100),
      web3.toWei(110),
      1,
      360 * 86400,
      10 ** 10,
      "Really really quick loan"
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await buyTokens(accounts[2], web3.toWei(100));
    await rcn.approve(engine.address, web3.toWei(100), { from: accounts[2] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[2] });

    assert.equal(await engine.ownerOf(loanId), accounts[2], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getPeriods(loanId), 1, "The loan should be in the first period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), web3.toWei(110), "Period debt should be 100 plus interest")
    
    await buyTokens(accounts[1], web3.toWei(10));
    await rcn.approve(engine.address, web3.toWei(110), { from: accounts[1] });
    await engine.pay(loanId, web3.toWei(110), accounts[1], 0x0, { from: accounts[1] });

    assert.equal(await engine.getPaid(loanId), web3.toWei(110), "Paid should be 110 RCN");
    assert.equal(await engine.getStatus(loanId), 2, "Loan should be paid");
  })
  it("It should return the tokens if an extra paid is made on a loan of a single period", async function(){
    let loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(20),
      web3.toWei(100),
      web3.toWei(110),
      1,
      360 * 86400,
      10 ** 10,
      "Really really quick loan 2"
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await buyTokens(accounts[2], web3.toWei(100));
    await rcn.approve(engine.address, web3.toWei(100), { from: accounts[2] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[2] });

    assert.equal(await engine.ownerOf(loanId), accounts[2], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal((await engine.getCheckpoint(loanId)).toNumber(), 1, "The loan should be in the first period");
    assert.equal(await engine.getCurrentDebt(loanId), web3.toWei(110), "Period debt should be 100 plus interest")
    
    await buyTokens(accounts[1], web3.toWei(20));
    await rcn.approve(engine.address, web3.toWei(120), { from: accounts[1] });
    await engine.pay(loanId, web3.toWei(120), accounts[1], 0x0, { from: accounts[1] });

    assert.equal(await engine.getPaid(loanId), web3.toWei(110), "Paid should be 110 RCN");
    assert.equal(await engine.getStatus(loanId), 2, "Loan should be paid");
    assert.equal(await rcn.balanceOf(accounts[1]), web3.toWei(10), "The borrower should have it's 10 RCN back")
  })
  it("It should handle a loan with more than a period", async function(){
    let loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(240),
      300,
      110,
      3,
      30 * 86400,
      10 ** 10,
      "Really really quick loan"
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await buyTokens(accounts[2], 40000);
    await rcn.approve(engine.address, 300, { from: accounts[2] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[2] });

    assert.equal(await engine.ownerOf(loanId), accounts[2], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first period");
    assert.equal(await engine.getCurrentDebt(loanId), 330 / 3, "Period debt should be 100 plus interest = 110")
    
    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 110, { from: accounts[8] });
    await engine.pay(loanId, 110, accounts[8], 0x0, { from: accounts[8] });

    assert.equal(await engine.getPaid(loanId), 110, "Paid should be 110 RCN");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be still ongoing");
  })
  it("It should handle a loan with more than a period in advance, totally", async function(){
    let loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[8],
      0x0,
      toInterestRate(240),
      1000,
      110,
      10,
      30 * 86400,
      10 ** 10,
      ""
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await buyTokens(accounts[3], 4000);
    await rcn.approve(engine.address, 1000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first period");
    assert.equal(await engine.getCurrentDebt(loanId), 110, "Period debt should be 100 plus interest = 110")
    
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 4000, { from: accounts[8] });
    await engine.pay(loanId, 4000, accounts[8], 0x0, { from: accounts[8] });

    assert.equal(await engine.getStatus(loanId), 2, "Loan should be paid");
    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 10, "Paid should be 1100 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 1100, "Expended amount should be 1100 RCN");
  })
  it("It should handle a loan with more than a period in advance, partially", async function(){
    let loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[8],
      0x0,
      toInterestRate(240),
      1000,
      110,
      10,
      31 * 86400,
      10 ** 10,
      "2!"
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await buyTokens(accounts[3], 4000);
    await rcn.approve(engine.address, 1000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first period");
    assert.equal(await engine.getCurrentDebt(loanId), 110, "Period debt should be 100 plus interest = 110")
    
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 330, { from: accounts[8] });
    await engine.pay(loanId, 330, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 3, "Paid should be 330 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 330, "Expended amount should be 1100 RCN");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be still ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 4, "Current period should be 4");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 110, "Current period debt should be 110 RCN");

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 150, { from: accounts[8] });
    await engine.pay(loanId, 150, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 3 + 150, "Paid should be 480 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 150, "Expended amount should be 1100 RCN");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be still ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 5, "Current period should be 5");
    assert.equal(await engine.getCurrentDebt(loanId), 70, "Current period debt should be 70 RCN");

    // Pay the rest of the loan
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 4000, { from: accounts[8] });
    await engine.pay(loanId, 4000, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 1100, "Paid should be 1100 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 620, "Expended amount should be 620 RCN");
    assert.equal(await engine.getStatus(loanId), 2, "Loan should be still paid");
    assert.equal(await engine.getCheckpoint(loanId), 10, "Current period should be 10");
    assert.equal(await engine.getCurrentDebt(loanId), 0, "Current period debt should be 0 RCN");
  })
  it("Should only charge the exact extra interest", async function(){
    const loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(35 * 1,5),
      1000000,
      99963,
      12,
      30 * 86400,
      10 ** 10,
      ""
    ));

    await engine.approveLoan(loanId, { from: accounts[1] })

    await buyTokens(accounts[3], 1000000);
    await rcn.approve(engine.address, 1000000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "All periods should be base 99963")
  })
  it("It should calculate the interest like the test doc test 1", async function() {
    const loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(35 * 1.5),
      1000000,
      99963,
      12,
      30 * 86400,
      10 ** 10,
      "Test table example 1"
    ), { from: accounts[1] });

    await engine.approveLoan(loanId, { from: accounts[1] })

    await buyTokens(accounts[3], 1000000);
    await rcn.approve(engine.address, 1000000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first period");
    assert.equal(await engine.getCurrentDebt(loanId), 99963, "Period debt should be 99963");

    // Pay the full next installment in a couple of days
    await increaseTime(7 * 86400);

    assert.equal(await engine.getCurrentDebt(loanId), 99963, "Period debt should still be 99963");

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 2, "The loan should installmentinstallmentbe in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait a month and a week
    await increaseTime((30 + 7) * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 3, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait a month and a week
    await increaseTime(30 * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 4, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait to the next payment, exactly
    await increaseTime(30 * 86400);

    // Wait to the next payment, exactly
    await increaseTime(16 * 86400);

    // Past the payment date by 5 days
    await increaseTime(5 * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 400000);
    await rcn.approve(engine.address, 100691, { from: accounts[8] });
    await engine.pay(loanId, 100691, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 5, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait to the next payment, exactly
    await increaseTime(25 * 86400);

    // Pass the payment date by 20 days
    await increaseTime(20 * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 400000);
    await rcn.approve(engine.address, 102878, { from: accounts[8] });
    await engine.pay(loanId, 102878, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 6, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait to the next payment minus 1 day
    await increaseTime(9 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 7, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait to the next payment
    await increaseTime(30 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 8, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait to exactly the payment date
    await increaseTime(30 * 86400);
    await increaseTime(86400);

    // Pass the payment date by 15 days
    await increaseTime(15 * 86400);

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 400000);
    await rcn.approve(engine.address, 102149, { from: accounts[8] });
    await engine.pay(loanId, 102149, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 9, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait for the next payment date
    await increaseTime(14 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 10, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait to the next payment
    await increaseTime(30 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 11, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait to the next payment
    await increaseTime(30 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 12, "The loan should be in the next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");

    // Wait to the next payment
    await increaseTime(30 * 86400);

    // Pay a full installment
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 100000);
    await rcn.approve(engine.address, 99963, { from: accounts[8] });
    await engine.pay(loanId, 99963, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getStatus(loanId), 2, "The loan should be fully paid");
    assert.equal((await engine.getPaid(loanId)).toNumber(), 1205385, "The borrower should have paid 1205385 in total");
  })
  it("It should calculate the interest like the test doc test 3", async function() {
    const loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(35 * 1.5),
      1000000,
      99963,
      12,
      30 * 86400,
      10 ** 10,
      "Test table example 3"
    ), { from: accounts[1] });

    await engine.approveLoan(loanId, { from: accounts[1] })

    await buyTokens(accounts[3], 1000000);
    await rcn.approve(engine.address, 1000000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first period");
    assert.equal(await engine.getCurrentDebt(loanId), 99963, "Period debt should be 99963");

    // Pay the next 3 months in advance
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 10 ** 18);
    await rcn.approve(engine.address, 99963 * 3, { from: accounts[8] });
    await engine.pay(loanId, 99963 * 3, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 4, "The loan should be in the 4 next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");
    assert.equal(await engine.getPaid(loanId), 99963 * 3, "Paid should be the amount of 3 installments");
    assert.equal(await engine.getLenderBalance(loanId), 99963 * 3, "Lender balance should equal pay");

    // Pass 4 months to the next loan expire time
    await increaseTime(4 * 30 * 86400);

    // Pass 12 days from the due date
    await increaseTime(12 * 86400);

    // Pay the total of the current debt
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 10 ** 18);
    await rcn.approve(engine.address, 101712, { from: accounts[8] });
    await engine.pay(loanId, 101712, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getCheckpoint(loanId), 5, "The loan should now be in the 5 next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");
    
    // Advance to the next month
    await increaseTime(18 * 86400);

    // And to the next...
    await increaseTime(30 * 86400);
    
    // And to the next...
    await increaseTime(30 * 86400);

    // Pay the total of the current debt
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 10 ** 18);
    await rcn.approve(engine.address, 250000, { from: accounts[8] });
    await engine.pay(loanId, 250000, accounts[8], 0x0, { from: accounts[8] }); // 299889
    assert.equal(await engine.getCheckpoint(loanId), 7, "The loan should now be in the 7 period");

    // Advance to the next month
    await increaseTime(30 * 86400);
    // Poke the contract
    await engine.pay(loanId, 0, 0x0, 0x0);
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 163264)

    // Pay thr rest of the loan
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 10 ** 18);
    await rcn.approve(engine.address, 10 ** 18, { from: accounts[8] });
    await engine.pay(loanId, 10 ** 18, accounts[8], 0x0, { from: accounts[8] });
    assert.equal(await engine.getStatus(loanId), 2, "The loan should be fully paid");
    assert.equal(await engine.getCheckpoint(loanId), 12, "The loan should now be in the 12 next period");
    assert.equal((await engine.getPaid(loanId)).toNumber(), 1214616, "Paid should be the amount be 1214717");
    assert.equal(await engine.getLenderBalance(loanId), 1214616, "Lender balance should equal pay");
  })
  it("It should calculate the interest like the test doc test 4", async function() {
    const loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(35 * 1.5),
      1000000,
      99963,
      12,
      30 * 86400,
      10 ** 10,
      "Test table example 3"
    , { from: accounts[1] }));

    // Lend!
    await buyTokens(accounts[3], 1000000);
    await rcn.approve(engine.address, 1000000, { from: accounts[3] });
    await engine.lend(loanId, 0x0, 0x0, 0x0, { from: accounts[3] });

    assert.equal(await engine.ownerOf(loanId), accounts[3], "Account 2 should be the new lender");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first period");
    assert.equal(await engine.getCurrentDebt(loanId), 99963, "Period debt should be 99963");

    // Pay the next 3 months in advance
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });
    await buyTokens(accounts[8], 10 ** 18);
    await rcn.approve(engine.address, 99963 * 4, { from: accounts[8] });
    await engine.pay(loanId, 99963 * 4, accounts[8], 0x0, { from: accounts[8] });
    assert.equal((await engine.getCheckpoint(loanId)).toNumber(), 5, "The loan should be in the 5 next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 99963, "Period debt now be 99963 again, the next installment");
    assert.equal(await engine.getPaid(loanId), 99963 * 4, "Paid should be the amount of 3 installments");
    assert.equal(await engine.getLenderBalance(loanId), 99963 * 4, "Lender balance should equal pay");

    // Lets stop the payments
    // Advance 3 months and take a look
    await increaseTime((4 + 4) * 30 * 86400);

    // Awake the loan
    // pay 0 tokens
    await engine.pay(loanId, 0, 0x0, 0x0);
    assert.equal(await engine.getCheckpoint(loanId), 8, "The loan should be in the 7 next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 426091);

    // Advance the last 4 months
    await increaseTime(4 * 30 * 86400);

    // Awake the loan
    // pay 0 tokens
    await engine.pay(loanId, 0, 0x0, 0x0);
    assert.equal(await engine.getCheckpoint(loanId), 12, "The loan should be in the 12 next period");
    assert.equal((await engine.getCurrentDebt(loanId)).toNumber(), 922155); // 922159
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be ongoing");
  })
  it("It should fail to create a loan if deprecated", async function(){
    await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(10),
      toInterestRate(20),
      web3.toWei(100),
      1,
      360 * 86400,
      10 ** 10,
      "Test create loan pre-deprecated"
    ));

    await engine.setDeprecated(accounts[9]);

    await assertThrow(engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(10),
      toInterestRate(20),
      web3.toWei(100),
      1,
      360 * 86400,
      10 ** 10,
      "This loan should fail, the engine is deprecated"
    ))

    await engine.setDeprecated(0x0);

    await readLoanId(await engine.requestLoan(
      0x0,
      accounts[1],
      0x0,
      toInterestRate(10),
      toInterestRate(20),
      web3.toWei(100),
      1,
      360 * 86400,
      10 ** 10,
      "Test create loan post-deprecated"
    ));
  })
})