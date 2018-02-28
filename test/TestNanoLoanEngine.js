var TestToken = artifacts.require("./utils/TestToken.sol");
var NanoLoanEngine = artifacts.require("./NanoLoanEngine.sol");
var BasicOracle = artifacts.require("./examples/TestOracle.sol");

contract('NanoLoanEngine', function(accounts) {
    let rcn;
    let engine;

    beforeEach("Create engine and token", async function(){ 
        rcn = await TestToken.new();
        engine = await NanoLoanEngine.new(rcn.address);
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

    async function buyTokens(rcn, account, amount) {
        let prevAmount = await rcn.balanceOf(account);
        let buyResult = await rcn.buyTokens(account, { from: account, value: amount / 4000 });
        let newAmount = await rcn.balanceOf(account);
        assert.equal(newAmount.toNumber() - prevAmount.toNumber(), amount, "Should have minted tokens")
    }

    async function createLoan(engine, oracle, borrower, currency, amount, interestRate, interestRatePunitory, duration, 
        cancelableAt, expireTime, from) {
        let prevLoans = (await engine.getTotalLoans()).toNumber()
        await engine.createLoan(oracle, borrower, currency, amount, interestRate, interestRatePunitory,
            duration, cancelableAt, expireTime, { from: from })
        let newLoans = (await engine.getTotalLoans()).toNumber()
        assert.equal(prevLoans, newLoans - 1, "No more than 1 loan should be created in parallel, during tests")
        return newLoans - 1;
    }

    async function increaseTime(delta) {
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [delta], id: 0});
    }
    
    function toInterestRate(interest) { return (10000000 / interest) * 360 * 86400;  }
    function toWei(amount) { return amount * 10 ** 18; }

    it("Lend should fail if loan not approved", async() => {
        // instance = await deployEngine(instance);
        
        // create a new loan
        let loanId = await createLoan(engine, 0x0, accounts[1], 0x0, toWei(2), toInterestRate(27), toInterestRate(40), 
            86400, 0, 10 * 10**20, accounts[0]);

        // check that the loan is not approved
        let isApproved = await engine.isApproved(loanId)
        assert.isFalse(isApproved, "Should not be approved")

        // buy RCN and approve the token transfer
        await buyTokens(rcn, accounts[2], toWei(20));
        await rcn.approve(engine.address, toWei(2), {from:accounts[2]})

        // try to lend and expect an exception
        await assertThrow(engine.lend(loanId, [], 0x0, [], {from:accounts[2]}))

        // check that the status didn't change
        let status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 0, "Status should be initial")
    })

    it("Test E2 28% Anual interest, 91 days", e_test(10000, 11108571428571, 7405714285714, 7862400, 30, 10233, 31,  10474, 91, 11469));
    it("Test E3 28% Anual interest, 30 days", e_test(800000, 11108571428571, 7405714285714, 2592000, 10, 806222, 10,  812444, 30, 837768));
    it("Test E4 27% Anual interest, 30 days", e_test(10000, 11520000000000, 7680000000000, 2592000, 10, 10075, 10, 10150, 30, 10455));
    it("Test E5 40% Anual interest, 30 days", e_test(500000, 7776000000000, 5184000000000, 2592000, 10, 505555, 10, 511111, 30, 533888));
    it("Test E6 40% Anual interest, 30 days", e_test(80000, 7776000000000, 5184000000000, 2592000, 10,  80889, 10, 81778, 30, 85422));
    it("Test E7 42% Anual interest, 30 days", e_test(1000000, 7405714285714, 4937142857142, 2592000, 10, 1011667, 10, 1023333, 30, 1071225));
    it("Test E8 27% Anual interset, 30 days", e_test(70000, 11520000000000, 7680000000000, 2592000, 10, 70525, 10, 71050, 30, 73185));
    it("Test E9 42% Anual interset, 30 days", e_test(500000, 7405714285714, 4937142857142, 2592000, 10, 505833, 10, 511667, 30, 535613));
    it("Test E10 30% Anual interset, 30 days", e_test(300000, 10368000000000, 6912000000000, 2592000, 10, 302500, 10, 305000, 30, 315188));

    function e_test(amount, interest, punnitoryInterest, dueTime, d1, v1, d2, v2, d3, v3) { return async() => {
        let secondsInDay = 86400;

        // Create a new loan with the received params
        let loanId = await createLoan(engine, 0x0, accounts[1], 0x0, amount, interest, punnitoryInterest, 
            dueTime, 0, 10 * 10**20, accounts[1]);

        // Check if the loan is approved
        let isApproved = await engine.isApproved(loanId)
        assert.isTrue(isApproved, "Should be approved")

        // Buy tokens and prepare the lender to do the lent
        await buyTokens(rcn, accounts[2], toWei(100));
        await rcn.approve(engine.address, toWei(100), {from:accounts[2]})
        
        // accounts[2] lends to the borrower
        await engine.lend(loanId, [], 0x0, [], {from:accounts[2]})
        
        // check that the borrower received the RCN
        let received = await rcn.balanceOf(accounts[1]);
        assert.equal(received.toNumber(), amount, "The borrower should have the RCN")

        // forward time, d1 days
        await increaseTime(d1 * secondsInDay);

        // check that the interest accumulated it's close to the defined by the test
        await engine.addInterest(loanId);
        let d1PendingAmount = await engine.getPendingAmount(loanId);
        var d1Diff = Math.abs(d1PendingAmount.toNumber() - v1);
        assert.isBelow(d1Diff, 2, "The v1 should aprox the interest rate in the d1 timestamp");

        // forward time, d2 days
        await increaseTime(d2 * secondsInDay);

        // check that the interest accumulated it's close to the defined by the test
        await engine.addInterest(loanId);
        let d2PendingAmount = await engine.getPendingAmount(loanId);
        var d2Diff = Math.abs(d2PendingAmount.toNumber() - v2);
        assert.isBelow(d2Diff, 2, "The v2 should aprox the interest rate in the d2 timestamp");

        // forward time, d3 days
        await increaseTime(d3 * secondsInDay);

        // check that the interest accumulated it's close to the defined by the test
        await engine.addInterest(loanId);
        let d3PendingAmount = await engine.getPendingAmount(loanId);
        var d3Diff = Math.abs(d3PendingAmount.toNumber() - v3);
        assert.isBelow(d3Diff, 2, "The v3 should aprox the interest rate in the d3 timestamp");
    } }
});