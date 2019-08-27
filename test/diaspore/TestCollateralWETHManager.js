const CollateralWETHManager = artifacts.require('CollateralWETHManager');

const WETH9 = artifacts.require('WETH9');
const Collateral = artifacts.require('Collateral');
const TestModel = artifacts.require('TestModel');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestConverter = artifacts.require('TestConverter');
const TestRateOracle = artifacts.require('TestRateOracle');

const Helper = require('../Helper.js');

function bn (number) {
    return web3.utils.toBN(number);
}

const WEI = bn(10).pow(bn(18));

contract('Test Collateral cosigner Diaspore', function (accounts) {
    const owner = accounts[1];
    const creator = accounts[2];
    const borrower = accounts[3];

    let rcn;
    let loanManager;
    let debtEngine;
    let model;
    let collateral;
    let converter;
    let oracle;
    let weth9;
    let collWETHManager;

    async function buildBasicLoan () {
        const entry = {};
        // Set oracle
        await oracle.setEquivalent(WEI);
        // Set converter
        await converter.setRate(rcn.address, weth9.address, WEI);
        await converter.setRate(weth9.address, rcn.address, WEI);
        // Loan parametres
        const salt = bn(web3.utils.randomHex(32));
        const now = bn(await Helper.getBlockTime());
        const expiration = now.add(bn(100000));
        const duration = now.add(bn(100000));
        entry.loanAmount = bn(200000000);
        const loanData = await model.encodeData(entry.loanAmount, duration);
        // Entry
        entry.createFrom = creator;
        entry.burnFee = bn(500);
        entry.rewardFee = bn(1000);
        entry.liquidationRatio = bn(15000);
        entry.balanceRatio = bn(20000);
        entry.entryAmount = entry.loanAmount.mul(entry.balanceRatio);

        entry.loanId = await getId(loanManager.requestLoan(
            loanData,          // Amount
            model.address,     // Model
            Helper.address0x,  // Oracle
            borrower,          // Borrower
            salt,              // salt
            expiration,        // Expiration
            loanData,          // Loan data
            { from: borrower } // Creator
        ));

        entry.id = await collateral.getEntriesLength();

        return entry;
    }

    async function getId (promise) {
        const receipt = await promise;
        const event = receipt.logs.find(l => l.event === 'Requested');
        assert.ok(event);
        return event.args._id;
    }

    before('Create contracts', async function () {
        converter = await TestConverter.new({ from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        rcn = await TestToken.new({ from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        collateral = await Collateral.new(loanManager.address, { from: owner });
        await collateral.setConverter(converter.address, { from: owner });

        weth9 = await WETH9.new({ from: owner });
        collWETHManager = await CollateralWETHManager.new(weth9.address, collateral.address, { from: owner });
    });

    describe('Function setWeth', async function () {
        it('Set a new weth contract', async function () {
            const SetWeth = await Helper.toEvents(
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
        it('Try set address(0)', async function () {
            await Helper.tryCatchRevert(
                () => collWETHManager.setWeth(
                    Helper.address0x,
                    { from: owner }
                ),
                'Error loading WETH'
            );
        });
    });
    describe('Function setCollateral', async function () {
        it('Set a new collateral contract', async function () {
            const SetCollateral = await Helper.toEvents(
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
        it('Try set address(0)', async function () {
            await Helper.tryCatchRevert(
                () => collWETHManager.setCollateral(
                    Helper.address0x,
                    { from: owner }
                ),
                'Error loading Collateral'
            );
        });
    });
    describe('Functions onlyOwner', async function () {
        it('Try set a new WETH without being the owner', async function () {
            await Helper.tryCatchRevert(
                () => collWETHManager.setWeth(
                    Helper.address0x,
                    { from: borrower }
                ),
                'The owner should be the sender'
            );
        });
        it('Try set a new Collateral without be the owner', async function () {
            await Helper.tryCatchRevert(
                () => collWETHManager.setCollateral(
                    Helper.address0x,
                    { from: borrower }
                ),
                'The owner should be the sender'
            );
        });
    });
    describe('Functions create', async function () {
        it('Create a new collateral with WETH', async function () {
            const entry = await buildBasicLoan();
            console.log(entry);

            await collWETHManager.create(
                entry.loanId,           // debtId
                oracle.address,         // entry oracle
                entry.liquidationRatio, // liquidationRatio
                entry.balanceRatio,     // balanceRatio
                entry.burnFee,          // burnFee
                entry.rewardFee,        // rewardFee
                {
                    from: entry.createFrom,
                    value: entry.entryAmount,
                }
            );
        });
    });
});
