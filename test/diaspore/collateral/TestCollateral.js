const Collateral = artifacts.require('Collateral');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');

const TestModel = artifacts.require('TestModel');
const TestToken = artifacts.require('TestToken');
const TestRateOracle = artifacts.require('TestRateOracle');
const TestCollateralAuction = artifacts.require('TestCollateralAuction');

const {
    expect,
    bn,
    random32bn,
    address0x,
    getBlockTime,
    toEvents,
    tryCatchRevert,
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
    let testCollateralAuction;

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
        const loanData = await model.encodeData(loanAmount, duration);

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
        const entryAmount = WEI;

        await auxToken.setBalance(creator, entryAmount, { from: owner });
        await auxToken.approve(collateral.address, entryAmount, { from: creator });

        const Created = await toEvents(
            collateral.create(
                loanId,           // debtId
                oracle.address,   // entry oracle
                entryAmount,      // amount
                ratio(150),       // liquidationRatio
                ratio(200),       // balanceRatio
                { from: creator } // sender
            ),
            'Created'
        );

        return Created._entryId;
    }

    before('Create contracts', async function () {
        rcn = await TestToken.new({ from: owner });
        auxToken = await TestToken.new({ from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        await oracle.setToken(auxToken.address, { from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        testCollateralAuction = await TestCollateralAuction.new(rcn.address, { from: owner });
        collateral = await Collateral.new(loanManager.address, testCollateralAuction.address, { from: owner });
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
        it('Try emergency redeem an entry without being the owner', async function () {
            await tryCatchRevert(
                () => collateral.emergencyRedeem(
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
            const collateral = await Collateral.new(loanManager.address, testCollateralAuction.address, { from: owner });

            assert.equal(await collateral.loanManager(), loanManager.address);
            assert.equal(await collateral.loanManagerToken(), await loanManager.token());
            assert.equal(await collateral.auction(), testCollateralAuction.address);
            expect(await collateral.getEntriesLength()).to.eq.BN(bn(1));
        });
        it('Creation should fail if loan manager is the address 0', async function () {
            await tryCatchRevert(
                () => Collateral.new(
                    address0x,
                    testCollateralAuction.address
                ), 'Error loading loan manager'
            );
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
        it('Try create a new collateral for a closed loan', async function () {
            const loanId = await createDefaultLoan();
            await rcn.setBalance(owner, WEI.mul(bn(100)), { from: owner });
            await rcn.approve(loanManager.address, WEI.mul(bn(100)), { from: owner });
            await loanManager.lend(loanId, [], address0x, 0, [], [], { from: owner });

            await tryCatchRevert(
                () => collateral.create(
                    loanId,
                    address0x,
                    0,
                    ratio(150),
                    ratio(200),
                    { from: creator }
                ),
                'Debt request should be open'
            );
        });
        it('Try create a new collateral without approval of the token collateral', async function () {
            const loanId = await createDefaultLoan();

            await rcn.setBalance(creator, 1, { from: owner });
            await rcn.approve(collateral.address, 0, { from: creator });

            await tryCatchRevert(
                () => collateral.create(
                    loanId,
                    address0x,
                    1,
                    ratio(150),
                    ratio(200),
                    { from: creator }
                ),
                'Error pulling tokens'
            );
        });
    });
    describe('Function deposit', function () {
        it('Should deposit an amount in a collateral', async function () {
            const collId = await createDefaultCollateral();

            const prevEntry = await collateral.entries(collId);

            const depositAmount = bn(10000);
            await auxToken.setBalance(creator, depositAmount, { from: owner });
            await auxToken.approve(collateral.address, depositAmount, { from: creator });

            const prevCollBalance = await auxToken.balanceOf(collateral.address);
            const prevCreatorBalance = await auxToken.balanceOf(creator);

            const Deposited = await toEvents(
                collateral.deposit(
                    collId,
                    depositAmount,
                    { from: creator }
                ),
                'Deposited'
            );

            // Test event
            expect(Deposited._entryId).to.eq.BN(collId);
            expect(Deposited._amount).to.eq.BN(depositAmount);
            // Test collateral entry
            const entry = await collateral.entries(collId);
            // Should remain the same
            expect(entry.liquidationRatio).to.eq.BN(prevEntry.liquidationRatio);
            expect(entry.balanceRatio).to.eq.BN(prevEntry.balanceRatio);
            expect(entry.burnFee).to.eq.BN(prevEntry.burnFee);
            expect(entry.rewardFee).to.eq.BN(prevEntry.rewardFee);
            expect(entry.token).to.equal(prevEntry.token);
            expect(entry.debtId).to.equal(prevEntry.debtId);
            // Should increase by amount
            expect(entry.amount).to.eq.BN(prevEntry.amount.add(depositAmount));
            // Balance of collateral
            expect(await auxToken.balanceOf(collateral.address)).to.eq.BN(prevCollBalance.add(depositAmount));
            expect(await auxToken.balanceOf(creator)).to.eq.BN(prevCreatorBalance.sub(depositAmount));
        });
        it('Try deposit collateral in a inAuction entry', async function () {
            const collId = await createDefaultCollateral();

            // TODO lent and claim to set inAuction the entry

            await auxToken.setBalance(creator, 1, { from: owner });
            await auxToken.approve(collateral.address, 1, { from: creator });

            await tryCatchRevert(
                async () => collateral.deposit(
                    (await collateral.entries(collId)).debtId,
                    1,
                    { from: creator }
                ),
                'collateral: can deposit during auction'
            );
        });
    });
});
