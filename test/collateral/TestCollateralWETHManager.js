const CollateralWETHManager = artifacts.require('CollateralWETHManager');

const WETH9 = artifacts.require('WETH9');
const Collateral = artifacts.require('Collateral');
const TestCollateralAuctionMock = artifacts.require('TestCollateralAuctionMock');
const TestModel = artifacts.require('TestModel');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestRateOracle = artifacts.require('TestRateOracle');

const {
    expect,
    bn,
    address0x,
    getBlockTime,
    toEvents,
    tryCatchRevert,
    random32bn,
} = require('../Helper.js');

async function getETHBalance (address) {
    return bn(await web3.eth.getBalance(address));
}

contract('Test WETH manager for collateral cosigner', function (accounts) {
    const owner = accounts[1];
    const creator = accounts[2];
    const borrower = accounts[3];
    const depositer = accounts[4];
    const burner = accounts[5];

    let loanManager;
    let model;
    let collateral;
    let oracle;
    let weth9;
    let collWETHManager;

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

        const MAX_UINT64 = bn(2).pow(bn(64)).sub(bn(1));
        const loanData = await model.encodeData(loanAmount, duration, 0, MAX_UINT64);

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

        const entryId = await collateral.getEntriesLength();
        await collWETHManager.create(
            loanId,         // debtId
            oracle.address, // entry oracle
            ratio(150),     // liquidationRatio
            ratio(200),     // balanceRatio
            {
                from: creator,
                value: entryAmount,
            }
        );

        return {
            entryId,
            loanId,
        };
    }

    before('Create contracts', async function () {
        weth9 = await WETH9.new({ from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        await oracle.setToken(weth9.address, { from: owner });
        const rcn = await TestToken.new({ from: owner });
        const debtEngine = await DebtEngine.new(rcn.address, burner, 100, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        const testCollateralAuctionMock = await TestCollateralAuctionMock.new(loanManager.address, { from: owner });
        collateral = await Collateral.new(loanManager.address, testCollateralAuctionMock.address, { from: owner });
        await testCollateralAuctionMock.setCollateral(collateral.address);

        collWETHManager = await CollateralWETHManager.new(weth9.address, collateral.address, { from: owner });
    });

    describe('Function setWeth', async function () {
        it('Set a new weth contract', async function () {
            const SetWeth = await toEvents(
                collWETHManager.setWeth(
                    owner,
                    { from: owner }
                ),
                'SetWeth'
            );

            assert.equal(SetWeth._weth, owner);
            assert.equal(await collWETHManager.weth(), owner);

            await collWETHManager.setWeth(weth9.address, { from: owner });
        });
    });
    describe('Function setCollateral', async function () {
        it('Set a new collateral contract', async function () {
            const SetCollateral = await toEvents(
                collWETHManager.setCollateral(
                    owner,
                    { from: owner }
                ),
                'SetCollateral'
            );

            assert.equal(SetCollateral._collateral, owner);
            assert.equal(await collWETHManager.collateral(), owner);

            await collWETHManager.setCollateral(collateral.address, { from: owner });
        });
    });
    describe('Functions onlyOwner', async function () {
        it('Try set a new WETH without being the owner', async function () {
            await tryCatchRevert(
                () => collWETHManager.setWeth(
                    address0x,
                    { from: borrower }
                ),
                'Ownable: caller is not the owner'
            );
        });
        it('Try set a new Collateral without be the owner', async function () {
            await tryCatchRevert(
                () => collWETHManager.setCollateral(
                    address0x,
                    { from: borrower }
                ),
                'Ownable: caller is not the owner'
            );
        });
    });
    describe('Modifier isTheOwner', async function () {
        it('Try withdraw balance without being the owner of the entry', async function () {
            const ids = await createDefaultCollateral();

            await tryCatchRevert(
                () => collWETHManager.withdraw(
                    ids.entryId,
                    address0x,
                    1,
                    [],
                    { from: borrower }
                ),
                'CollateralWETHManager: Sender not authorized'
            );
        });
    });
    describe('Function create', async function () {
        it('Create a new collateral with WETH', async function () {
            const loanId = await createDefaultLoan();
            const entryAmount = WEI.mul(bn('2'));

            const entryId = await collateral.getEntriesLength();
            const prevETHBalWETH = await getETHBalance(weth9.address);
            const prevETHBalCreator = await getETHBalance(creator);

            await collWETHManager.create(
                loanId,         // debtId
                oracle.address, // entry oracle
                ratio(150),     // liquidationRatio
                ratio(200),     // balanceRatio
                {
                    from: creator,
                    value: entryAmount,
                    gasPrice: 0,
                }
            );

            // Check ownership
            assert.equal(await collateral.ownerOf(entryId), creator);
            // Check balance
            expect(await getETHBalance(collWETHManager.address)).to.eq.BN(0);
            expect(await getETHBalance(weth9.address)).to.eq.BN(prevETHBalWETH.add(entryAmount));
            expect(await getETHBalance(creator)).to.eq.BN(prevETHBalCreator.sub(entryAmount));
        });
    });
    describe('Function deposit', async function () {
        it('Deposit WETH in an entry', async function () {
            const ids = await createDefaultCollateral();
            const amount = bn(1000000);
            const prevETHBalWETH = await getETHBalance(weth9.address);
            const prevETHBalDepositer = await getETHBalance(depositer);

            await collWETHManager.deposit(
                ids.entryId,
                {
                    from: depositer,
                    value: amount,
                    gasPrice: 0,
                }
            );

            // Check balance
            expect(await getETHBalance(collWETHManager.address)).to.eq.BN(0);
            expect(await getETHBalance(weth9.address)).to.eq.BN(prevETHBalWETH.add(amount));
            expect(await getETHBalance(depositer)).to.eq.BN(prevETHBalDepositer.sub(amount));
        });
    });
    describe('Function withdraw', async function () {
        it('Withdraw WETH of an entry', async function () {
            const ids = await createDefaultCollateral();
            const amount = bn(1000000);

            await collateral.approve(collWETHManager.address, ids.entryId, { from: creator });

            const prevETHBalWETH = await getETHBalance(weth9.address);
            const prevETHBalBorrower = await getETHBalance(borrower);
            const prevETHBalCreator = await getETHBalance(creator);

            await collWETHManager.withdraw(
                ids.entryId,
                borrower,
                amount,
                [],
                { from: creator, gasPrice: 0 }
            );

            // Check balance
            expect(await getETHBalance(collWETHManager.address)).to.eq.BN(0);
            expect(await getETHBalance(weth9.address)).to.eq.BN(prevETHBalWETH.sub(amount));
            expect(await getETHBalance(borrower)).to.eq.BN(prevETHBalBorrower.add(amount));
            expect(await getETHBalance(creator)).to.eq.BN(prevETHBalCreator);
        });
        it('Try Withdraw WETH of an entry without authorization', async function () {
            const ids = await createDefaultCollateral();

            await tryCatchRevert(
                () => collWETHManager.withdraw(
                    ids.entryId,
                    address0x,
                    1,
                    [],
                    { from: creator }
                ),
                'collateral: Sender not authorized'
            );
        });
    });
});
