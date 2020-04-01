const Collateral = artifacts.require('Collateral');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');

const TestModel = artifacts.require('TestModel');
const TestToken = artifacts.require('TestToken');
const TestRateOracle = artifacts.require('TestRateOracle');
const TestCollateralAuctionMock = artifacts.require('TestCollateralAuctionMock');
const TestCollateralHandler = artifacts.require('TestCollateralHandler');

const {
    expect,
    bn,
    random32bn,
    address0x,
    bytes320x,
    getBlockTime,
    toEvents,
    tryCatchRevert,
    toBytes32,
    increaseTime,
} = require('../../Helper.js');

contract('Test Collateral cosigner Diaspore', function (accounts) {
    const owner = accounts[1];
    const borrower = accounts[2];
    const creator = accounts[3];

    let rcn;
    let auxToken;
    let loanManager;
    let debtEngine;
    let model;
    let collateral;
    let oracle;
    let testCollateralAuctionMock;
    let testCollateralHandler;

    const WEI = bn(web3.utils.toWei('1'));

    function ratio (num) {
        return bn(num).mul(bn(2).pow(bn(32))).div(bn(100));
    }

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Requested');
        assert.ok(event);
        return event.args._id;
    }

    async function createDefaultLoan () {
        const loanAmount = WEI;
        const duration = bn(await getBlockTime()).add(bn(60 * 60));

        const interestAmount = bn('1');
        const interestTime = duration.add(bn(60 * 60));

        const loanData = await model.encodeData(loanAmount, duration, interestAmount, interestTime);

        const loanTx = loanManager.requestLoan(
            loanAmount,        // Amount
            model.address,     // Model
            address0x,         // Oracle
            borrower,          // Borrower
            address0x,         // Callback
            random32bn(),      // salt
            duration,          // Expiration
            loanData,          // Loan data
            { from: borrower } // Creator
        );

        return getId(loanTx);
    }

    async function createDefaultCollateral () {
        const loanId = await createDefaultLoan();
        const entryAmount = WEI.mul(bn(2));

        await auxToken.setBalance(creator, entryAmount, { from: owner });
        await auxToken.approve(collateral.address, entryAmount, { from: creator });

        const Created = await toEvents(
            collateral.create(
                creator,          // Owner
                loanId,           // debtId
                oracle.address,   // entry oracle
                entryAmount,      // amount
                ratio(150),       // liquidationRatio
                ratio(200),       // balanceRatio
                { from: creator } // sender
            ),
            'Created'
        );

        return {
            entryId: Created._entryId,
            loanId: loanId,
        };
    }

    async function lendDefaultCollateral () {
        const ids = await createDefaultCollateral();

        const loanAmount = (await loanManager.requests(ids.loanId)).amount;
        await rcn.setBalance(creator, loanAmount);
        await rcn.approve(loanManager.address, loanAmount, { from: creator });

        await loanManager.lend(
            ids.loanId,             // Loan ID
            [],                     // Oracle data
            collateral.address,     // Collateral cosigner address
            bn(0),                  // Collateral cosigner cost
            toBytes32(ids.entryId), // Collateral ID reference
            [],                     // Callback data
            { from: creator }
        );

        return ids;
    }

    before('Create contracts', async function () {
        rcn = await TestToken.new({ from: owner });
        auxToken = await TestToken.new({ from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        await oracle.setEquivalent(WEI, { from: owner });
        await oracle.setToken(auxToken.address, { from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        testCollateralAuctionMock = await TestCollateralAuctionMock.new(loanManager.address, { from: owner });
        collateral = await Collateral.new(loanManager.address, testCollateralAuctionMock.address, { from: owner });
        await testCollateralAuctionMock.setCollateral(collateral.address);
        testCollateralHandler = await TestCollateralHandler.new(collateral.address, { from: owner });
    });

    it('Set new url', async function () {
        const url = 'test.com';

        const SetUrl = await toEvents(
            collateral.setUrl(
                url,
                { from: owner }
            ),
            'SetUrl'
        );

        assert.equal(SetUrl._url, url);
        assert.equal(await collateral.url(), url);
    });
    it('The cost should be 0', async function () {
        expect(await collateral.cost(
            address0x,
            0,
            [],
            []
        )).to.eq.BN(0);
    });
    describe('Functions onlyOwner', async function () {
        it('Try redeem an entry without being the owner', async function () {
            await tryCatchRevert(
                () => collateral.redeem(
                    0,
                    creator,
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });
        it('Try set new url without be the owner', async function () {
            await tryCatchRevert(
                () => collateral.setUrl(
                    '',
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });
    });
    describe('Constructor', function () {
        it('Check the loanManager and loanManagerToken', async function () {
            const collateral = await Collateral.new(loanManager.address, testCollateralAuctionMock.address, { from: owner });

            assert.equal(await collateral.loanManager(), loanManager.address);
            assert.equal(await collateral.loanManagerToken(), await loanManager.token());
            assert.equal(await collateral.auction(), testCollateralAuctionMock.address);
            expect(await collateral.getEntriesLength()).to.eq.BN(bn(1));
        });
    });
    describe('Function create', function () {
        it('Should create a new collateral', async function () {
            const loanId = await createDefaultLoan();
            const liquidationRatio = ratio(150);
            const balanceRatio = ratio(200);
            const entryAmount = WEI;
            const collId = await collateral.getEntriesLength();

            await rcn.setBalance(creator, entryAmount, { from: owner });
            await rcn.approve(collateral.address, entryAmount, { from: creator });

            const prevCollBalance = await rcn.balanceOf(collateral.address);
            const prevCreatorBalance = await rcn.balanceOf(creator);

            const Created = await toEvents(
                collateral.create(
                    creator,
                    loanId,
                    address0x,
                    entryAmount,
                    liquidationRatio,
                    balanceRatio,
                    { from: creator }
                ),
                'Created'
            );

            // Control collateral creation event
            expect(Created._entryId).to.eq.BN(collId);
            assert.equal(Created._debtId, loanId);
            assert.equal(Created._oracle, address0x);
            assert.equal(Created._token, rcn.address);
            expect(Created._amount).to.eq.BN(entryAmount);
            expect(Created._liquidationRatio).to.eq.BN(liquidationRatio);
            expect(Created._balanceRatio).to.eq.BN(balanceRatio);

            // Ownership
            assert.equal(await collateral.ownerOf(collId), creator);
            // Entry length
            expect(await collateral.getEntriesLength()).to.eq.BN(collId.add(bn(1)));
            // Balance of collateral
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.add(entryAmount));
            expect(await rcn.balanceOf(creator)).to.eq.BN(prevCreatorBalance.sub(entryAmount));
        });
        it('Should create a new collateral, with auxToken as entry token', async function () {
            const loanId = await createDefaultLoan();
            const liquidationRatio = ratio(150);
            const balanceRatio = ratio(200);
            const entryAmount = WEI;
            const collId = await collateral.getEntriesLength();

            await auxToken.setBalance(creator, entryAmount, { from: owner });
            await auxToken.approve(collateral.address, entryAmount, { from: creator });

            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevCreatorBalance = await auxToken.balanceOf(creator);

            const Created = await toEvents(
                collateral.create(
                    creator,
                    loanId,
                    oracle.address,
                    entryAmount,
                    liquidationRatio,
                    balanceRatio,
                    { from: creator }
                ),
                'Created'
            );

            // Control collateral creation event
            expect(Created._entryId).to.eq.BN(collId);
            assert.equal(Created._debtId, loanId);
            assert.equal(Created._oracle, oracle.address);
            assert.equal(Created._token, auxToken.address);
            expect(Created._amount).to.eq.BN(entryAmount);
            expect(Created._liquidationRatio).to.eq.BN(liquidationRatio);
            expect(Created._balanceRatio).to.eq.BN(balanceRatio);

            // Ownership
            assert.equal(await collateral.ownerOf(collId), creator);
            // Entry length
            expect(await collateral.getEntriesLength()).to.eq.BN(collId.add(bn(1)));
            // Balance of collateral
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.add(entryAmount));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBalance.sub(entryAmount));
        });
        it('Try create a new collateral with address 0 as owner', async function () {
            const loanId = await createDefaultLoan();

            await tryCatchRevert(
                () => collateral.create(
                    address0x,
                    loanId,
                    address0x,
                    1,
                    ratio(150),
                    ratio(200),
                    { from: creator }
                ),
                'collateral: _owner should not be address 0'
            );
        });
        it('Try create a new collateral for a closed loan', async function () {
            const loanId = await createDefaultLoan();
            await rcn.setBalance(owner, WEI.mul(bn(100)), { from: owner });
            await rcn.approve(loanManager.address, WEI.mul(bn(100)), { from: owner });
            await loanManager.lend(loanId, [], address0x, 0, [], [], { from: owner });

            await tryCatchRevert(
                () => collateral.create(
                    creator,
                    loanId,
                    address0x,
                    0,
                    ratio(150),
                    ratio(200),
                    { from: creator }
                ),
                'collateral: loan request should be open'
            );
        });
        it('Try create a new collateral without approval of the token collateral', async function () {
            const loanId = await createDefaultLoan();

            await rcn.setBalance(creator, 1, { from: owner });
            await rcn.approve(collateral.address, 0, { from: creator });

            await tryCatchRevert(
                () => collateral.create(
                    creator,
                    loanId,
                    address0x,
                    1,
                    ratio(150),
                    ratio(200),
                    { from: creator }
                ),
                'collateral: error pulling tokens from owner'
            );

            await rcn.setBalance(owner, 1, { from: owner });
            await rcn.approve(collateral.address, 0, { from: owner });

            await tryCatchRevert(
                () => collateral.create(
                    owner,
                    loanId,
                    address0x,
                    1,
                    ratio(150),
                    ratio(200),
                    { from: creator }
                ),
                'collateral: error pulling tokens from owner'
            );
        });
    });
    describe('Function deposit', function () {
        it('Should deposit an amount in a collateral', async function () {
            const ids = await createDefaultCollateral();

            const prevEntry = await collateral.entries(ids.entryId);

            const depositAmount = bn(10000);
            await auxToken.setBalance(creator, depositAmount, { from: owner });
            await auxToken.approve(collateral.address, depositAmount, { from: creator });

            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevCreatorBalance = await auxToken.balanceOf(creator);

            const Deposited = await toEvents(
                collateral.deposit(
                    ids.entryId,
                    depositAmount,
                    { from: creator }
                ),
                'Deposited'
            );

            // Test event
            expect(Deposited._entryId).to.eq.BN(ids.entryId);
            expect(Deposited._amount).to.eq.BN(depositAmount);
            // Test collateral entry
            const entry = await collateral.entries(ids.entryId);
            // Should remain the same
            expect(entry.liquidationRatio).to.eq.BN(prevEntry.liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(prevEntry.balanceRatio);
            expect(entry.burnFee).to.eq.BN(prevEntry.burnFee);
            expect(entry.rewardFee).to.eq.BN(prevEntry.rewardFee);
            assert.equal(entry.token, prevEntry.token);
            assert.equal(entry.debtId, prevEntry.debtId);
            // Should increase by amount
            expect(entry.amount).to.eq.BN(prevEntry.amount.add(depositAmount));
            // Balance of collateral
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.add(depositAmount));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBalance.sub(depositAmount));
        });
        it('Try deposit 0 amount on entry collateral', async function () {
            const ids = await lendDefaultCollateral();

            await tryCatchRevert(
                () => collateral.deposit(
                    ids.entryId,
                    0,
                    { from: creator }
                ),
                'collateral: The amount of deposit should not be 0'
            );
        });
        it('Try deposit collateral in a inAuction entry', async function () {
            const ids = await lendDefaultCollateral();

            await increaseTime(60 * 61);
            await collateral.claim(address0x, ids.loanId, []);

            await tryCatchRevert(
                () => collateral.deposit(
                    ids.entryId,
                    1,
                    { from: creator }
                ),
                'collateral: can\'t deposit during auction'
            );
        });
    });
    describe('Function withdraw', function () {
        it('Should withdraw token', async function () {
            const ids = await createDefaultCollateral();

            const prevEntry = await collateral.entries(ids.entryId);

            const withdrawAmount = bn(1);
            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevBorrowerBalance = await auxToken.balanceOf(borrower);

            const Withdraw = await toEvents(
                collateral.withdraw(
                    ids.entryId,
                    borrower,
                    withdrawAmount,
                    [],
                    { from: creator }
                ),
                'Withdraw'
            );

            // Test event
            expect(Withdraw._entryId).to.eq.BN(ids.entryId);
            assert.equal(Withdraw._to, borrower);
            expect(Withdraw._amount).to.eq.BN(withdrawAmount);

            // Test collateral entry
            const entry = await collateral.entries(ids.entryId);
            // Should remain the same
            expect(entry.liquidationRatio).to.eq.BN(prevEntry.liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(prevEntry.balanceRatio);
            expect(entry.burnFee).to.eq.BN(prevEntry.burnFee);
            expect(entry.rewardFee).to.eq.BN(prevEntry.rewardFee);
            assert.equal(entry.token, prevEntry.token);
            assert.equal(entry.debtId, prevEntry.debtId);
            expect(entry.amount).to.eq.BN(prevEntry.amount.sub(withdrawAmount));

            // Balance of collateral
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.sub(withdrawAmount));
            expect(await auxToken.balanceOf(borrower)).to.eq.BN(prevBorrowerBalance.add(withdrawAmount));
        });
        it('Try withdraw 0 amount on entry collateral', async function () {
            const ids = await createDefaultCollateral();

            await tryCatchRevert(
                async () => collateral.withdraw(
                    ids.entryId,
                    borrower,
                    0,
                    [],
                    { from: creator }
                ),
                'collateral: The amount of withdraw not be 0'
            );
        });
        it('Try withdraw high balance', async function () {
            const ids = await createDefaultCollateral();

            await tryCatchRevert(
                async () => collateral.withdraw(
                    ids.entryId,
                    borrower,
                    (await collateral.entries(ids.entryId)).amount.add(bn(1)),
                    [],
                    { from: creator }
                ),
                'collateral: withdrawable collateral is not enough'
            );
        });
        it('Should withdraw token on lent entry', async function () {
            const ids = await lendDefaultCollateral();

            const prevEntry = await collateral.entries(ids.entryId);

            const withdrawAmount = bn(1);
            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevBorrowerBalance = await auxToken.balanceOf(borrower);

            const Withdraw = await toEvents(
                collateral.withdraw(
                    ids.entryId,
                    borrower,
                    withdrawAmount,
                    [],
                    { from: creator }
                ),
                'Withdraw'
            );

            // Test event
            expect(Withdraw._entryId).to.eq.BN(ids.entryId);
            assert.equal(Withdraw._to, borrower);
            expect(Withdraw._amount).to.eq.BN(withdrawAmount);

            // Test collateral entry
            const entry = await collateral.entries(ids.entryId);
            // Should remain the same
            expect(entry.liquidationRatio).to.eq.BN(prevEntry.liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(prevEntry.balanceRatio);
            expect(entry.burnFee).to.eq.BN(prevEntry.burnFee);
            expect(entry.rewardFee).to.eq.BN(prevEntry.rewardFee);
            assert.equal(entry.token, prevEntry.token);
            assert.equal(entry.debtId, prevEntry.debtId);
            expect(entry.amount).to.eq.BN(prevEntry.amount.sub(withdrawAmount));

            // Balance of collateral
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.sub(withdrawAmount));
            expect(await auxToken.balanceOf(borrower)).to.eq.BN(prevBorrowerBalance.add(withdrawAmount));
        });
        it('Try withdraw total balance on lent entry', async function () {
            const ids = await lendDefaultCollateral();

            await tryCatchRevert(
                async () => collateral.withdraw(
                    ids.entryId,
                    borrower,
                    (await collateral.entries(ids.entryId)).amount,
                    [],
                    { from: creator }
                ),
                'collateral: withdrawable collateral is not enough'
            );
        });
        it('Try withdraw collateral in a inAuction entry', async function () {
            const ids = await lendDefaultCollateral();

            await increaseTime(60 * 61);
            await collateral.claim(address0x, ids.loanId, []);

            await tryCatchRevert(
                () => collateral.withdraw(
                    ids.entryId,
                    address0x,
                    1,
                    [],
                    { from: creator }
                ),
                'collateral: can\'t withdraw during auction'
            );
        });
        it('Try withdraw an entry without being authorized', async function () {
            const ids = await lendDefaultCollateral();

            await tryCatchRevert(
                () => collateral.withdraw(
                    ids.entryId,
                    address0x,
                    0,
                    [],
                    { from: borrower }
                ),
                'msg.sender Not authorized'
            );
        });
        it('Should withdraw token in a paid debt', async function () {
            const ids = await lendDefaultCollateral();

            const amountToPay = await loanManager.getClosingObligation(ids.loanId);
            await rcn.setBalance(testCollateralHandler.address, amountToPay, { from: owner });

            const entryAmount = (await collateral.entries(ids.entryId)).amount;
            await testCollateralHandler.setHandlerConst(
                amountToPay,
                entryAmount.sub(amountToPay)
            );

            await collateral.borrowCollateral(
                ids.entryId,
                testCollateralHandler.address,
                [],
                [],
                { from: creator }
            );

            expect(await loanManager.getClosingObligation(ids.loanId)).to.eq.BN(0);

            const prevEntry = await collateral.entries(ids.entryId);

            const withdrawAmount = prevEntry.amount;
            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevBorrowerBalance = await auxToken.balanceOf(borrower);

            const Withdraw = await toEvents(
                collateral.withdraw(
                    ids.entryId,
                    borrower,
                    withdrawAmount,
                    [],
                    { from: creator }
                ),
                'Withdraw'
            );

            // Test event
            expect(Withdraw._entryId).to.eq.BN(ids.entryId);
            assert.equal(Withdraw._to, borrower);
            expect(Withdraw._amount).to.eq.BN(withdrawAmount);

            // Test collateral entry
            const entry = await collateral.entries(ids.entryId);
            // Should remain the same
            expect(entry.liquidationRatio).to.eq.BN(prevEntry.liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(prevEntry.balanceRatio);
            expect(entry.burnFee).to.eq.BN(prevEntry.burnFee);
            expect(entry.rewardFee).to.eq.BN(prevEntry.rewardFee);
            assert.equal(entry.token, prevEntry.token);
            assert.equal(entry.debtId, prevEntry.debtId);
            expect(entry.amount).to.eq.BN(prevEntry.amount.sub(withdrawAmount));

            // Balance of collateral
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.sub(withdrawAmount));
            expect(await auxToken.balanceOf(borrower)).to.eq.BN(prevBorrowerBalance.add(withdrawAmount));
        });
    });
    describe('Function redeem', function () {
        it('Should redeem an entry with a loan in ERROR status', async function () {
            const ids = await lendDefaultCollateral();

            await model.setErrorFlag(ids.loanId, 4, { from: owner });

            const collAmount = (await collateral.entries(ids.entryId)).amount;
            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prev7Balance = await auxToken.balanceOf(creator);

            const Redeemed = await toEvents(
                collateral.redeem(
                    ids.entryId,
                    accounts[7],
                    { from: owner }
                ),
                'Redeemed'
            );

            expect(Redeemed._entryId).to.eq.BN(ids.entryId);
            assert.equal(Redeemed._to, accounts[7]);

            const entry = await collateral.entries(ids.entryId);
            // Should remain the same
            expect(entry.liquidationRatio).to.eq.BN(0);
            expect(entry.balanceRatio).to.eq.BN(0);
            expect(entry.burnFee).to.eq.BN(0);
            expect(entry.rewardFee).to.eq.BN(0);
            assert.equal(entry.token, address0x);
            assert.equal(entry.debtId, bytes320x);
            expect(entry.amount).to.eq.BN(0);
            // Balance of collateral
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.sub(collAmount));
            expect(await auxToken.balanceOf(accounts[7])).to.eq.BN(prev7Balance.add(collAmount));
        });
        it('Try redeem an entry with a loan in not ERROR status', async function () {
            const ids = await lendDefaultCollateral();

            await tryCatchRevert(
                () => collateral.redeem(
                    ids.entryId,
                    creator,
                    { from: owner }
                ),
                'collateral: the debt should be in status error'
            );
        });
    });
    describe('Function borrowCollateral', function () {
        it('Should pay the total loan amount', async function () {
            const ids = await lendDefaultCollateral();

            const prevEntry = await collateral.entries(ids.entryId);

            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevBorrowerBalance = await auxToken.balanceOf(borrower);

            const amountToPay = await loanManager.getClosingObligation(ids.loanId);
            await rcn.setBalance(testCollateralHandler.address, amountToPay, { from: owner });

            await testCollateralHandler.setHandlerConst(
                amountToPay,
                prevEntry.amount.sub(amountToPay)
            );

            const BorrowCollateral = await toEvents(
                collateral.borrowCollateral(
                    ids.entryId,
                    testCollateralHandler.address,
                    [],
                    [],
                    { from: creator }
                ),
                'BorrowCollateral'
            );

            // Test event
            assert.equal(BorrowCollateral._handler, testCollateralHandler.address);
            expect(BorrowCollateral._newAmount).to.eq.BN(prevEntry.amount.sub(amountToPay));

            // Test collateral entry
            const entry = await collateral.entries(ids.entryId);
            // Should remain the same
            expect(entry.liquidationRatio).to.eq.BN(prevEntry.liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(prevEntry.balanceRatio);
            expect(entry.burnFee).to.eq.BN(prevEntry.burnFee);
            expect(entry.rewardFee).to.eq.BN(prevEntry.rewardFee);
            assert.equal(entry.token, prevEntry.token);
            assert.equal(entry.debtId, prevEntry.debtId);
            expect(entry.amount).to.eq.BN(prevEntry.amount.sub(amountToPay));

            // Balance of collateral
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.sub(amountToPay));
            expect(await auxToken.balanceOf(borrower)).to.eq.BN(prevBorrowerBalance);
        });
        it('Try hack with handler contract', async function () {
            const ids = await lendDefaultCollateral();

            const entryAmount = (await collateral.entries(ids.entryId)).amount;
            const amountToPay = await loanManager.getClosingObligation(ids.loanId);
            await rcn.setBalance(testCollateralHandler.address, 0, { from: owner });
            await testCollateralHandler.setHandlerConst(
                amountToPay,
                entryAmount
            );
            await tryCatchRevert(
                () => collateral.borrowCollateral(
                    ids.entryId,
                    testCollateralHandler.address,
                    [],
                    [],
                    { from: creator }
                ),
                'Error pulling tokens'
            );
        });
        it('Try borrowCollateral an entry without being authorized', async function () {
            const ids = await lendDefaultCollateral();

            await tryCatchRevert(
                () => collateral.borrowCollateral(
                    ids.entryId,
                    address0x,
                    [],
                    [],
                    { from: borrower }
                ),
                'msg.sender Not authorized'
            );
        });
    });
    describe('Function auctionClosed', function () {
        it('Should close an auction', async function () {
            const ids = await lendDefaultCollateral();

            await increaseTime(60 * 61);
            await collateral.claim(address0x, ids.loanId, []);

            const leftover = bn(1000);
            const received = bn(1000);
            await rcn.setBalance(testCollateralAuctionMock.address, received, { from: owner });

            const auctionId = await collateral.entryToAuction(ids.entryId);

            await testCollateralAuctionMock.toAuctionClosed(
                auctionId,
                leftover,
                received,
                []
            );

            expect(await collateral.entryToAuction(ids.entryId)).to.eq.BN(0);
            expect(await collateral.auctionToEntry(auctionId)).to.eq.BN(0);

            const entryAmount = (await collateral.entries(ids.entryId)).amount;
            expect(entryAmount).to.eq.BN(leftover);
            expect((await debtEngine.debts(ids.loanId)).balance).to.eq.BN(received);
        });
        it('Should close an auction, pay the loan and received more tokens', async function () {
            const ids = await lendDefaultCollateral();

            await increaseTime(60 * 61);
            await collateral.claim(address0x, ids.loanId, []);

            const received = WEI.mul(bn(2));
            await rcn.setBalance(testCollateralAuctionMock.address, received, { from: owner });

            const auctionId = await collateral.entryToAuction(ids.entryId);

            const prevCreatorBalance = await rcn.balanceOf(creator);

            await testCollateralAuctionMock.toAuctionClosed(
                auctionId,
                0,
                received,
                []
            );

            expect(await rcn.balanceOf(creator)).to.eq.BN(prevCreatorBalance.add(WEI));
        });
        it('Try close an auction without be the auction contract', async function () {
            await tryCatchRevert(
                () => collateral.auctionClosed(
                    bytes320x,
                    0,
                    0,
                    []
                ),
                'collateral: caller should be the auctioner'
            );
        });
        it('Try close an inexist auction', async function () {
            await tryCatchRevert(
                () => testCollateralAuctionMock.toAuctionClosed(
                    bytes320x,
                    0,
                    0,
                    []
                ),
                'collateral: entry does not exists'
            );
        });
    });
    describe('Function requestCosign', function () {
        it('Try lend a debt with low collateral ratio', async function () {
            const loanId = await createDefaultLoan();
            const entryAmount = bn(1);

            await auxToken.setBalance(creator, entryAmount, { from: owner });
            await auxToken.approve(collateral.address, entryAmount, { from: creator });

            const Created = await toEvents(
                collateral.create(
                    creator,          // owner
                    loanId,           // debtId
                    oracle.address,   // entry oracle
                    entryAmount,      // amount
                    ratio(150),       // liquidationRatio
                    ratio(200),       // balanceRatio
                    { from: creator } // sender
                ),
                'Created'
            );
            const entryId = Created._entryId;

            const loanAmount = (await loanManager.requests(loanId)).amount;
            await rcn.setBalance(creator, loanAmount);
            await rcn.approve(loanManager.address, loanAmount, { from: creator });

            await tryCatchRevert(
                () => loanManager.lend(
                    loanId,
                    [],
                    collateral.address,
                    0,
                    toBytes32(entryId),
                    [],
                    { from: creator }
                ),
                'collateral: entry not collateralized'
            );
        });
        it('Try request cosign with wrong sender', async function () {
            await tryCatchRevert(
                () => collateral.requestCosign(
                    address0x,
                    2,
                    [],
                    []
                ),
                'collateral: only the loanManager can request cosign'
            );
        });
    });
    describe('Function claim', function () {
        it('Try claim the entry 0', async function () {
            await tryCatchRevert(
                () => collateral.claim(
                    address0x,
                    0,
                    []
                ),
                'collateral: collateral not found for debtId'
            );
        });
        it('Try claim an entry in auction', async function () {
            const ids = await lendDefaultCollateral();

            await increaseTime(60 * 61);
            await collateral.claim(address0x, ids.loanId, []);

            await tryCatchRevert(
                () => collateral.claim(
                    address0x,
                    ids.loanId,
                    []
                ),
                'collateral: auction already exists'
            );
        });
    });
    describe('Function _claimExpired', function () {
        it('Should claim an expired debt', async function () {
            const ids = await lendDefaultCollateral();

            await increaseTime(60 * 61);

            const obligation = (await model.getObligation(ids.loanId, await model.getDueTime(ids.loanId)))[0];

            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevAuctionBalance = await auxToken.balanceOf(testCollateralAuctionMock.address);
            const prevEntryAmount = (await collateral.entries(ids.entryId)).amount;

            const ClaimedExpired = await toEvents(
                collateral.claim(
                    address0x,
                    ids.loanId,
                    []
                ),
                'ClaimedExpired'
            );
            const auctionId = await collateral.entryToAuction(ids.entryId);

            // Test event
            expect(ClaimedExpired._entryId).to.eq.BN(ids.entryId);
            expect(ClaimedExpired._auctionId).to.eq.BN(auctionId);
            const obligationPlus5Porcent = obligation.mul(bn(105)).div(bn(100));
            expect(ClaimedExpired._obligation).to.eq.BN(obligationPlus5Porcent);
            expect(ClaimedExpired._obligationTokens).to.eq.BN(obligationPlus5Porcent);

            const entry = await collateral.entries(ids.entryId);
            expect(entry.amount).to.eq.BN(0);

            expect(await collateral.entryToAuction(ids.entryId)).to.eq.BN(auctionId);
            expect(await collateral.auctionToEntry(auctionId)).to.eq.BN(ids.entryId);

            expect(await auxToken.allowance(collateral.address, testCollateralAuctionMock.address)).to.eq.BN(0);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.sub(prevEntryAmount));
            expect(await auxToken.balanceOf(testCollateralAuctionMock.address)).to.eq.BN(prevAuctionBalance.add(prevEntryAmount));
        });
        it('Should claim an expired debt with interest', async function () {
            const ids = await lendDefaultCollateral();

            await increaseTime(60 * 61 * 2);

            const now = await getBlockTime();
            const obligation = (await model.getObligation(ids.loanId, now))[0];

            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevAuctionBalance = await auxToken.balanceOf(testCollateralAuctionMock.address);
            const prevEntryAmount = (await collateral.entries(ids.entryId)).amount;

            const ClaimedExpired = await toEvents(
                collateral.claim(
                    address0x,
                    ids.loanId,
                    []
                ),
                'ClaimedExpired'
            );
            const auctionId = await collateral.entryToAuction(ids.entryId);

            // Test event
            expect(ClaimedExpired._entryId).to.eq.BN(ids.entryId);
            expect(ClaimedExpired._auctionId).to.eq.BN(auctionId);
            const obligationPlus5Porcent = obligation.mul(bn(105)).div(bn(100));
            expect(ClaimedExpired._obligation).to.eq.BN(obligationPlus5Porcent);
            expect(ClaimedExpired._obligationTokens).to.eq.BN(obligationPlus5Porcent);

            const entry = await collateral.entries(ids.entryId);
            expect(entry.amount).to.eq.BN(0);

            expect(await collateral.entryToAuction(ids.entryId)).to.eq.BN(auctionId);
            expect(await collateral.auctionToEntry(auctionId)).to.eq.BN(ids.entryId);

            expect(await auxToken.allowance(collateral.address, testCollateralAuctionMock.address)).to.eq.BN(0);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.sub(prevEntryAmount));
            expect(await auxToken.balanceOf(testCollateralAuctionMock.address)).to.eq.BN(prevAuctionBalance.add(prevEntryAmount));
        });
    });
    describe('Function _claimLiquidation', function () {
        it('Should liquidation an entry', async function () {
            const ids = await lendDefaultCollateral();

            await model.addDebt(ids.loanId, WEI.mul(bn(9)), { from: owner });
            const depositAmount = WEI.mul(bn(12));
            await auxToken.setBalance(creator, depositAmount, { from: owner });
            await auxToken.approve(collateral.address, depositAmount, { from: creator });
            await collateral.deposit(ids.entryId, depositAmount, { from: creator });

            const closingObligation = await loanManager.getClosingObligation(ids.loanId);
            const required = WEI.mul(bn(6));

            // Entry amount = 14 WEI
            // Debt  amount = 10 WEI
            // Coll ratio = 14 / 10 = 1.4 %

            // Post entry amount = 8 WEI
            // Post debt  amount = 4 WEI
            // Post coll ratio = 8 / 4 =  2%

            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevAuctionBalance = await auxToken.balanceOf(testCollateralAuctionMock.address);
            const prevEntryAmount = (await collateral.entries(ids.entryId)).amount;

            const ClaimedLiquidation = await toEvents(
                collateral.claim(
                    address0x,
                    ids.loanId,
                    []
                ),
                'ClaimedLiquidation'
            );
            const auctionId = await collateral.entryToAuction(ids.entryId);

            // Test event
            expect(ClaimedLiquidation._entryId).to.eq.BN(ids.entryId);
            expect(ClaimedLiquidation._auctionId).to.eq.BN(auctionId);
            expect(ClaimedLiquidation._debt).to.eq.BN(closingObligation);
            expect(ClaimedLiquidation._required).to.eq.BN(required);
            expect(ClaimedLiquidation._marketValue).to.eq.BN(required);

            const entry = await collateral.entries(ids.entryId);
            expect(entry.amount).to.eq.BN(0);

            expect(await collateral.entryToAuction(ids.entryId)).to.eq.BN(auctionId);
            expect(await collateral.auctionToEntry(auctionId)).to.eq.BN(ids.entryId);

            expect(await auxToken.allowance(collateral.address, testCollateralAuctionMock.address)).to.eq.BN(0);

            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.sub(prevEntryAmount));
            expect(await auxToken.balanceOf(testCollateralAuctionMock.address)).to.eq.BN(prevAuctionBalance.add(prevEntryAmount));
        });
    });
});
