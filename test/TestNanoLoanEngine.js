const TestToken = artifacts.require('TestToken');
const NanoLoanEngine = artifacts.require('NanoLoanEngine');
const TestOracle = artifacts.require('TestOracle');
const TestCosigner = artifacts.require('TestCosigner');

const {
    expect,
    bn,
    address0x,
    bytes320x,
    tryCatchRevert,
    toInterestRate,
    increaseTime,
    buyTokens,
    assertThrow,
} = require('./Helper.js');

contract('NanoLoanEngine', function (accounts) {
    let rcn;
    let engine;
    let oracle;
    let cosigner;

    before('Create engine and token', async function () {
        rcn = await TestToken.new();
        engine = await NanoLoanEngine.new(rcn.address, { from: accounts[0] });
        oracle = await TestOracle.new();
        cosigner = await TestCosigner.new(rcn.address);
    });

    async function createLoan (engine, oracle, borrower, currency, amount, interestRate, interestRatePunitory, duration,
        cancelableAt, expireTime, from, metadata) {
        const prevLoans = await engine.getTotalLoans();
        await engine.createLoan(
            oracle,
            borrower,
            currency,
            amount,
            interestRate,
            interestRatePunitory,
            duration,
            cancelableAt,
            expireTime,
            metadata,
            { from: from }
        );

        expect(prevLoans).to.eq.BN((await engine.getTotalLoans()).sub(bn('1')), 'No more than 1 loan should be created in parallel, during tests');
        return (await engine.getTotalLoans()).sub(bn('1'));
    }

    async function lendLoan (rcn, engine, account, index, max) {
        await buyTokens(rcn, max, account);
        await rcn.approve(engine.address, max, { from: account });
        await engine.lend(index, [], address0x, [], { from: account });
    }

    it('Should work as a ERC721 token', async () => {
        // Total supply should start at 1
        expect(await engine.totalSupply()).to.eq.BN('0', 'Total supply should start at 0');

        // Create 5 loans
        const loanId1 = await createLoan(engine, address0x, accounts[0], bytes320x, 4000, toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], 'Loan 1');
        const loanId2 = await createLoan(engine, address0x, accounts[0], bytes320x, 4000, toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], 'Loan 2');
        const loanId3 = await createLoan(engine, address0x, accounts[0], bytes320x, 4000, toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], 'Loan 3');
        const loanId4 = await createLoan(engine, address0x, accounts[0], bytes320x, 4000, toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], 'Loan 4');

        // Total supply should remain 0 until one loan activates
        expect(await engine.totalSupply()).to.eq.BN('0', 'Total supply be 0');

        // lend 2 loans
        await lendLoan(rcn, engine, accounts[1], loanId1, 4000);
        await lendLoan(rcn, engine, accounts[1], loanId2, 4000);

        // Total supply should be 2
        expect(await engine.totalSupply()).to.eq.BN('2', 'Should have 2 active loans');

        // Check the lender balance
        expect(await engine.balanceOf(accounts[1])).to.eq.BN('2', 'Account 1 has 2 loans');

        // Check the list of loans of account 1
        let allLoans = await engine.tokensOfOwner(accounts[1]);
        assert.equal(allLoans.length, 2, 'Account should have 2 loans');
        expect(allLoans[0]).to.eq.BN(loanId1, 'Should have loan 1');
        expect(allLoans[1]).to.eq.BN(loanId2, 'Should have loan 2');

        // lend 1 more loan from another lender
        await lendLoan(rcn, engine, accounts[2], loanId3, 4000);

        // Total supply should be 3
        expect(await engine.totalSupply()).to.eq.BN('3', 'Should have 3 active loans');

        // account 2 should have 1 loan
        expect(await engine.balanceOf(accounts[2])).to.eq.BN('1', 'Account 2 has 1 loans');

        // transfer all loans to account 3
        await engine.transfer(accounts[3], loanId1, { from: accounts[1] });
        await engine.transfer(accounts[3], loanId2, { from: accounts[1] });
        await engine.transfer(accounts[3], loanId3, { from: accounts[2] });

        // account 3 should have 3 loans
        expect(await engine.balanceOf(accounts[3])).to.eq.BN('3', 'Account 3 has 3 loans');

        // check all loans of account 3
        let allLoans3 = await engine.tokensOfOwner(accounts[3]);
        assert.equal(allLoans3.length, 3, 'Account should have 3 loans');
        expect(allLoans3[0]).to.eq.BN(loanId1, 'Should have loan 1');
        expect(allLoans3[1]).to.eq.BN(loanId2, 'Should have loan 2');
        expect(allLoans3[2]).to.eq.BN(loanId3, 'Should have loan 3');

        // account 1 and 2 should have no loans
        allLoans = await engine.tokensOfOwner(accounts[1]);
        assert.equal(allLoans.length, 0, 'Account 1 should have 0 loans');
        const allLoans2 = await engine.tokensOfOwner(accounts[2]);
        assert.equal(allLoans2.length, 0, 'Account 2 should have 0 loans');

        // destroy one loan
        await engine.destroy(loanId2, { from: accounts[3] });

        // check all loans of account 3
        allLoans3 = await engine.tokensOfOwner(accounts[3]);
        assert.equal(allLoans3.length, 2, 'Account should have 2 loans');
        expect(allLoans3[0]).to.eq.BN(loanId1, 'Should have loan 1');
        expect(allLoans3[1]).to.eq.BN(loanId3, 'Should have loan 3');

        // total supply should have dropped
        expect(await engine.totalSupply()).to.eq.BN('2', 'Should have 2 active loans');

        // lend a new loan
        await lendLoan(rcn, engine, accounts[5], loanId4, 4000);

        // fully pay a loan
        await buyTokens(rcn, 8000, accounts[0]);
        await rcn.approve(engine.address, 8000, { from: accounts[0] });
        await engine.pay(loanId1, 8000, accounts[0], [], { from: accounts[0] });

        // total supply should have dropped
        expect(await engine.totalSupply()).to.eq.BN('2', 'Should have 2 active loans');

        // check all loans of account 3
        allLoans3 = await engine.tokensOfOwner(accounts[3]);
        assert.equal(allLoans3.length, 1, 'Account should have 2 loans');
        expect(allLoans3[0]).to.eq.BN(loanId3, 'Should have loan 3');

        // try pull loan witout approval, should fail
        await tryCatchRevert(() => engine.takeOwnership(loanId3, { from: accounts[2] }), '');

        // approve transfer for the loan and try again
        await engine.approve(accounts[2], loanId3, { from: accounts[3] });
        await engine.takeOwnership(loanId3, { from: accounts[2] });
        assert.equal(await engine.ownerOf(loanId3), accounts[2]);

        // approve for all should work
        await engine.setApprovalForAll(accounts[1], true, { from: accounts[2] });
        await engine.takeOwnership(loanId3, { from: accounts[1] });
        assert.equal(await engine.ownerOf(loanId3), accounts[1]);

        // but not in reverse
        await tryCatchRevert(() => engine.takeOwnership(loanId3, { from: accounts[2] }), '');
        assert.equal(await engine.ownerOf(loanId3), accounts[1]);

        // and we should be able to disable it
        await engine.transferFrom(accounts[1], accounts[2], loanId3, { from: accounts[1] });
        assert.equal(await engine.ownerOf(loanId3), accounts[2]);
        await engine.setApprovalForAll(accounts[1], false, { from: accounts[2] });
        await tryCatchRevert(() => engine.takeOwnership(loanId3, { from: accounts[1] }), '');
        assert.equal(await engine.ownerOf(loanId3), accounts[2]);
    });
    it('It should fail creating two identical loans', async () => {
        // create a new loan
        await createLoan(
            engine,
            address0x,
            accounts[1],
            bytes320x,
            web3.utils.toWei('2'),
            toInterestRate(27),
            toInterestRate(40),
            bn('86400'),
            '0',
            bn('10').pow(bn('21')),
            accounts[0],
            ''
        );

        // create one a little bit different
        await createLoan(
            engine,
            address0x,
            accounts[1],
            bytes320x,
            web3.utils.toWei('2'),
            toInterestRate(27),
            toInterestRate(40),
            bn('86400'),
            '0',
            bn('10').pow(bn('21')),
            accounts[0],
            ':)'
        );

        // create a new identical
        await tryCatchRevert(
            () => createLoan(
                engine,
                address0x,
                accounts[1],
                bytes320x,
                web3.utils.toWei('2'),
                toInterestRate(27),
                toInterestRate(40),
                bn('86400'),
                0,
                bn('10').pow(bn('21')),
                accounts[0],
                ''
            ),
            ''
        );
    });
    it('Should allow reference loans with their identifier', async () => {
        const sampleOracle = accounts[2];
        const sampleCurrency = '0x4d414e4100000000000000000000000000000000000000000000000000000000';

        // create a new loan
        const loanId1Identifier = await engine.buildIdentifier(
            sampleOracle,
            accounts[1],
            accounts[0],
            sampleCurrency,
            web3.utils.toWei('2'),
            toInterestRate(27),
            toInterestRate(40),
            bn('86400'),
            0,
            bn('10').pow(bn('21')),
            ''
        );

        const loanId1 = await createLoan(
            engine,
            sampleOracle,
            accounts[1],
            sampleCurrency,
            web3.utils.toWei('2'),
            toInterestRate(27),
            toInterestRate(40),
            bn('86400'),
            0,
            bn('10').pow(bn('21')),
            accounts[0],
            ''
        );

        expect(await engine.identifierToIndex(loanId1Identifier)).to.eq.BN(loanId1);
        assert.equal(await engine.getIdentifier(loanId1), loanId1Identifier);

        // create one a little bit different
        const loanId2 = await createLoan(
            engine,
            address0x,
            accounts[3],
            bytes320x,
            web3.utils.toWei('4'),
            toInterestRate(17),
            toInterestRate(46),
            bn('86405'),
            bn('2'),
            bn('11').mul(bn('10').pow(bn('20'))),
            accounts[3],
            'Test'
        );

        const loanId2Identifier = await engine.buildIdentifier(
            address0x,
            accounts[3],
            accounts[3],
            bytes320x,
            web3.utils.toWei('4'),
            toInterestRate(17),
            toInterestRate(46),
            bn('86405'),
            2,
            bn('11').mul(bn('10').pow(bn('20'))),
            'Test'
        );
        expect(await engine.identifierToIndex(loanId2Identifier)).to.eq.BN((await engine.getTotalLoans()).sub(bn('1')));
        assert.equal(await engine.getIdentifier(loanId2), loanId2Identifier);
    });
    it('Should approve a loan using it\'s identifier', async () => {
        const loanIdIdentifier = await engine.buildIdentifier(
            address0x,
            accounts[3],
            accounts[4],
            bytes320x,
            web3.utils.toWei('4'),
            toInterestRate(17),
            toInterestRate(46),
            bn('86405'),
            '2',
            bn('11').mul(bn('10').pow(bn('20'))),
            'Test'
        );

        const loanId = await createLoan(
            engine,
            address0x,
            accounts[3],
            bytes320x,
            web3.utils.toWei('4'),
            toInterestRate(17),
            toInterestRate(46),
            bn('86405'),
            2,
            bn('11').mul(bn('10').pow(bn('20'))),
            accounts[4],
            'Test'
        );

        assert.isFalse(await engine.isApproved(loanId));

        await engine.approveLoanIdentifier(loanIdIdentifier, { from: accounts[3] });

        expect(await engine.getIdentifier(loanId)).to.eq.BN(loanIdIdentifier);
        assert.isTrue(await engine.isApproved(loanId));
    });
    it('Should destroy a loan using it\'s identifier', async () => {
        const loanIdIdentifier = await engine.buildIdentifier(
            address0x,
            accounts[3],
            accounts[4],
            bytes320x,
            web3.utils.toWei('4'),
            toInterestRate(17),
            toInterestRate(46),
            bn('86405'),
            2,
            bn('11').mul(bn('10').pow(bn('20'))),
            'Test2'
        );

        const loanId = await createLoan(
            engine,
            address0x,
            accounts[3],
            bytes320x,
            web3.utils.toWei('4'),
            toInterestRate(17),
            toInterestRate(46),
            bn('86405'),
            2,
            bn('11').mul(bn('10').pow(bn('20'))),
            accounts[4],
            'Test2'
        );

        await engine.destroyIdentifier(loanIdIdentifier, { from: accounts[3] });

        expect(await engine.getIdentifier(loanId)).to.eq.BN(loanIdIdentifier);
        expect(await engine.getStatus(loanId)).to.eq.BN('3');
    });
    it('Should register an approve', async () => {
        const loanIdIdentifier = await engine.buildIdentifier(
            address0x,
            accounts[3],
            accounts[4],
            bytes320x,
            web3.utils.toWei('4'),
            toInterestRate(17),
            toInterestRate(46),
            bn('86405'),
            2,
            bn('11').mul(bn('10').pow(bn('20'))),
            'Test3'
        );

        const loanId = await createLoan(engine, address0x, accounts[3], bytes320x, web3.utils.toWei('4'), toInterestRate(17), toInterestRate(46),
            bn('86405'), 2, bn('11').mul(bn('10').pow(bn('20'))), accounts[4], 'Test3');

        assert.isFalse(await engine.isApproved(loanId));

        const approveSignature = (await web3.eth.sign(loanIdIdentifier, accounts[3])).slice(2);

        const r = `0x${approveSignature.slice(0, 64)}`;
        const s = `0x${approveSignature.slice(64, 128)}`;
        const v = web3.utils.toDecimal('0x' + approveSignature.slice(128, 130)) + 27;

        await engine.registerApprove(loanIdIdentifier, v, r, s);
        assert.isTrue(await engine.isApproved(loanId));
    });
    it('Should reject an invalid approve', async () => {
        const loanIdIdentifier = await engine.buildIdentifier(address0x, accounts[3], accounts[4], bytes320x, web3.utils.toWei('4'),
            toInterestRate(17), toInterestRate(46), bn('86405'), 2, bn('11').mul(bn('10').pow(bn('20'))), 'Test4');

        const loanId = await createLoan(engine, address0x, accounts[3], bytes320x, web3.utils.toWei('4'), toInterestRate(17), toInterestRate(46),
            bn('86405'), 2, bn('11').mul(bn('10').pow(bn('20'))), accounts[4], 'Test4');

        assert.isFalse(await engine.isApproved(loanId));

        const approveSignature = (await web3.eth.sign(loanIdIdentifier, accounts[4])).slice(2);

        const r = `0x${approveSignature.slice(0, 64)}`;
        const s = `0x${approveSignature.slice(64, 128)}`;
        const v = web3.utils.toDecimal('0x' + approveSignature.slice(128, 130)) + 27;

        await tryCatchRevert(() => engine.registerApprove(loanIdIdentifier, v, r, s), '');
        assert.isFalse(await engine.isApproved(loanId));
    });
    it('Lend should fail if loan not approved', async () => {
        // create a new loan
        const loanId = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], '23234');

        // check that the loan is not approved
        const isApproved = await engine.isApproved(loanId);
        assert.isFalse(isApproved, 'Should not be approved');

        // buy RCN and approve the token transfer
        await buyTokens(rcn, web3.utils.toWei('20'), accounts[2]);
        await rcn.approve(engine.address, web3.utils.toWei('20'), { from: accounts[2] });

        // try to lend and expect an exception
        await tryCatchRevert(() => engine.lend(loanId, [], address0x, [], { from: accounts[2] }), '');

        // check that the status didn't change
        expect(await engine.getStatus(loanId)).to.eq.BN('0', 'Status should be initial');
    });
    it('Should handle a loan with an oracle', async () => {
        const ethCurrency = '0x8c6f08340fe41ebd7f0ea4db20676287304e34258458cd9ed2d9fba8f39f6861';

        // create a new loan
        const loanId = await createLoan(engine, oracle.address, accounts[1], ethCurrency, web3.utils.toWei('1'), toInterestRate(27),
            toInterestRate(40), bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], '2312321');

        // the borrower should approve the loan
        await engine.approveLoan(loanId, { from: accounts[1] });

        // the creator should be accounts 0
        const creator = await engine.getCreator(loanId);
        assert.equal(creator, accounts[0], 'Creator should be account 0');

        // load the sample test data
        const dummyData = await oracle.dummyDataBytes1();

        // buy RCN and approve the token transfer
        await buyTokens(rcn, web3.utils.toWei('7000'), accounts[2]);
        await rcn.approve(engine.address, web3.utils.toWei('7000'), { from: accounts[2] });

        // execute the lend
        await engine.lend(loanId, dummyData, address0x, [], { from: accounts[2] });

        // check the lender of the loan
        const loanOwner = await engine.ownerOf(loanId);
        assert.equal(loanOwner, accounts[2], 'The lender should be account 2');

        // check the borrower balance
        expect(await rcn.balanceOf(accounts[1])).to.eq.BN(bn(web3.utils.toWei('1')).mul(bn('6000')), 'Borrower balance should be 6000 RCN');

        // check the status of the loan
        expect(await engine.getStatus(loanId)).to.eq.BN('1', 'Status should be lent');

        // pay half of the loan
        await rcn.approve(engine.address, web3.utils.toWei('7000'), { from: accounts[1] });
        await engine.pay(loanId, bn(web3.utils.toWei('1')).div(bn('2')), accounts[1], dummyData, { from: accounts[1] });

        // check if payment succeded
        expect(await engine.getLenderBalance(loanId)).to.eq.BN(bn(web3.utils.toWei('1')).div(bn('2')).mul(bn('6000')), 'The lender should have received 3000 RCN');

        // pay the total of the loan
        await buyTokens(rcn, web3.utils.toWei('5000'), accounts[1]);
        await rcn.approve(engine.address, web3.utils.toWei('5000'), { from: accounts[1] });
        await engine.pay(loanId, web3.utils.toWei('1'), accounts[1], dummyData, { from: accounts[1] });

        // check the status of the loan, should be paid
        expect(await engine.getStatus(loanId)).to.eq.BN('2', 'Status should be paid');
    });
    it('Should handle a loan with an oracle if RCN is more expensive than ETH', async () => {
        const ethCurrency = '0x8c6f08340fe41ebd7f0ea4db20676287304e34258458cd9ed2d9fba8f39f6861';

        // create a new loan
        const loanId = await createLoan(engine, oracle.address, accounts[1], ethCurrency, web3.utils.toWei('1'), toInterestRate(27),
            toInterestRate(40), bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], '2131321');

        // the borrower should approve the loan
        await engine.approveLoan(loanId, { from: accounts[1] });

        // the creator should be accounts 0
        const creator = await engine.getCreator(loanId);
        assert.equal(creator, accounts[0], 'Creator should be account 0');

        // load the sample test data
        const dummyData = await oracle.dummyDataBytes2();

        // buy RCN and approve the token transfer
        await buyTokens(rcn, web3.utils.toWei('7000'), accounts[2]);
        await rcn.approve(engine.address, web3.utils.toWei('7000'), { from: accounts[2] });

        await rcn.transfer(rcn.address, await rcn.balanceOf(accounts[1]), { from: accounts[1] });
        // execute the lend
        await engine.lend(loanId, dummyData, address0x, [], { from: accounts[2] });

        // check the lender of the loan
        const loanOwner = await engine.ownerOf(loanId);
        assert.equal(loanOwner, accounts[2], 'The lender should be account 2');

        // check the borrower balance
        expect(await rcn.balanceOf(accounts[1])).to.eq.BN(bn(web3.utils.toWei('1')).div(bn('2')), 'Borrower balance should be 0.5 RCN');

        // check the status of the loan
        expect(await engine.getStatus(loanId)).to.eq.BN('1', 'Status should be lent');

        // pay half of the loan
        const prevLenderBalance = await engine.getLenderBalance(loanId);
        await rcn.approve(engine.address, web3.utils.toWei('7000'), { from: accounts[1] });
        await engine.pay(loanId, bn(web3.utils.toWei('1')).div(bn('2')), accounts[1], dummyData, { from: accounts[1] });

        // check if payment succeded
        expect(await engine.getLenderBalance(loanId)).to.eq.BN(prevLenderBalance.add(bn(web3.utils.toWei('0.25'))), 'The lender should have received 0.25 RCN');

        // pay the total of the loan
        await buyTokens(rcn, web3.utils.toWei('5000'), accounts[1]);
        await rcn.approve(engine.address, web3.utils.toWei('5000'), { from: accounts[1] });
        await engine.pay(loanId, web3.utils.toWei('1'), accounts[1], dummyData, { from: accounts[1] });

        // check the status of the loan, should be paid
        expect(await engine.getStatus(loanId)).to.eq.BN('2', 'Status should be paid');
    });
    it('Should handle a loan with an oracle if RCN changes rate', async () => {
        const ethCurrency = '0x8c6f08340fe41ebd7f0ea4db20676287304e34258458cd9ed2d9fba8f39f6861';

        // create a new loan
        const loanId = await createLoan(engine, oracle.address, accounts[1], ethCurrency, web3.utils.toWei('1'), toInterestRate(27),
            toInterestRate(40), bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], '21312');

        // the borrower should approve the loan
        await engine.approveLoan(loanId, { from: accounts[1] });

        // the creator should be accounts 0
        const creator = await engine.getCreator(loanId);
        assert.equal(creator, accounts[0], 'Creator should be account 0');

        // load the sample test data
        let dummyData = await oracle.dummyDataBytes1();

        // buy RCN and approve the token transfer
        await buyTokens(rcn, web3.utils.toWei('7000'), accounts[2]);
        await rcn.approve(engine.address, web3.utils.toWei('7000'), { from: accounts[2] });

        await rcn.transfer(rcn.address, await rcn.balanceOf(accounts[1]), { from: accounts[1] });
        // execute the lend
        await engine.lend(loanId, dummyData, address0x, [], { from: accounts[2] });

        // check the lender of the loan
        assert.equal(await engine.ownerOf(loanId), accounts[2], 'The lender should be account 2');

        // check the borrower balance
        expect(await rcn.balanceOf(accounts[1])).to.eq.BN(bn(web3.utils.toWei('1')).mul(bn('6000')), 'Borrower balance should be 0.5 RCN');

        // check the status of the loan
        expect(await engine.getStatus(loanId)).to.eq.BN('1', 'Status should be lent');

        // load new rate, RCN is more expensive now
        dummyData = await oracle.dummyDataBytes2();

        // pay half of the loan
        await rcn.approve(engine.address, web3.utils.toWei('7000'), { from: accounts[1] });
        await engine.pay(loanId, bn(web3.utils.toWei('1')).div(bn('2')), accounts[1], dummyData, { from: accounts[1] });

        // check if payment succeded
        expect(await engine.getLenderBalance(loanId)).to.eq.BN(web3.utils.toWei('0.25'), 'The lender should have received 3000 RCN');

        // pay the total of the loan
        await buyTokens(rcn, web3.utils.toWei('5000'), accounts[1]);
        await rcn.approve(engine.address, web3.utils.toWei('5000'), { from: accounts[1] });
        await engine.pay(loanId, web3.utils.toWei('1'), accounts[1], dummyData, { from: accounts[1] });

        // check the status of the loan, should be paid
        expect(await engine.getStatus(loanId)).to.eq.BN('2', 'Status should be paid');
    });
    it('Should fail if the oracle has the wrong data', async () => {
        const ethCurrency = '0x8c6f08340fe41ebd7f0ea4db20676287304e34258458cd9ed2d9fba8f39f6861';

        // create a new loan
        const loanId = await createLoan(engine, oracle.address, accounts[1], ethCurrency, web3.utils.toWei('1'), toInterestRate(27),
            toInterestRate(40), bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], '');

        // buy RCN and approve the token transfer
        await buyTokens(rcn, web3.utils.toWei('7000'), accounts[2]);
        await rcn.approve(engine.address, web3.utils.toWei('7000'), { from: accounts[2] });

        // execute the lend but with a wrong oracle data
        await tryCatchRevert(() => engine.lend(loanId, [0x23, 0x12, 0x4a], address0x, [], { from: accounts[2] }), '');

        // check that the status didn't change
        expect(await engine.getStatus(loanId)).to.eq.BN('0', 'Status should be initial');
    });
    it('Should not allow the withdraw of lender tokens, but permit a emergency withdrawal', async () => {
        // create a new loan and lend it
        const loanId = await createLoan(
            engine,
            address0x,
            accounts[1],
            bytes320x,
            web3.utils.toWei('2'),
            toInterestRate(27),
            toInterestRate(40),
            bn('86400'),
            0,
            bn('10').pow(bn('21')),
            accounts[1],
            ''
        );
        await lendLoan(rcn, engine, accounts[2], loanId, web3.utils.toWei('2'));

        // pay the loan
        await buyTokens(rcn, web3.utils.toWei('2'), accounts[1]);
        await rcn.approve(engine.address, web3.utils.toWei('2'), { from: accounts[1] });
        await engine.pay(loanId, web3.utils.toWei('2'), accounts[1], [], { from: accounts[1] });

        // try and fail to withdraw tokens as the owner of the engine
        await tryCatchRevert(() => engine.withdrawTokens(rcn.address, accounts[3], web3.utils.toWei('1'), { from: accounts[0] }), '');

        // deposit some RCN "by mistake"
        await buyTokens(rcn, web3.utils.toWei('1'), accounts[4]);
        await rcn.transfer(engine.address, web3.utils.toWei('1'), { from: accounts[4] });

        // lender trying to withdraw more of his balance should fail
        await rcn.transfer(rcn.address, await rcn.balanceOf(accounts[2]), { from: accounts[2] });
        await tryCatchRevert(() => engine.withdrawal(loanId, accounts[2], web3.utils.toWei('2.5'), { from: accounts[2] }), '');
        expect(await rcn.balanceOf(accounts[2])).to.eq.BN('0', 'Lender should have no balance');

        // test the emergency withdraw function
        await engine.withdrawTokens(rcn.address, accounts[3], web3.utils.toWei('1'), { from: accounts[0] });
        const emergencyBalance = await rcn.balanceOf(accounts[3]);
        expect(emergencyBalance).to.eq.BN(web3.utils.toWei('1'), 'The emergency balance should be on the account 3');

        // withdraw part of the lender balance and check it
        await engine.withdrawal(loanId, accounts[2], 2000, { from: accounts[2] });
        expect(await rcn.balanceOf(accounts[2])).to.eq.BN('2000', 'Lender should have his RCN');
    });
    it('Test fix error pay all', async () => {
        // create a loan and paid it
        const loanId = await createLoan(engine, address0x, accounts[0], bytes320x, 4000, toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], '');
        await lendLoan(rcn, engine, accounts[1], loanId, 4000);

        // fully pay a loan
        await buyTokens(rcn, 8000, accounts[0]);
        await rcn.approve(engine.address, 8000, { from: accounts[0] });
        await engine.pay(loanId, 8000, accounts[0], [], { from: accounts[0] });
    });
    it('Should work with a cosigner', async () => {
        // Create loan
        const loanId = await createLoan(engine, address0x, accounts[0], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], '');

        // get cosigner data
        const cosignerData = await cosigner.data();

        // lend with cosigner
        await buyTokens(rcn, web3.utils.toWei('3'), accounts[1]);
        await rcn.approve(engine.address, web3.utils.toWei('3'), { from: accounts[1] });
        await engine.lend(loanId, [], cosigner.address, cosignerData, { from: accounts[1] });

        // cosigner should have 1 RCN
        expect(await rcn.balanceOf(cosigner.address)).to.eq.BN(web3.utils.toWei('1'), 'Cosigner should have 1 RCN');

        // the cosigner of the loan should be the test cosigner
        assert.equal(await engine.getCosigner(loanId), cosigner.address, 'The cosigner should be the test cosigner');

        // the loan should be in lent status
        expect(await engine.getStatus(loanId)).to.eq.BN('1', 'The status should be lent');
    });
    it('Should not work with the wrong cosigner data', async () => {
        // Create loan
        const loanId = await createLoan(engine, address0x, accounts[0], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[0], '2');

        // cosigner should be empty
        assert.equal(await engine.getCosigner(loanId), address0x, 'Cosigner should be empty');

        // get cosigner data
        const cosignerData = await cosigner.badData();

        // lend with cosigner, should fail because of the bad data
        const prevCosignerBalance = await rcn.balanceOf(cosigner.address);
        await rcn.approve(engine.address, web3.utils.toWei('3'), { from: accounts[1] });
        await tryCatchRevert(() => engine.lend(loanId, [], cosigner.address, cosignerData, { from: accounts[1] }), '');

        // cosigner should have 0 RCN
        expect(await rcn.balanceOf(cosigner.address)).to.eq.BN(prevCosignerBalance);

        // the cosigner of the loan should not be the test cosigner
        assert.equal(await engine.getCosigner(loanId), address0x, 'The cosigner should not be the test cosigner');

        // the loan should be in initial status
        expect(await engine.getStatus(loanId)).to.eq.BN('0', 'The status should be initial');
    });
    it('Should withdraw batch', async function () {
        const id1 = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], '11');
        const id2 = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], '22');
        const id3 = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], '44');

        await lendLoan(rcn, engine, accounts[2], id1, web3.utils.toWei('2'));
        await lendLoan(rcn, engine, accounts[2], id2, web3.utils.toWei('2'));
        await lendLoan(rcn, engine, accounts[2], id3, web3.utils.toWei('2'));

        // pay the loans
        await buyTokens(rcn, web3.utils.toWei('20'), accounts[0]);
        await rcn.increaseApproval(engine.address, web3.utils.toWei('20'));
        await engine.pay(id1, bn(web3.utils.toWei('2')), accounts[1], []);
        await engine.pay(id2, bn(web3.utils.toWei('1')), accounts[1], []);
        await engine.pay(id3, bn(web3.utils.toWei('5')).div(bn('10')), accounts[1], []);

        // Empty account 4
        await rcn.transfer(rcn.address, await rcn.balanceOf(accounts[4]), { from: accounts[4] });

        // Withdraw 3 loans
        await engine.withdrawalList([id1, id2, id3], accounts[4], { from: accounts[2] });
        expect(await rcn.balanceOf(accounts[4])).to.eq.BN(bn(web3.utils.toWei('35')).div(bn('10')));

        // Multiples withdrawal should have no effect
        await engine.withdrawalList([id1, id3], accounts[4], { from: accounts[2] });
        expect(await rcn.balanceOf(accounts[4])).to.eq.BN(bn(web3.utils.toWei('35')).div(bn('10')));
    });
    it('Should withdraw only from owned loans', async function () {
        const id1 = await createLoan(engine,
            address0x,
            accounts[1],
            bytes320x,
            web3.utils.toWei('2'),
            toInterestRate(27),
            toInterestRate(40),
            bn('86400'),
            0,
            bn('10').pow(bn('21')),
            accounts[1],
            '621'
        );
        const id2 = await createLoan(engine,
            address0x,
            accounts[1],
            bytes320x,
            web3.utils.toWei('2'),
            toInterestRate(27),
            toInterestRate(40),
            bn('86400'),
            0,
            bn('10').pow(bn('21')),
            accounts[1],
            '211'
        );
        const id3 = await createLoan(engine,
            address0x,
            accounts[1],
            bytes320x,
            web3.utils.toWei('2'),
            toInterestRate(27),
            toInterestRate(40),
            bn('86400'),
            0,
            bn('10').pow(bn('21')),
            accounts[1],
            '441'
        );

        await lendLoan(rcn, engine, accounts[2], id1, web3.utils.toWei('2'));
        await lendLoan(rcn, engine, accounts[2], id2, web3.utils.toWei('2'));
        await lendLoan(rcn, engine, accounts[2], id3, web3.utils.toWei('2'));

        await engine.transfer(accounts[9], id2, { from: accounts[2] });

        // pay the loans
        await buyTokens(rcn, web3.utils.toWei('20'), accounts[0]);
        await rcn.increaseApproval(engine.address, web3.utils.toWei('20'));
        await engine.pay(id1, web3.utils.toWei('2'), accounts[1], []);
        await engine.pay(id2, web3.utils.toWei('1'), accounts[1], []);
        await engine.pay(id3, web3.utils.toWei('0.5'), accounts[1], []);

        // Empty account 4
        await rcn.transfer(rcn.address, await rcn.balanceOf(accounts[4]), { from: accounts[4] });

        // Withdraw 3 loans
        await engine.withdrawalList([id1, id2, id3], accounts[4], { from: accounts[2] });
        expect(await rcn.balanceOf(accounts[4])).to.eq.BN(web3.utils.toWei('2.5'));

        // Multiples withdrawal should have no effect
        await engine.withdrawalList([id1, id3], accounts[4], { from: accounts[2] });
        expect(await rcn.balanceOf(accounts[4])).to.eq.BN(web3.utils.toWei('2.5'));
    });
    it('Should remove approve after transfer', async function () {
        const id1 = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], 'Remove approve');

        await lendLoan(rcn, engine, accounts[0], id1, web3.utils.toWei('2'));

        await engine.approve(accounts[7], id1, { from: accounts[0] });

        await engine.transfer(accounts[2], id1);

        await assertThrow(engine.transferFrom(accounts[0], accounts[7], id1, { from: accounts[7] }));
        await assertThrow(engine.transferFrom(accounts[2], accounts[7], id1, { from: accounts[7] }));

        assert.equal(await engine.ownerOf(id1), accounts[2]);
    });
    it('Should transfer using approve', async function () {
        const id1 = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], '9');

        await lendLoan(rcn, engine, accounts[0], id1, web3.utils.toWei('2'));

        await engine.approve(accounts[7], id1, { from: accounts[0] });

        await engine.transferFrom(accounts[0], accounts[7], id1, { from: accounts[7] });

        assert.equal(await engine.ownerOf(id1), accounts[7]);
    });
    it('Only current owner can approve', async function () {
        const id1 = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], 'Only current owner can approve');

        await lendLoan(rcn, engine, accounts[0], id1, web3.utils.toWei('2'));

        await engine.transfer(accounts[2], id1);

        await assertThrow(engine.approve(accounts[7], id1));
        await assertThrow(engine.transferFrom(accounts[2], accounts[7], id1, { from: accounts[7] }));

        assert.equal(await engine.ownerOf(id1), accounts[2]);
    });
    it('Transfer to 0x0 should fail', async function () {
        const id1 = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], 'Fail transfer to 0x0');

        await lendLoan(rcn, engine, accounts[0], id1, web3.utils.toWei('2'));

        await engine.approve(accounts[7], id1, { from: accounts[0] });

        await assertThrow(engine.transferFrom(accounts[0], address0x, id1, { from: accounts[7] }));

        assert.equal(await engine.ownerOf(id1), accounts[0]);
    });
    it('Transfer from should check from', async function () {
        const id1 = await createLoan(engine, address0x, accounts[1], bytes320x, web3.utils.toWei('2'), toInterestRate(27), toInterestRate(40),
            bn('86400'), 0, bn('10').pow(bn('21')), accounts[1], 'Fail transfer from');

        await lendLoan(rcn, engine, accounts[0], id1, web3.utils.toWei('2'));

        await assertThrow(engine.transferFrom(accounts[1], accounts[2], id1));
        assert.equal(await engine.ownerOf(id1), accounts[0]);
    });
    it('Create loan should fail if deprecated', async function () {
        await engine.setDeprecated(true);
        await assertThrow(
            createLoan(
                engine,
                address0x,
                accounts[1],
                bytes320x,
                web3.utils.toWei('2'),
                toInterestRate(27),
                toInterestRate(40),
                bn('86400'),
                bn('0'),
                bn('10').pow(bn('21')),
                accounts[1],
                'Fail, engine deprecated'
            )
        );
        await engine.setDeprecated(false);
    });
    it('Should revert destroy invalid identifier', async function () {
        await assertThrow(engine.destroyIdentifier('0x123'));
    });
    it('Test E2 28% Anual interest, 91 days', eTest(
        bn('10000'),
        bn('11108571428571'),
        bn('7405714285714'),
        bn('7862400'),
        bn('30'),
        bn('10233'),
        bn('31'),
        bn('10474'),
        bn('91'),
        bn('11469')
    ));
    it('Test E3 28% Anual interest, 30 days', eTest(
        bn('800000'),
        bn('11108571428571'),
        bn('7405714285714'),
        bn('2592000'),
        bn('10'),
        bn('806222'),
        bn('10'),
        bn('812444'),
        bn('30'),
        bn('837768')
    ));
    it('Test E4 27% Anual interest, 30 days', eTest(
        bn('10000'),
        bn('11520000000000'),
        bn('7680000000000'),
        bn('2592000'),
        bn('10'),
        bn('10075'),
        bn('10'),
        bn('10150'),
        bn('30'),
        bn('10455')
    ));
    it('Test E5 40% Anual interest, 30 days', eTest(
        bn('500000'),
        bn('7776000000000'),
        bn('5184000000000'),
        bn('2592000'),
        bn('10'),
        bn('505555'),
        bn('10'),
        bn('511111'),
        bn('30'),
        bn('533888')
    ));
    it('Test E6 40% Anual interest, 30 days', eTest(
        bn('80000'),
        bn('7776000000000'),
        bn('5184000000000'),
        bn('2592000'),
        bn('10'),
        bn('80889'),
        bn('10'),
        bn('81778'),
        bn('30'),
        bn('85422')
    ));
    it('Test E7 42% Anual interest, 30 days', eTest(
        bn('1000000'),
        bn('7405714285714'),
        bn('4937142857142'),
        bn('2592000'),
        bn('10'),
        bn('1011667'),
        bn('10'),
        bn('1023333'),
        bn('30'),
        bn('1071225')
    ));
    it('Test E8 27% Anual interset, 30 days', eTest(
        bn('70000'),
        bn('11520000000000'),
        bn('7680000000000'),
        bn('2592000'),
        bn('10'),
        bn('70525'),
        bn('10'),
        bn('71050'),
        bn('30'),
        bn('73185')
    ));
    it('Test E9 42% Anual interset, 30 days', eTest(
        bn('500000'),
        bn('7405714285714'),
        bn('4937142857142'),
        bn('2592000'),
        bn('10'),
        bn('505833'),
        bn('10'),
        bn('511667'),
        bn('30'),
        bn('535613')
    ));
    it('Test E10 30% Anual interset, 30 days', eTest(
        bn('300000'),
        bn('10368000000000'),
        bn('6912000000000'),
        bn('2592000'),
        bn('10'),
        bn('302500'),
        bn('10'),
        bn('305000'),
        bn('30'),
        bn('315188')
    ));
    it('Test E8 27% Anual interset, 30 days', eTest2(
        bn('70000'),
        bn('11520000000000'),
        bn('7680000000000'),
        bn('2592000'),
        bn('10'),
        bn('70525'),
        bn('10'),
        bn('71050'),
        bn('30'),
        bn('73185')
    ));
    it('Test E9 42% Anual interset, 30 days', eTest2(
        bn('500000'),
        bn('7405714285714'),
        bn('4937142857142'),
        bn('2592000'),
        bn('10'),
        bn('505833'),
        bn('10'),
        bn('511667'),
        bn('30'),
        bn('535613')
    ));
    it('Test E10 30% Anual interset, 30 days', eTest2(
        bn('300000'),
        bn('10368000000000'),
        bn('6912000000000'),
        bn('2592000'),
        bn('10'),
        bn('302500'),
        bn('10'),
        bn('305000'),
        bn('30'),
        bn('315188')
    ));

    function eTest (amount, interest, punitoryInterest, duesIn, d1, v1, d2, v2, d3, v3) {
        return async () => {
            const secondsInDay = bn('86400');
            const prevBal = await rcn.balanceOf(accounts[1]);

            // Create a new loan with the received params
            const loanId = await createLoan(engine, address0x, accounts[1], bytes320x, amount, interest, punitoryInterest,
                duesIn, 0, bn('10').pow(bn('21')), accounts[1], 'e1');

            // test configuration params
            const cosigner = await engine.getCosigner(loanId);
            const borrower = await engine.getBorrower(loanId);
            const creator = await engine.getCreator(loanId);
            const lender = await engine.ownerOf(loanId);
            const currency = await engine.getCurrency(loanId);
            const oracle = await engine.getOracle(loanId);
            const status = await engine.getStatus(loanId);
            const loanAmount = await engine.getAmount(loanId);
            const loanInterest = await engine.getInterest(loanId);
            const loanPunitoryInterest = await engine.getPunitoryInterest(loanId);
            const interestTimestamp = await engine.getInterestTimestamp(loanId);
            const paid = await engine.getPaid(loanId);
            const interestRate = await engine.getInterestRate(loanId);
            const interestRatePunitory = await engine.getInterestRatePunitory(loanId);
            const dueTime = await engine.getDueTime(loanId);
            const loanDuesIn = await engine.getDuesIn(loanId);
            const cancelableAt = await engine.getCancelableAt(loanId);
            const lenderBalance = await engine.getLenderBalance(loanId);
            const approvedTransfer = await engine.getApproved(loanId);
            const expirationRequest = await engine.getExpirationRequest(loanId);

            expect(expirationRequest).to.eq.BN(bn('10').pow(bn('21')), 'Should had the defined expiration');
            assert.equal(approvedTransfer, address0x, 'Approved transfer should start empty');
            expect(cancelableAt).to.eq.BN('0', 'Cancelable at should be 0');
            expect(lenderBalance).to.eq.BN('0', 'Lender balance should start at 0');
            expect(dueTime).to.eq.BN('0', 'Due time should start at 0');
            expect(loanDuesIn).to.eq.BN(duesIn, 'Dues in should be the defined');
            expect(interestRate).to.eq.BN(interest, 'Interest rate should be the defined');
            expect(interestRatePunitory).to.eq.BN(punitoryInterest, 'Interest rate punitory should be the defined');
            expect(paid).to.eq.BN('0', 'Paid should start at 0');
            expect(interestTimestamp).to.eq.BN('0', 'Interest timestamp should start at 0');
            expect(loanInterest).to.eq.BN('0', 'Interest should start at 0');
            expect(loanPunitoryInterest).to.eq.BN('0', 'Punitory interest should start at 0');
            expect(loanAmount).to.eq.BN(amount, 'Amount should be the defined amount');
            expect(status).to.eq.BN('0', 'Status should be initial');
            assert.equal(cosigner, address0x, 'Cosigner should be empty');
            assert.equal(borrower, accounts[1], 'Borrower should be account 1');
            assert.equal(creator, accounts[1], 'Creator should be account 0');
            assert.equal(lender, address0x, 'Lender should be empty');
            assert.equal(currency, bytes320x, 'Currency should be empty');
            assert.equal(oracle, address0x, 'Oracle should be empty');

            // Check if the loan is approved
            const isApproved = await engine.isApproved(loanId);
            assert.isTrue(isApproved, 'Should be approved');

            // Buy tokens and prepare the lender to do the lent
            await buyTokens(rcn, web3.utils.toWei('100'), accounts[2]);
            await rcn.approve(engine.address, web3.utils.toWei('100'), { from: accounts[2] });

            // accounts[2] lends to the borrower
            await engine.lend(loanId, [], address0x, [], { from: accounts[2] });

            // check that the borrower received the RCN
            const received = (await rcn.balanceOf(accounts[1])).sub(prevBal);
            expect(received).to.eq.BN(amount, 'The borrower should have the RCN');

            // forward time, d1 days
            await increaseTime(d1.mul(secondsInDay).toNumber());

            // check that the interest accumulated it's close to the defined by the test
            await engine.addInterest(loanId);
            const d1PendingAmount = await engine.getRawPendingAmount(loanId);
            const d1Diff = d1PendingAmount.sub(v1).toNumber();
            assert.isBelow(d1Diff, 2, 'The v1 should aprox the interest rate in the d1 timestamp');

            // forward time, d2 days
            await increaseTime(d2.mul(secondsInDay).toNumber());

            // check that the interest accumulated it's close to the defined by the test
            await engine.addInterest(loanId);
            const d2PendingAmount = await engine.getRawPendingAmount(loanId);
            const d2Diff = d2PendingAmount.sub(v2).toNumber();
            assert.isBelow(d2Diff, 2, 'The v2 should aprox the interest rate in the d2 timestamp');

            // forward time, d3 days
            await increaseTime(d3.mul(secondsInDay).toNumber());

            // check that the interest accumulated it's close to the defined by the test
            await engine.addInterest(loanId);
            const d3PendingAmount = await engine.getRawPendingAmount(loanId);
            const d3Diff = d3PendingAmount.sub(v3).toNumber();
            assert.isBelow(d3Diff, 2, 'The v3 should aprox the interest rate in the d3 timestamp');
        };
    }

    function eTest2 (amount, interest, punitoryInterest, duesIn, d1, v1, d2, v2, d3, v3) {
        return async () => {
            const secondsInDay = bn('86400');
            const prevBal = await rcn.balanceOf(accounts[1]);

            // Create a new loan with the received params
            const loanId = await createLoan(
                engine,
                address0x,
                accounts[1],
                bytes320x,
                amount,
                interest,
                punitoryInterest,
                duesIn,
                d1.mul(secondsInDay),
                bn('10').pow(bn('21')),
                accounts[1],
                'e2'
            );

            // test configuration params
            const cosigner = await engine.getCosigner(loanId);
            const borrower = await engine.getBorrower(loanId);
            const creator = await engine.getCreator(loanId);
            const lender = await engine.ownerOf(loanId);
            const currency = await engine.getCurrency(loanId);
            const oracle = await engine.getOracle(loanId);
            const status = await engine.getStatus(loanId);
            const loanAmount = await engine.getAmount(loanId);
            const loanInterest = await engine.getInterest(loanId);
            const loanPunitoryInterest = await engine.getPunitoryInterest(loanId);
            const interestTimestamp = await engine.getInterestTimestamp(loanId);
            const paid = await engine.getPaid(loanId);
            const interestRate = await engine.getInterestRate(loanId);
            const interestRatePunitory = await engine.getInterestRatePunitory(loanId);
            const dueTime = await engine.getDueTime(loanId);
            const loanDuesIn = await engine.getDuesIn(loanId);
            const cancelableAt = await engine.getCancelableAt(loanId);
            const lenderBalance = await engine.getLenderBalance(loanId);
            const approvedTransfer = await engine.getApproved(loanId);
            const expirationRequest = await engine.getExpirationRequest(loanId);

            expect(expirationRequest).to.eq.BN(bn('10').pow(bn('21')), 'Should had the defined expiration');
            assert.equal(approvedTransfer, address0x, 'Approved transfer should start empty');
            expect(cancelableAt).to.eq.BN(d1.mul(secondsInDay), 'Cancelable at should be 0');
            expect(lenderBalance).to.eq.BN('0', 'Lender balance should start at 0');
            expect(dueTime).to.eq.BN('0', 'Due time should start at 0');
            expect(loanDuesIn).to.eq.BN(duesIn, 'Dues in should be the defined');
            expect(interestRate).to.eq.BN(interest, 'Interest rate should be the defined');
            expect(interestRatePunitory).to.eq.BN(punitoryInterest, 'Interest rate punitory should be the defined');
            expect(paid).to.eq.BN('0', 'Paid should start at 0');
            expect(interestTimestamp).to.eq.BN('0', 'Interest timestamp should start at 0');
            expect(loanInterest).to.eq.BN('0', 'Interest should start at 0');
            expect(loanPunitoryInterest).to.eq.BN('0', 'Punitory interest should start at 0');
            expect(loanAmount).to.eq.BN(amount, 'Amount should be the defined amount');
            expect(status).to.eq.BN('0', 'Status should be initial');
            assert.equal(cosigner, address0x, 'Cosigner should be empty');
            assert.equal(borrower, accounts[1], 'Borrower should be account 1');
            assert.equal(creator, accounts[1], 'Creator should be account 0');
            assert.equal(lender, address0x, 'Lender should be empty');
            assert.equal(currency, bytes320x, 'Currency should be empty');
            assert.equal(oracle, address0x, 'Oracle should be empty');

            // Check if the loan is approved
            const isApproved = await engine.isApproved(loanId);
            assert.isTrue(isApproved, 'Should be approved');

            // Buy tokens and prepare the lender to do the lent
            await buyTokens(rcn, web3.utils.toWei('100'), accounts[2]);
            await rcn.approve(engine.address, web3.utils.toWei('100'), { from: accounts[2] });

            // accounts[2] lends to the borrower
            await engine.lend(loanId, [], address0x, [], { from: accounts[2] });

            // check that the borrower received the RCN
            const received = (await rcn.balanceOf(accounts[1])).sub(prevBal);
            expect(received).to.eq.BN(amount, 'The borrower should have the RCN');

            // check cancelable at assigned value
            let d1PendingAmount = await engine.getRawPendingAmount(loanId);
            let d1Diff = d1PendingAmount.sub(v1);
            assert.isBelow(d1Diff.toNumber(), 2, 'The v1 should aprox the interest rate in the d1 timestamp');

            // forward time, d1 days
            await increaseTime(d1.mul(secondsInDay).toNumber());

            // check that the interest accumulated it's close to the defined by the test
            await engine.addInterest(loanId);
            d1PendingAmount = await engine.getRawPendingAmount(loanId);
            d1Diff = d1PendingAmount.sub(v1);
            assert.isBelow(d1Diff.toNumber(), 2, 'The v1 should aprox the interest rate in the d1 timestamp');

            // forward time, d2 days
            await increaseTime(d2.mul(secondsInDay).toNumber());

            // check that the interest accumulated it's close to the defined by the test
            await engine.addInterest(loanId);
            const d2PendingAmount = await engine.getRawPendingAmount(loanId);
            const d2Diff = d2PendingAmount.sub(v2);
            assert.isBelow(d2Diff.toNumber(), 2, 'The v2 should aprox the interest rate in the d2 timestamp');

            // forward time, d3 days
            await increaseTime(d3.mul(secondsInDay).toNumber());

            // check that the interest accumulated it's close to the defined by the test
            await engine.addInterest(loanId);
            const d3PendingAmount = await engine.getRawPendingAmount(loanId);
            const d3Diff = d3PendingAmount.sub(v3);
            assert.isBelow(d3Diff.toNumber(), 2, 'The v3 should aprox the interest rate in the d3 timestamp');
        };
    }
});
