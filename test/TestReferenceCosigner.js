const ReferenceCosigner = artifacts.require('./examples/ReferenceCosigner.sol');

const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const LoanManager = artifacts.require('./diaspore/LoanManager.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const TestToken = artifacts.require('./utils/test/TestToken.sol');

const TestRateOracle = artifacts.require('./utils/test/TestRateOracle.sol');

const Helper = require('./Helper.js');
const Web3Utils = require('web3-utils');

const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-bignumber')(BigNumber))
    .should();

contract('Test ReferenceCosigner Diaspore', function (accounts) {
    const owner = accounts[0];
    let rcn;
    let debtEngine;
    let loanManager;
    let model;
    let cosigner;
    let oracle;

    before('Create contracts', async function () {
        rcn = await TestToken.new({ from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        cosigner = await ReferenceCosigner.new(rcn.address, { from: owner });
        oracle = await TestRateOracle.new({ from: owner });
    });

    describe('function url and setUrl', async () => {
        it('Should set url', async () => {
            const url = 'https://rcn.cosigner/';

            assert.equal(await cosigner.url(), '');

            await cosigner.setUrl(url);

            assert.equal(await cosigner.url(), url);
        });
    });

    describe('function cost', async () => {
        it('', async () => {

        });
    });

    describe('function requestCosign', async () => {
        it('', async () => {

        });
    });

    describe('function isDefaulted', async () => {
        it('', async () => {

        });
    });

    describe('function claim', async () => {
        it('', async () => {

        });
    });

    describe('function withdrawFromLoan', async () => {
        it('', async () => {

        });
    });

    describe('function withdrawPartialFromLoan', async () => {
        it('', async () => {

        });
    });

    describe('function transferLoan', async () => {
        it('', async () => {

        });
    });

    describe('function withdrawal', async () => {
        it('', async () => {

        });
    });
});
