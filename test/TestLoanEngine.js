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
      toInterestRate(10),
      toInterestRate(20),
      web3.toWei(100),
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
    assert.equal(await engine.getPeriodDebt(loanId), web3.toWei(110), "Period debt should be 100 plus interest")
    
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
      toInterestRate(10),
      toInterestRate(20),
      web3.toWei(100),
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
    assert.equal(await engine.getCheckpoint(loanId), 1, "The loan should be in the first period");
    assert.equal(await engine.getPeriodDebt(loanId), web3.toWei(110), "Period debt should be 100 plus interest")
    
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
      toInterestRate(120),
      toInterestRate(240),
      300,
      3,
      31 * 86400,
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
    assert.equal(await engine.getPeriodDebt(loanId), 330 / 3, "Period debt should be 100 plus interest = 110")
    
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
      toInterestRate(120),
      toInterestRate(240),
      1000,
      10,
      31 * 86400,
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
    assert.equal(await engine.getPeriodDebt(loanId), 110, "Period debt should be 100 plus interest = 110")
    
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 4000, { from: accounts[8] });
    await engine.pay(loanId, 4000, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 10, "Paid should be 1100 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 1100, "Expended amount should be 1100 RCN");
    assert.equal(await engine.getStatus(loanId), 2, "Loan should be still ongoing");
  })
  it("It should handle a loan with more than a period in advance, partially", async function(){
    let loanId = await readLoanId(await engine.requestLoan(
      0x0,
      accounts[8],
      0x0,
      toInterestRate(120),
      toInterestRate(240),
      1000,
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
    assert.equal(await engine.getPeriodDebt(loanId), 110, "Period debt should be 100 plus interest = 110")
    
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 330, { from: accounts[8] });
    await engine.pay(loanId, 330, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 3, "Paid should be 330 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 330, "Expended amount should be 1100 RCN");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be still ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 4, "Current period should be 4");
    assert.equal((await engine.periodPending(loanId)).toNumber(), 110, "Current period debt should be 110 RCN");

    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 150, { from: accounts[8] });
    await engine.pay(loanId, 150, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 110 * 3 + 150, "Paid should be 480 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 150, "Expended amount should be 1100 RCN");
    assert.equal(await engine.getStatus(loanId), 1, "Loan should be still ongoing");
    assert.equal(await engine.getCheckpoint(loanId), 5, "Current period should be 5");
    assert.equal(await engine.periodPending(loanId), 70, "Current period debt should be 70 RCN");

    // Pay the rest of the loan
    await rcn.transfer(accounts[9], await rcn.balanceOf(accounts[8]), { from: accounts[8] });

    await buyTokens(accounts[8], 4000);
    await rcn.approve(engine.address, 4000, { from: accounts[8] });
    await engine.pay(loanId, 4000, accounts[8], 0x0, { from: accounts[8] });

    assert.equal((await engine.getPaid(loanId)).toNumber(), 1100, "Paid should be 1100 RCN");
    assert.equal(await rcn.balanceOf(accounts[8]), 4000 - 620, "Expended amount should be 620 RCN");
    assert.equal(await engine.getStatus(loanId), 2, "Loan should be still paid");
    assert.equal(await engine.getCheckpoint(loanId), 10, "Current period should be 10");
    assert.equal(await engine.periodPending(loanId), 0, "Current period debt should be 0 RCN");
  })
})