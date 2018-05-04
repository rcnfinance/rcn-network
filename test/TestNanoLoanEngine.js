var TestToken = artifacts.require("./utils/TestToken.sol");
var NanoLoanEngine = artifacts.require("./NanoLoanEngine.sol");
var TestOracle = artifacts.require("./examples/TestOracle.sol");
var TestCosigner = artifacts.require("./examples/TestCosigner.sol");

contract('NanoLoanEngine', function(accounts) {
    let rcn;
    let engine;
    let oracle;
    let cosigner;

    beforeEach("Create engine and token", async function(){
        rcn = await TestToken.new();
        engine = await NanoLoanEngine.new(rcn.address, {from:accounts[0]});
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

    async function buyTokens(rcn, account, amount) {
        let prevAmount = await rcn.balanceOf(account);
        let buyResult = await rcn.buyTokens(account, { from: account, value: amount / 4000 });
        let newAmount = await rcn.balanceOf(account);
        assert.equal(newAmount.toNumber() - prevAmount.toNumber(), amount, "Should have minted tokens")
    }

    async function createLoan(engine, oracle, borrower, currency, amount, interestRate, interestRatePunitory, duration, 
        cancelableAt, expireTime, from, metadata) {
        let prevLoans = (await engine.getTotalLoans()).toNumber()
        await engine.createLoan(oracle, borrower, currency, amount, interestRate, interestRatePunitory,
            duration, cancelableAt, expireTime, metadata, { from: from })
        let newLoans = (await engine.getTotalLoans()).toNumber()
        assert.equal(prevLoans, newLoans - 1, "No more than 1 loan should be created in parallel, during tests")
        return newLoans - 1;
    }

    async function lendLoan(rcn, engine, account, index, max) {
        await buyTokens(rcn, account, max);
        await rcn.approve(engine.address, max, {from:account})
        await engine.lend(index, [], 0x0, [], {from:account})
    }

    async function increaseTime(delta) {
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [delta], id: 0});
    }
    
    function toInterestRate(interest) { return (10000000 / interest) * 360 * 86400;  }

    it("It should fail creating two identical loans", async() => {
        // create a new loan
        let loanId1 = await createLoan(engine, 0x0, accounts[1], 0x0, web3.toWei(2), toInterestRate(27), toInterestRate(40), 
            86400, 0, 10 * 10**20, accounts[0], "");
        assert.equal(loanId1, 1)

        // create one a little bit different
        let loanId2 = await createLoan(engine, 0x0, accounts[1], 0x0, web3.toWei(2), toInterestRate(27), toInterestRate(40), 
            86400, 0, 10 * 10**20, accounts[0], ":)");
        assert.equal(loanId2, 2)
        
        // create a new identical
        await assertThrow(createLoan(engine, 0x0, accounts[1], 0x0, web3.toWei(2), toInterestRate(27), toInterestRate(40), 
            86400, 0, 10 * 10**20, accounts[0], ""));
    })

    it("Should allow reference loans with their identifier", async() => {
        let sampleCurrency = 0x4d414e4100000000000000000000000000000000000000000000000000000000
        let sampleOracle = accounts[2]

        // create a new loan
        let loanId1Identifier = await engine.buildIdentifier(sampleOracle, accounts[1], accounts[0], sampleCurrency, web3.toWei(2),
            toInterestRate(27), toInterestRate(40), 86400, 0, 10 * 10**20, "")
        let loanId1 = await createLoan(engine, sampleOracle, accounts[1], sampleCurrency, web3.toWei(2), toInterestRate(27), toInterestRate(40), 
            86400, 0, 10 * 10**20, accounts[0], "");
        
        assert.equal(loanId1, 1)
        assert.equal(await engine.identifierToIndex(loanId1Identifier), loanId1)
        assert.equal(await engine.getIdentifier(loanId1), loanId1Identifier)

        // create one a little bit different
        let loanId2 = await createLoan(engine, 0x0, accounts[3], 0x0, web3.toWei(4), toInterestRate(17), toInterestRate(46), 
            86405, 2, 11 * 10**20, accounts[3], "Test");
        let loanId2Identifier = await engine.buildIdentifier(0x0, accounts[3], accounts[3], 0x0, web3.toWei(4),
            toInterestRate(17), toInterestRate(46), 86405, 2, 11 * 10**20, "Test")

        assert.equal(loanId2, 2)
        assert.equal(await engine.identifierToIndex(loanId2Identifier), 2)
        assert.equal(await engine.getIdentifier(loanId2), loanId2Identifier)
    })

    it("Should approve a loan using it's identifier", async() => {
        let loanIdIdentifier = await engine.buildIdentifier(0x0, accounts[3], accounts[4], 0x0, web3.toWei(4),
            toInterestRate(17), toInterestRate(46), 86405, 2, 11 * 10**20, "Test")

        let loanId = await createLoan(engine, 0x0, accounts[3], 0x0, web3.toWei(4), toInterestRate(17), toInterestRate(46), 
            86405, 2, 11 * 10**20, accounts[4], "Test");

        assert.isFalse(await engine.isApproved(loanId))

        await engine.approveLoanIdentifier(loanIdIdentifier, {from: accounts[3]})

        assert.equal(await engine.getIdentifier(loanId), loanIdIdentifier)
        assert.isTrue(await engine.isApproved(loanId))
    })

    it("Should destroy a loan using it's identifier", async() => {
        let loanIdIdentifier = await engine.buildIdentifier(0x0, accounts[3], accounts[4], 0x0, web3.toWei(4),
            toInterestRate(17), toInterestRate(46), 86405, 2, 11 * 10**20, "Test")

        let loanId = await createLoan(engine, 0x0, accounts[3], 0x0, web3.toWei(4), toInterestRate(17), toInterestRate(46), 
            86405, 2, 11 * 10**20, accounts[4], "Test");

        await engine.destroyIdentifier(loanIdIdentifier, {from: accounts[3]})

        assert.equal(await engine.getIdentifier(loanId), loanIdIdentifier)
        assert.equal(await engine.getStatus(loanId), 3)
    })

    it("Should register an approve", async() => {
        let loanIdIdentifier = await engine.buildIdentifier(0x0, accounts[3], accounts[4], 0x0, web3.toWei(4),
            toInterestRate(17), toInterestRate(46), 86405, 2, 11 * 10**20, "Test")

        let loanId = await createLoan(engine, 0x0, accounts[3], 0x0, web3.toWei(4), toInterestRate(17), toInterestRate(46), 
            86405, 2, 11 * 10**20, accounts[4], "Test")

        assert.isFalse(await engine.isApproved(loanId))

        let approveSignature = await web3.eth.sign(accounts[3], loanIdIdentifier).slice(2)

        let r = `0x${approveSignature.slice(0, 64)}`
        let s = `0x${approveSignature.slice(64, 128)}`
        let v = web3.toDecimal(approveSignature.slice(128, 130)) + 27

        await engine.registerApprove(loanIdIdentifier, v, r, s)
        assert.isTrue(await engine.isApproved(loanId))
    })

    it("Should reject an invalid approve", async() => {
        let loanIdIdentifier = await engine.buildIdentifier(0x0, accounts[3], accounts[4], 0x0, web3.toWei(4),
            toInterestRate(17), toInterestRate(46), 86405, 2, 11 * 10**20, "Test")

        let loanId = await createLoan(engine, 0x0, accounts[3], 0x0, web3.toWei(4), toInterestRate(17), toInterestRate(46), 
            86405, 2, 11 * 10**20, accounts[4], "Test")

        assert.isFalse(await engine.isApproved(loanId))

        let approveSignature = await web3.eth.sign(accounts[4], loanIdIdentifier).slice(2)

        let r = `0x${approveSignature.slice(0, 64)}`
        let s = `0x${approveSignature.slice(64, 128)}`
        let v = web3.toDecimal(approveSignature.slice(128, 130)) + 27

        await assertThrow(engine.registerApprove(loanIdIdentifier, v, r, s))
        assert.isFalse(await engine.isApproved(loanId))
    })

    it("Lend should fail if loan not approved", async() => {        
        // create a new loan
        let loanId = await createLoan(engine, 0x0, accounts[1], 0x0, web3.toWei(2), toInterestRate(27), toInterestRate(40), 
            86400, 0, 10 * 10**20, accounts[0], "");

        // check that the loan is not approved
        let isApproved = await engine.isApproved(loanId)
        assert.isFalse(isApproved, "Should not be approved")

        // buy RCN and approve the token transfer
        await buyTokens(rcn, accounts[2], web3.toWei(20));
        await rcn.approve(engine.address, web3.toWei(20), {from:accounts[2]})

        // try to lend and expect an exception
        await assertThrow(engine.lend(loanId, [], 0x0, [], {from:accounts[2]}))

        // check that the status didn't change
        let status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 0, "Status should be initial")
    })

    it("Should handle a loan with an oracle", async() => {
        let ethCurrency = 0x8c6f08340fe41ebd7f0ea4db20676287304e34258458cd9ed2d9fba8f39f6861;
        
        // create a new loan
        let loanId = await createLoan(engine, oracle.address, accounts[1], ethCurrency, web3.toWei(1), toInterestRate(27),
            toInterestRate(40), 86400, 0, 10 * 10**20, accounts[0], "");

        // the borrower should approve the loan
        await engine.approveLoan(loanId, {from:accounts[1]})

        // the creator should be accounts 0
        let creator = await engine.getCreator(loanId)
        assert.equal(creator, accounts[0], "Creator should be account 0")

        // load the sample test data
        let dummyData = await oracle.dummyDataBytes1();

        // buy RCN and approve the token transfer
        await buyTokens(rcn, accounts[2], web3.toWei(7000));
        await rcn.approve(engine.address, web3.toWei(7000), {from:accounts[2]})

        // execute the lend
        await engine.lend(loanId, dummyData, 0x0, [], {from:accounts[2]});

        // check the lender of the loan
        let loanOwner = await engine.ownerOf(loanId);
        assert.equal(loanOwner, accounts[2], "The lender should be account 2")

        // check the borrower balance
        let borrowerBalance = await rcn.balanceOf(accounts[1]);
        assert.equal(borrowerBalance.toNumber(), web3.toWei(1) * 6000, "Borrower balance should be 6000 RCN");

        // check the status of the loan
        let status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 1, "Status should be lent")

        // pay half of the loan
        await rcn.approve(engine.address, web3.toWei(7000), {from:accounts[1]})
        await engine.pay(loanId, web3.toWei(1) / 2, accounts[1], dummyData, {from:accounts[1]})

        // check if payment succeded
        let lenderBalance = await engine.getLenderBalance(loanId)
        let engineBalance = await rcn.balanceOf(engine.address)
        assert.equal(lenderBalance.toNumber(), engineBalance.toNumber(), "All the engine balance should be for the lender")
        assert.equal(lenderBalance.toNumber(), (web3.toWei(1) / 2) * 6000, "The lender should have received 3000 RCN")

        // pay the total of the loan
        await buyTokens(rcn, accounts[1], web3.toWei(5000))
        await rcn.approve(engine.address, web3.toWei(5000), {from:accounts[1]})
        await engine.pay(loanId, web3.toWei(1), accounts[1], dummyData, {from:accounts[1]})

        // check the status of the loan, should be paid
        status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 2, "Status should be paid")
    })

    it("Should handle a loan with an oracle if RCN is more expensive than ETH", async() => {
        let ethCurrency = 0x8c6f08340fe41ebd7f0ea4db20676287304e34258458cd9ed2d9fba8f39f6861;
        
        // create a new loan
        let loanId = await createLoan(engine, oracle.address, accounts[1], ethCurrency, web3.toWei(1), toInterestRate(27),
            toInterestRate(40), 86400, 0, 10 * 10**20, accounts[0], "");

        // the borrower should approve the loan
        await engine.approveLoan(loanId, {from:accounts[1]})

        // the creator should be accounts 0
        let creator = await engine.getCreator(loanId)
        assert.equal(creator, accounts[0], "Creator should be account 0")

        // load the sample test data
        let dummyData = await oracle.dummyDataBytes2();

        // buy RCN and approve the token transfer
        await buyTokens(rcn, accounts[2], web3.toWei(7000));
        await rcn.approve(engine.address, web3.toWei(7000), {from:accounts[2]})

        // execute the lend
        await engine.lend(loanId, dummyData, 0x0, [], {from:accounts[2]});

        // check the lender of the loan
        let loanOwner = await engine.ownerOf(loanId);
        assert.equal(loanOwner, accounts[2], "The lender should be account 2")

        // check the borrower balance
        let borrowerBalance = await rcn.balanceOf(accounts[1]);
        assert.equal(borrowerBalance.toNumber(), web3.toWei(1) * 0.5, "Borrower balance should be 0.5 RCN");

        // check the status of the loan
        let status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 1, "Status should be lent")

        // pay half of the loan
        await rcn.approve(engine.address, web3.toWei(7000), {from:accounts[1]})
        await engine.pay(loanId, web3.toWei(1) / 2, accounts[1], dummyData, {from:accounts[1]})

        // check if payment succeded
        let lenderBalance = await engine.getLenderBalance(loanId)
        let engineBalance = await rcn.balanceOf(engine.address)
        assert.equal(lenderBalance.toNumber(), engineBalance.toNumber(), "All the engine balance should be for the lender")
        assert.equal(lenderBalance.toNumber(), (web3.toWei(1) / 2) * 0.5, "The lender should have received 3000 RCN")

        // pay the total of the loan
        await buyTokens(rcn, accounts[1], web3.toWei(5000))
        await rcn.approve(engine.address, web3.toWei(5000), {from:accounts[1]})
        await engine.pay(loanId, web3.toWei(1), accounts[1], dummyData, {from:accounts[1]})

        // check the status of the loan, should be paid
        status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 2, "Status should be paid")
    })

    it("Should handle a loan with an oracle if RCN changes rate", async() => {
        let ethCurrency = 0x8c6f08340fe41ebd7f0ea4db20676287304e34258458cd9ed2d9fba8f39f6861;
        
        // create a new loan
        let loanId = await createLoan(engine, oracle.address, accounts[1], ethCurrency, web3.toWei(1), toInterestRate(27),
            toInterestRate(40), 86400, 0, 10 * 10**20, accounts[0], "");

        // the borrower should approve the loan
        await engine.approveLoan(loanId, {from:accounts[1]})

        // the creator should be accounts 0
        let creator = await engine.getCreator(loanId)
        assert.equal(creator, accounts[0], "Creator should be account 0")

        // load the sample test data
        let dummyData = await oracle.dummyDataBytes1();

        // buy RCN and approve the token transfer
        await buyTokens(rcn, accounts[2], web3.toWei(7000));
        await rcn.approve(engine.address, web3.toWei(7000), {from:accounts[2]})

        // execute the lend
        await engine.lend(loanId, dummyData, 0x0, [], {from:accounts[2]});

        // check the lender of the loan
        let loanOwner = await engine.ownerOf(loanId);
        assert.equal(loanOwner, accounts[2], "The lender should be account 2")

        // check the borrower balance
        let borrowerBalance = await rcn.balanceOf(accounts[1]);
        assert.equal(borrowerBalance.toNumber(), web3.toWei(1) * 6000, "Borrower balance should be 0.5 RCN");

        // check the status of the loan
        let status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 1, "Status should be lent")

        // load new rate, RCN is more expensive now
        dummyData = await oracle.dummyDataBytes2();

        // pay half of the loan
        await rcn.approve(engine.address, web3.toWei(7000), {from:accounts[1]})
        await engine.pay(loanId, web3.toWei(1) / 2, accounts[1], dummyData, {from:accounts[1]})

        // check if payment succeded
        let lenderBalance = await engine.getLenderBalance(loanId)
        let engineBalance = await rcn.balanceOf(engine.address)
        assert.equal(lenderBalance.toNumber(), engineBalance.toNumber(), "All the engine balance should be for the lender")
        assert.equal(lenderBalance.toNumber(), (web3.toWei(1) / 2) * 0.5, "The lender should have received 3000 RCN")

        // pay the total of the loan
        await buyTokens(rcn, accounts[1], web3.toWei(5000))
        await rcn.approve(engine.address, web3.toWei(5000), {from:accounts[1]})
        await engine.pay(loanId, web3.toWei(1), accounts[1], dummyData, {from:accounts[1]})

        // check the status of the loan, should be paid
        status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 2, "Status should be paid")
    })

    it("Should fail if the oracle has the wrong data", async() => {
        let ethCurrency = 0x8c6f08340fe41ebd7f0ea4db20676287304e34258458cd9ed2d9fba8f39f6861;
        
        // create a new loan
        let loanId = await createLoan(engine, oracle.address, accounts[1], ethCurrency, web3.toWei(1), toInterestRate(27),
            toInterestRate(40), 86400, 0, 10 * 10**20, accounts[1], "");

        // buy RCN and approve the token transfer
        await buyTokens(rcn, accounts[2], web3.toWei(7000));
        await rcn.approve(engine.address, web3.toWei(7000), {from:accounts[2]})

        // execute the lend but with a wrong oracle data
        await assertThrow(engine.lend(loanId, [0x23, 0x12, 0x4a], 0x0, [], {from:accounts[2]}));

        // check that the status didn't change
        let status = await engine.getStatus(loanId)
        assert.equal(status.toNumber(), 0, "Status should be initial")
    })

    it("Should not allow the withdraw of lender tokens, but permit a emergency withdrawal", async() => {
        // create a new loan and lend it
        let loanId = await createLoan(engine, 0x0, accounts[1], 0x0, web3.toWei(2), toInterestRate(27), toInterestRate(40), 
            86400, 0, 10 * 10**20, accounts[1], "");
        await lendLoan(rcn, engine, accounts[2], loanId, web3.toWei(2));
        
        // pay the loan
        await buyTokens(rcn, accounts[1], web3.toWei(2))
        await rcn.approve(engine.address, web3.toWei(2), {from:accounts[1]})
        await engine.pay(loanId, web3.toWei(2), accounts[1], [], {from:accounts[1]})
        
        // try and fail to withdraw tokens as the owner of the engine
        await assertThrow(engine.withdrawTokens(rcn.address, accounts[3], web3.toWei(1), {from:accounts[0]}));

        // check if the balance of the engine is still there
        let engineBalance = await rcn.balanceOf(engine.address);
        assert.equal(engineBalance.toNumber(), web3.toWei(2), "The engine balance should be 2 RCN")

        // deposit some RCN "by mistake"
        await buyTokens(rcn, accounts[4], web3.toWei(1))
        await rcn.transfer(engine.address, web3.toWei(1), {from:accounts[4]})

        // lender trying to withdraw more of his balance should fail
        await assertThrow(engine.withdrawal(loanId, web3.toWei(2.5), accounts[2], {from:accounts[2]}))
        let lenderBalance = await rcn.balanceOf(accounts[2])
        assert.equal(lenderBalance.toNumber(), 0, "Lender should have no balance")

        // test the emergency withdraw function
        await engine.withdrawTokens(rcn.address, accounts[3], web3.toWei(1), {from:accounts[0]})
        let emergencyBalance = await rcn.balanceOf(accounts[3])
        assert.equal(emergencyBalance.toNumber(), web3.toWei(1), "The emergency balance should be on the account 3")
        
        // withdraw part of the lender balance and check it
        await engine.withdrawal(loanId, accounts[2], 2000, {from:accounts[2]})
        lenderBalance = await rcn.balanceOf(accounts[2])
        assert.equal(lenderBalance.toNumber(), 2000, "Lender should have his RCN")

        // test if the remaining tokens of the lenders keeps being locked
        await assertThrow(engine.withdrawTokens(rcn.address, accounts[5], 1), "Tokens of lender should not be accesible")
        
    })

    it("Test fix error pay all", async() => {
        // create a loan and paid it
        let loanId = await createLoan(engine, 0x0, accounts[0], 0x0, 4000, toInterestRate(27), toInterestRate(40), 
        86400, 0, 10 * 10**20, accounts[0], "");
        await lendLoan(rcn, engine, accounts[1], loanId, 4000)

        // fully pay a loan
        await buyTokens(rcn, accounts[0], 8000)
        await rcn.approve(engine.address, 8000, {from:accounts[0]})
        await engine.pay(loanId, 8000, accounts[0], [], {from:accounts[0]})

    })

    it("Should work as a ERC721 token", async()=> {
        // Total supply should start at 1
        let totalSupply = await engine.totalSupply()
        assert.equal(totalSupply.toNumber(), 0, "Total supply should start at 0")

        // Create 5 loans
        let loanId1 = await createLoan(engine, 0x0, accounts[0], 0x0, 4000, toInterestRate(27), toInterestRate(40), 
        86400, 0, 10 * 10**20, accounts[0], "Loan 1");
        let loanId2 = await createLoan(engine, 0x0, accounts[0], 0x0, 4000, toInterestRate(27), toInterestRate(40), 
        86400, 0, 10 * 10**20, accounts[0], "Loan 2");
        let loanId3 = await createLoan(engine, 0x0, accounts[0], 0x0, 4000, toInterestRate(27), toInterestRate(40), 
        86400, 0, 10 * 10**20, accounts[0], "Loan 3");
        let loanId4 = await createLoan(engine, 0x0, accounts[0], 0x0, 4000, toInterestRate(27), toInterestRate(40), 
        86400, 0, 10 * 10**20, accounts[0], "Loan 4");
        let loanId5 = await createLoan(engine, 0x0, accounts[0], 0x0, 4000, toInterestRate(27), toInterestRate(40), 
        86400, 0, 10 * 10**20, accounts[0], "Loan 5");

        // Total supply should remain 0 until one loan activates
        totalSupply = await engine.totalSupply()
        assert.equal(totalSupply.toNumber(), 0, "Total supply be 0")

        // lend 2 loans
        await lendLoan(rcn, engine, accounts[1], loanId1, 4000)
        await lendLoan(rcn, engine, accounts[1], loanId2, 4000)

        // Total supply should be 2
        totalSupply = await engine.totalSupply()
        assert.equal(totalSupply.toNumber(), 2, "Should have 2 active loans")

        // Check the lender balance
        let account1balance = await engine.balanceOf(accounts[1])
        assert.equal(account1balance.toNumber(), 2, "Account 1 has 2 loans")

        // Check the list of loans of account 1
        let allLoans = await engine.tokensOfOwner(accounts[1])
        assert.equal(allLoans.length, 2, "Account should have 2 loans")
        assert.equal(allLoans[0], loanId1, "Should have loan 1")
        assert.equal(allLoans[1], loanId2, "Should have loan 2")

        // lend 1 more loan from another lender
        await lendLoan(rcn, engine, accounts[2], loanId3, 4000)

        // Total supply should be 3
        totalSupply = await engine.totalSupply()
        assert.equal(totalSupply.toNumber(), 3, "Should have 3 active loans")

        // account 2 should have 1 loan
        let account2balance = await engine.balanceOf(accounts[2])
        assert.equal(account2balance.toNumber(), 1, "Account 2 has 1 loans")

        // transfer all loans to account 3
        await engine.transfer(accounts[3], loanId1, {from:accounts[1]})
        await engine.transfer(accounts[3], loanId2, {from:accounts[1]})
        await engine.transfer(accounts[3], loanId3, {from:accounts[2]})

        // account 3 should have 3 loans
        let account3balance = await engine.balanceOf(accounts[3])
        assert.equal(account3balance.toNumber(), 3, "Account 3 has 3 loans")

        // check all loans of account 3
        let allLoans3 = await engine.tokensOfOwner(accounts[3])
        assert.equal(allLoans3.length, 3, "Account should have 3 loans")
        assert.equal(allLoans3[0], loanId1, "Should have loan 1")
        assert.equal(allLoans3[1], loanId2, "Should have loan 2")
        assert.equal(allLoans3[2], loanId3, "Should have loan 3")

        // account 1 and 2 should have no loans
        allLoans = await engine.tokensOfOwner(accounts[1])
        assert.equal(allLoans.length, 0, "Account 1 should have 0 loans")
        allLoans2 = await engine.tokensOfOwner(accounts[2])
        assert.equal(allLoans2.length, 0, "Account 2 should have 0 loans")

        // destroy one loan
        await engine.destroy(loanId2, {from:accounts[3]})

        // check all loans of account 3
        allLoans3 = await engine.tokensOfOwner(accounts[3])
        assert.equal(allLoans3.length, 2, "Account should have 2 loans")
        assert.equal(allLoans3[0], loanId1, "Should have loan 1")
        assert.equal(allLoans3[1], loanId3, "Should have loan 3")
        
        // total supply should have dropped
        totalSupply = await engine.totalSupply()
        assert.equal(totalSupply.toNumber(), 2, "Should have 2 active loans")

        // lend a new loan
        await lendLoan(rcn, engine, accounts[5], loanId4, 4000)

        // fully pay a loan
        await buyTokens(rcn, accounts[0], 8000)
        await rcn.approve(engine.address, 8000, {from:accounts[0]})
        await engine.pay(loanId1, 8000, accounts[0], [], {from:accounts[0]})

        // total supply should have dropped
        totalSupply = await engine.totalSupply()
        assert.equal(totalSupply.toNumber(), 2, "Should have 2 active loans")

        // check all loans of account 3
        allLoans3 = await engine.tokensOfOwner(accounts[3])
        assert.equal(allLoans3.length, 1, "Account should have 2 loans")
        assert.equal(allLoans3[0], loanId3, "Should have loan 3")

        // try pull loan witout approval, should fail
        await assertThrow(engine.takeOwnership(loanId3, {from: accounts[2]}))

        // approve transfer for the loan and try again
        await engine.approve(accounts[2], loanId3, {from:accounts[3]})
        await engine.takeOwnership(loanId3, {from: accounts[2]})
        assert.equal(await engine.ownerOf(loanId3), accounts[2])

        // approve for all should work
        await engine.setApprovalForAll(accounts[1], true, {from:accounts[2]})
        await engine.takeOwnership(loanId3, {from: accounts[1]})
        assert.equal(await engine.ownerOf(loanId3), accounts[1])

        // but not in reverse
        await assertThrow(engine.takeOwnership(loanId3, {from: accounts[2]}))
        assert.equal(await engine.ownerOf(loanId3), accounts[1])

        // and we should be able to disable it
        await engine.transferFrom(accounts[1], accounts[2], loanId3, {from:accounts[1]})
        assert.equal(await engine.ownerOf(loanId3), accounts[2])
        await engine.setApprovalForAll(accounts[1], false, {from:accounts[2]})
        await assertThrow(engine.takeOwnership(loanId3, {from: accounts[1]}))
        assert.equal(await engine.ownerOf(loanId3), accounts[2])
    })

    it("Should work with a cosigner", async()=> {
        // Create loan
        let loanId = await createLoan(engine, 0x0, accounts[0], 0x0, web3.toWei(2), toInterestRate(27), toInterestRate(40), 
        86400, 0, 10 * 10**20, accounts[0], "");

        // get cosigner data
        let cosignerData = await cosigner.data();

        // lend with cosigner
        await buyTokens(rcn, accounts[1], web3.toWei(3));
        await rcn.approve(engine.address, web3.toWei(3), {from:accounts[1]})
        await engine.lend(loanId, [], cosigner.address, cosignerData, {from:accounts[1]})

        // cosigner should have 1 RCN
        let cosignerBalance = await rcn.balanceOf(cosigner.address);
        assert.equal(cosignerBalance.toNumber(), web3.toWei(1), "Cosigner should have 1 RCN")

        // the cosigner of the loan should be the test cosigner
        let loanCosigner = await engine.getCosigner(loanId)
        assert.equal(loanCosigner, cosigner.address, "The cosigner should be the test cosigner")

        // the loan should be in lent status
        let loanStatus = await engine.getStatus(loanId)
        assert.equal(loanStatus.toNumber(), 1, "The status should be lent")
    })

    it("Should not work with the wrong cosigner data", async() => {
        // Create loan
        let loanId = await createLoan(engine, 0x0, accounts[0], 0x0, web3.toWei(2), toInterestRate(27), toInterestRate(40), 
        86400, 0, 10 * 10**20, accounts[0], "");

        // cosigner should be empty
        let loanCosigner = await engine.getCosigner(loanId)
        assert.equal(loanCosigner, 0x0, "Cosigner should be empty");

        // get cosigner data
        let cosignerData = await cosigner.badData();

        // lend with cosigner, should fail because of the bad data
        await buyTokens(rcn, accounts[1], web3.toWei(3));
        await rcn.approve(engine.address, web3.toWei(3), {from:accounts[1]});
        await assertThrow(engine.lend(loanId, [], cosigner.address, cosignerData, {from:accounts[1]}));

        // cosigner should have 0 RCN
        let cosignerBalance = await rcn.balanceOf(cosigner.address);
        assert.equal(cosignerBalance.toNumber(), 0, "Cosigner should have 0 RCN");

        // the cosigner of the loan should not be the test cosigner
        loanCosigner = await engine.getCosigner(loanId)
        assert.equal(loanCosigner, 0x0, "The cosigner should not be the test cosigner")

        // the loan should be in initial status
        let loanStatus = await engine.getStatus(loanId)
        assert.equal(loanStatus.toNumber(), 0, "The status should be initial")
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

    function e_test(amount, interest, punitoryInterest, duesIn, d1, v1, d2, v2, d3, v3) { return async() => {
        let secondsInDay = 86400;

        // Create a new loan with the received params
        let loanId = await createLoan(engine, 0x0, accounts[1], 0x0, amount, interest, punitoryInterest, 
            duesIn, 0, 10 * 10**20, accounts[1], "");

        // test configuration params
        let cosigner = await engine.getCosigner(loanId)
        let borrower = await engine.getBorrower(loanId)
        let creator = await engine.getCreator(loanId)
        let lender = await engine.ownerOf(loanId)
        let currency = await engine.getCurrency(loanId)
        let oracle = await engine.getOracle(loanId)
        let status = await engine.getStatus(loanId)
        let loanAmount = await engine.getAmount(loanId)
        let loanInterest = await engine.getInterest(loanId)
        let loanPunitoryInterest = await engine.getPunitoryInterest(loanId)
        let interestTimestamp = await engine.getInterestTimestamp(loanId)
        let paid = await engine.getPaid(loanId)
        let interestRate = await engine.getInterestRate(loanId)
        let interestRatePunitory = await engine.getInterestRatePunitory(loanId)
        let dueTime = await engine.getDueTime(loanId)
        let loanDuesIn = await engine.getDuesIn(loanId)
        let cancelableAt = await engine.getCancelableAt(loanId)
        let lenderBalance = await engine.getLenderBalance(loanId)
        let approvedTransfer = await engine.getApproved(loanId)
        let expirationRequest = await engine.getExpirationRequest(loanId)

        assert.equal(expirationRequest.toNumber(), 10 * 10**20, "Should had the defined expiration")
        assert.equal(approvedTransfer, 0x0, "Approved transfer should start empty")
        assert.equal(cancelableAt.toNumber(), 0, "Cancelable at should be 0")
        assert.equal(lenderBalance.toNumber(), 0, "Lender balance should start at 0")
        assert.equal(dueTime.toNumber(), 0, "Due time should start at 0")
        assert.equal(loanDuesIn.toNumber(), duesIn, "Dues in should be the defined")
        assert.equal(interestRate.toNumber(), interest, "Interest rate should be the defined")
        assert.equal(interestRatePunitory.toNumber(), punitoryInterest, "Interest rate punitory should be the defined")
        assert.equal(paid.toNumber(), 0, "Paid should start at 0")
        assert.equal(interestTimestamp.toNumber(), 0, "Interest timestamp should start at 0")
        assert.equal(loanInterest.toNumber(), 0, "Interest should start at 0")
        assert.equal(loanPunitoryInterest.toNumber(), 0, "Punitory interest should start at 0")
        assert.equal(loanAmount.toNumber(), amount, "Amount should be the defined amount")
        assert.equal(status.toNumber(), 0, "Status should be initial")
        assert.equal(cosigner, 0x0, "Cosigner should be empty")
        assert.equal(borrower, accounts[1], "Borrower should be account 1")
        assert.equal(creator, accounts[1], "Creator should be account 0")
        assert.equal(lender, 0x0, "Lender should be empty")
        assert.equal(currency, 0x0, "Currency should be empty")
        assert.equal(oracle, 0x0, "Oracle should be empty")


        // Check if the loan is approved
        let isApproved = await engine.isApproved(loanId)
        assert.isTrue(isApproved, "Should be approved")

        // Buy tokens and prepare the lender to do the lent
        await buyTokens(rcn, accounts[2], web3.toWei(100));
        await rcn.approve(engine.address, web3.toWei(100), {from:accounts[2]})
        
        // accounts[2] lends to the borrower
        await engine.lend(loanId, [], 0x0, [], {from:accounts[2]})
        
        // check that the borrower received the RCN
        let received = await rcn.balanceOf(accounts[1]);
        assert.equal(received.toNumber(), amount, "The borrower should have the RCN")

        // forward time, d1 days
        await increaseTime(d1 * secondsInDay);

        // check that the interest accumulated it's close to the defined by the test
        await engine.addInterest(loanId);
        let d1PendingAmount = await engine.getRawPendingAmount(loanId);
        var d1Diff = Math.abs(d1PendingAmount.toNumber() - v1);
        assert.isBelow(d1Diff, 2, "The v1 should aprox the interest rate in the d1 timestamp");

        // forward time, d2 days
        await increaseTime(d2 * secondsInDay);

        // check that the interest accumulated it's close to the defined by the test
        await engine.addInterest(loanId);
        let d2PendingAmount = await engine.getRawPendingAmount(loanId);
        var d2Diff = Math.abs(d2PendingAmount.toNumber() - v2);
        assert.isBelow(d2Diff, 2, "The v2 should aprox the interest rate in the d2 timestamp");

        // forward time, d3 days
        await increaseTime(d3 * secondsInDay);

        // check that the interest accumulated it's close to the defined by the test
        await engine.addInterest(loanId);
        let d3PendingAmount = await engine.getRawPendingAmount(loanId);
        var d3Diff = Math.abs(d3PendingAmount.toNumber() - v3);
        assert.isBelow(d3Diff, 2, "The v3 should aprox the interest rate in the d3 timestamp");
    } }
});