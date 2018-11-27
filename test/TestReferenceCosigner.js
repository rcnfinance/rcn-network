const ReferenceCosigner = artifacts.require('./examples/ReferenceCosigner.sol');

const DebtEngine = artifacts.require('./diaspore/DebtEngine.sol');
const LoanManager = artifacts.require('./diaspore/LoanManager.sol');
const TestModel = artifacts.require('./diaspore/utils/test/TestModel.sol');
const TestToken = artifacts.require('./utils/test/TestToken.sol');
const TestReferenceCosigner = artifacts.require('./utils/test/TestReferenceCosigner.sol');
const TestLoanManagerForReferenceCosigner = artifacts.require('./utils/test/TestLoanManagerForReferenceCosigner.sol');

const TestRateOracle = artifacts.require('./utils/test/TestRateOracle.sol');

const Helper = require('./Helper.js');
const Web3Utils = require('web3-utils');
const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-bignumber')(BigNumber))
    .should();

function bn (number) {
    if (typeof number != 'string') {
        number = number.toString();
    }
    return new BigNumber(number);
}

function maxUint (base) {
    return bn('2').pow(bn(base)).sub(bn('1'));
}

contract('Test ReferenceCosigner Diaspore', function (accounts) {
    const owner = accounts[9];

    let rcn;
    let debtEngine;
    let loanManager;
    let model;
    let cosigner;
    let testCosigner;
    let testLoanManager;
    let oracle;
    let cosignerEvents;

    function getAllEvents (contract) {
        function toEvent (crudeEvent) {
            return {
                name: crudeEvent.name,
                inputs: crudeEvent.inputs,
                topic: Web3Utils.soliditySha3(crudeEvent.name + '(' + crudeEvent.inputs.map(x => x.type) + ')'),
            };
        }

        const crudeEvents = contract.abi.filter(x => x.type === 'event');
        return crudeEvents.map(x => toEvent(x));
    }

    async function toDataRequestCosign (cosignerContract, loanManagerContract, id, cost, coverage, requiredArrears, expiration, signer) {
        const hashDataSignature = await cosignerContract.hashDataSignature(
            loanManagerContract.address,
            id,
            cost,
            coverage,
            requiredArrears,
            expiration
        );

        const signature = await web3.eth.sign(signer, hashDataSignature).slice(2);
        const r = signature.slice(0, 64);
        const s = signature.slice(64, 128);
        const v = Web3Utils.toHex(web3.toDecimal(signature.slice(128, 130)) + 27).slice(2);

        return (await cosignerContract.encodeData(cost, coverage, requiredArrears, expiration)) + v + r + s;
    };

    before('Create contracts', async function () {
        rcn = await TestToken.new({ from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        testLoanManager = await TestLoanManagerForReferenceCosigner.new({ from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        oracle = await TestRateOracle.new({ from: owner });
        testCosigner = await TestReferenceCosigner.new(rcn.address, { from: owner });
        cosigner = await ReferenceCosigner.new(rcn.address, { from: owner });
        cosignerEvents = getAllEvents(cosigner);

        assert.equal(await cosigner.rcn(), rcn.address);
    });

    beforeEach('Clean', async function () {
        for (let i = 0; i < accounts.length; i++) {
            await cosigner.removeDelegate(accounts[i], { from: owner });
            await testCosigner.removeDelegate(accounts[i], { from: owner });
            await rcn.setBalance(accounts[i], new BigNumber('0'));
            await rcn.approve(loanManager.address, new BigNumber('0'), { from: accounts[i] });
            await rcn.approve(testLoanManager.address, new BigNumber('0'), { from: accounts[i] });
            await rcn.approve(debtEngine.address, new BigNumber('0'), { from: accounts[i] });
            await rcn.approve(cosigner.address, new BigNumber('0'), { from: accounts[i] });
        }
        await rcn.setBalance(cosigner.address, new BigNumber('0'));
        await rcn.setBalance(loanManager.address, new BigNumber('0'));
        await rcn.setBalance(debtEngine.address, new BigNumber('0'));

        (await rcn.totalSupply()).should.be.bignumber.equal(new BigNumber('0'));
    });

    describe('Helper contract', async () => {
        const signer = accounts[7];

        it('Should encode and decode data and signature', async () => {
            const cost = bn('1000');
            const coverage = bn('6000');
            const requiredArrears = bn('666');
            const expiration = bn(await Helper.getBlockTime());
            const id = bn('51651');

            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                cost,
                coverage,
                requiredArrears,
                expiration,
                signer
            );

            const decodedData = await testCosigner.decodeCosignerData(data);
            (decodedData[0]).should.be.bignumber.equal(cost);
            (decodedData[1]).should.be.bignumber.equal(coverage);
            (decodedData[2]).should.be.bignumber.equal(requiredArrears);
            (decodedData[3]).should.be.bignumber.equal(expiration);

            const msg = await cosigner.hashDataSignature(loanManager.address, id, cost, coverage, requiredArrears, expiration);
            const signature = await web3.eth.sign(signer, msg).slice(2);
            const r = signature.slice(0, 64);
            const s = signature.slice(64, 128);
            const v = web3.toDecimal(signature.slice(128, 130)) + 27;

            assert.equal(data.slice(-130, -128), Web3Utils.toHex(v).slice(-2));
            assert.equal(data.slice(-128, -64), r);
            assert.equal(data.slice(-64), s);
        });

        it('Try decode a cosign data with invalid length', async () => {
            const cost = bn('1000');
            const coverage = bn('6000');
            const requiredArrears = bn('5652');
            const expiration = bn(await Helper.getBlockTime());
            const id = bn('51651');

            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                cost,
                coverage,
                requiredArrears,
                expiration,
                signer
            );

            await Helper.tryCatchRevert(
                () => testCosigner.decodeCosignerData(
                    data + '00'
                ),
                'Invalid data length'
            );

            await Helper.tryCatchRevert(
                () => testCosigner.decodeCosignerData(
                    data.slice(0, 4)
                ),
                'Invalid data length'
            );
        });

        it('Should encode data', async () => {
            const maxData = await cosigner.encodeData(
                maxUint('128'),
                maxUint('16'),
                maxUint('64'),
                maxUint('64')
            );

            assert.equal(maxData.slice(2, 34), 'ffffffffffffffffffffffffffffffff');
            assert.equal(maxData.slice(34, 38), 'ffff');
            assert.equal(maxData.slice(38, 54), 'ffffffffffffffff');
            assert.equal(maxData.slice(54, 70), 'ffffffffffffffff');

            const cost = bn('265987451657894324156789798132164544191');
            const coverage = bn('59842');
            const requiredArrears = bn('226547874984564984');
            const expiration = bn('12559879816516548948');

            const data = await cosigner.encodeData(
                cost,
                coverage,
                requiredArrears,
                expiration
            );

            assert.equal(data.slice(2, 34), 'c81b51de46c3dd16602ebe13a15f46bf');
            assert.equal(data.slice(34, 38), 'e9c2');
            assert.equal(data.slice(38, 54), '0324dc178d1318f8');
            assert.equal(data.slice(54, 70), 'ae4da825e5113954');
        });
    });

    describe('function url and setUrl', async () => {
        it('Should set url', async () => {
            const url = 'https://rcn.cosigner/';

            assert.equal(await cosigner.url(), '');

            const SetUrl = await Helper.toEvent(
                cosigner.setUrl(url, { from: owner }),
                'SetUrl'
            );

            assert.equal(SetUrl._url, url);
            assert.equal(await cosigner.url(), url);
        });

        it('Try set url without ownership', async () => {
            await Helper.tryCatchRevert(
                () => cosigner.setUrl('TEST', { from: accounts[8] }),
                'The owner should be the sender'
            );
        });
    });

    describe('function cost', async () => {
        const signer = accounts[7];

        it('Consult cost of data', async () => {
            const cost = bn('1222');
            const coverage = bn('6000');
            const requiredArrears = bn('512');
            const expiration = bn(await Helper.getBlockTime());
            const id = bn('898');

            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                cost,
                coverage,
                requiredArrears,
                expiration,
                signer
            );

            const costData = await cosigner.cost(
                Helper.address0x,
                bn('0'),
                data,
                Helper.address0x
            );

            costData.should.be.bignumber.equal(cost);
        });
    });

    describe('function requestCosign', async () => {
        const signer = accounts[7];

        it('Request a cosign on a loan', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('1031230');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('1'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6000');
            const requiredArrears = ('524');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            const tx = await loanManager.lend(
                id,
                [],
                cosigner.address,
                costCosign,
                data,
                { from: lender }
            );
            const eventTopic = cosignerEvents.find(x => x.name === 'Cosign').topic;
            const event = tx.receipt.logs.find(x => x.topics.some(y => y === eventTopic));

            assert.equal(event.topics[1], id);

            assert.equal(
                event.data.slice(2, 130),
                Helper.toBytes32(loanManager.address).slice(2) +
                Helper.toBytes32(signer).slice(2)
            );
            const liability = await cosigner.liabilities(loanManager.address, id);

            liability[0].should.be.bignumber.equal(coverage);
            liability[1].should.be.bignumber.equal(requiredArrears);
        });

        it('Try requestCosign with different _loanManager parameter and msg.sender', async () => {
            const borrower = accounts[1];
            const amount = bn('66666');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('1'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6000');
            const requiredArrears = bn('500');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await Helper.tryCatchRevert(
                () => cosigner.requestCosign(
                    accounts[5],
                    id,
                    data,
                    '',
                    { from: accounts[4] }
                ),
                'The msg.sender should be the loanManager'
            );
        });

        it('Try cosign two times the same loan', async () => {
            const id = bn('98489498');

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                testLoanManager,
                id,
                bn('0'),
                bn('6000'),
                (bn((await Helper.getBlockTime()).toString())).plus(bn('500')),
                (bn((await Helper.getBlockTime()).toString())).plus(bn('1000')),
                signer
            );

            await testLoanManager.requestCosign(
                id,
                cosigner.address,
                data
            );

            await Helper.tryCatchRevert(
                () => testLoanManager.requestCosign(
                    id,
                    cosigner.address,
                    data
                ),
                'The liability exist'
            );
        });

        it('Try cosign an expired data', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('66451');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('1'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6000');
            const requiredArrears = bn('662');
            const expirationCosign = bn('0');

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            await Helper.tryCatchRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,
                    costCosign,
                    data,
                    { from: lender }
                ),
                'The data of requestCosign its expired'
            );
        });

        it('Try cosign a loan with coverage equal 0', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('66451');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('662'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('0');
            const requiredArrears = bn('666');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            await Helper.tryCatchRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,
                    costCosign,
                    data,
                    { from: lender }
                ),
                'The coverage should not be 0'
            );
        });

        it('Try cosign a loan without being a delegate', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('698452');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('1'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6552');
            const requiredArrears = bn('6632');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const noSigner = accounts[2];
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                noSigner
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            await Helper.tryCatchRevert(
                () => loanManager.lend(
                    id,
                    [],
                    cosigner.address,
                    costCosign,
                    data,
                    { from: lender }
                ),
                'The signer its not a delegate'
            );
        });

        it('Try request cosign and the cosign function return false', async () => {
            const id = bn('382137');

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                testLoanManager,
                id,
                bn('1'),
                bn('5561'),
                (bn((await Helper.getBlockTime()).toString())).plus(bn('500')),
                (bn((await Helper.getBlockTime()).toString())).plus(bn('1000')),
                signer
            );

            await Helper.tryCatchRevert(
                () => testLoanManager.requestCosign(
                    id,
                    cosigner.address,
                    data
                ),
                'Fail loanManager cosign'
            );
        });
    });

    describe('function isDefaulted', async () => {
        const signer = accounts[7];

        it('The liability should not be defaulted', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('98875');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('1'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6562');
            const requiredArrears = bn('500');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            await loanManager.lend(
                id,
                [],
                cosigner.address,
                costCosign,
                data,
                { from: lender }
            );

            assert.equal(await cosigner.isDefaulted(loanManager.address, id), false);
        });

        it('The liability should not be defaulted (liability non-expired and status paid)', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('98875');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('223'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6562');
            const requiredArrears = bn('500');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            await loanManager.lend(
                id,
                [],
                cosigner.address,
                costCosign,
                data,
                { from: lender }
            );

            await rcn.setBalance(borrower, amount.plus(amount));
            await rcn.approve(debtEngine.address, amount.plus(amount), { from: borrower });

            await debtEngine.pay(
                id,
                amount.plus(amount),
                borrower,
                [],
                { from: borrower }
            );
            (await model.getStatus(id)).should.be.bignumber.equal(bn('2'));

            assert.equal(await cosigner.isDefaulted(loanManager.address, id), false);
        });

        it('The liability should not be defaulted (liability expired and status paid)', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('98875');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('1'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6562');
            const requiredArrears = bn('33');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            await loanManager.lend(
                id,
                [],
                cosigner.address,
                costCosign,
                data,
                { from: lender }
            );

            await rcn.setBalance(borrower, amount.plus(amount));
            await rcn.approve(debtEngine.address, amount.plus(amount), { from: borrower });

            await debtEngine.pay(
                id,
                amount.plus(amount),
                borrower,
                [],
                { from: borrower }
            );
            (await model.getStatus(id)).should.be.bignumber.equal(bn('2'));

            await Helper.increaseTime(3000);

            assert.equal(await cosigner.isDefaulted(loanManager.address, id), false);
        });

        it('The liability should be defaulted (liability expired and status non-paid)', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('98875');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('1'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6562');
            const requiredArrears = bn('500');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            await loanManager.lend(
                id,
                [],
                cosigner.address,
                costCosign,
                data,
                { from: lender }
            );

            await Helper.increaseTime(3000);

            assert.equal(await cosigner.isDefaulted(loanManager.address, id), true);
        });
    });

    describe('function _currencyToToken', async () => {
        it('Use RCN Token as currency', async () => {
            const amount = bn('516516');
            const tokens = await testCosigner.currencyToToken(
                Helper.address0x,
                amount,
                []
            );

            tokens.should.be.bignumber.equal(amount);
        });

        it('Use ARS as currency', async () => {
            const ars = bn('5516512');
            const amount = bn('4');
            const equivalent = bn('8');
            const oracleData = await oracle.encodeRate(amount, equivalent);
            const constTokens = ars.mul(amount).div(equivalent);

            const rcnTokens = await testCosigner.currencyToToken(
                oracle.address,
                ars,
                oracleData
            );

            rcnTokens.should.be.bignumber.equal(constTokens);
        });
    });

    describe('function claim', async () => {
        const signer = accounts[7];

        it('Should claim a liability', async () => {
            const borrower = accounts[1];
            const lender = accounts[2];
            const amount = bn('626232');
            const expirationLoan = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            const id = (await Helper.toEvent(
                loanManager.requestLoan(
                    amount,
                    model.address,
                    Helper.address0x,
                    borrower,
                    bn('1'),
                    expirationLoan,
                    await model.encodeData(amount, expirationLoan),
                    { from: borrower }
                ),
                'Requested'
            ))._id;

            const costCosign = bn('1222');
            const coverage = bn('6562');
            const requiredArrears = bn('500');
            const expirationCosign = (bn((await Helper.getBlockTime()).toString())).plus(bn('1000'));

            await cosigner.addDelegate(signer, { from: owner });
            const data = await toDataRequestCosign(
                cosigner,
                loanManager,
                id,
                costCosign,
                coverage,
                requiredArrears,
                expirationCosign,
                signer
            );

            await rcn.setBalance(lender, amount.plus(costCosign));
            await rcn.approve(loanManager.address, amount.plus(costCosign), { from: lender });

            await loanManager.lend(
                id,
                [],
                cosigner.address,
                costCosign,
                data,
                { from: lender }
            );

            await Helper.increaseTime(3000);

            await rcn.setBalance(cosigner.address, amount);
            await debtEngine.approve(cosigner.address, id, { from: lender });

            const prevCosignerBal = await rcn.balanceOf(cosigner.address);
            const prevLenderBal = await rcn.balanceOf(lender);

            const events = await Helper.toEvent(
                cosigner.claim(
                    loanManager.address,
                    id,
                    '',
                    { from: lender }
                ),
                'Claim',
                'Received'
            );
            const calcClaimAmount = coverage.mul(await loanManager.getClosingObligation(id)).dividedToIntegerBy(bn('10000'));

            const Claim = events[0];
            assert.equal(Claim._loanManager, loanManager.address);
            assert.equal(Claim._index, id);
            assert.equal(Claim._sender, lender);
            Claim._claimAmount.should.be.bignumber.equal(calcClaimAmount);
            assert.equal(Claim._oracleData, '0x');

            const Received = events[1];
            assert.equal(Received._operator, cosigner.address);
            assert.equal(Received._from, lender);
            Received._id.should.be.bignumber.equal(id);
            assert.equal(Received._data, '0x');

            const liability = await cosigner.liabilities(loanManager.address, id);
            liability[0].should.be.bignumber.equal(bn('0'));
            liability[1].should.be.bignumber.equal(requiredArrears);

            assert.equal(await debtEngine.ownerOf(id), cosigner.address);
            (await rcn.balanceOf(cosigner.address)).should.be.bignumber.equal(prevCosignerBal.sub(calcClaimAmount));
            (await rcn.balanceOf(lender)).should.be.bignumber.equal(prevLenderBal.plus(calcClaimAmount));
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
