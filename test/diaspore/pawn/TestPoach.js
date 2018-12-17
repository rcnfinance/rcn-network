const TestToken = artifacts.require('./diaspore/utils/test/TestModel.sol');
const Poach = artifacts.require('./diaspore/cosigner/pawn/Poach.sol');

const Helper = require('./../../Helper.js');
const BigNumber = web3.BigNumber;
const precision = new BigNumber(10 ** 18);

const I_TOKEN = 0;
const I_AMOUNT = 1;
const I_ALIVE = 2;

let customPairId;
let customPair;

const ethAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ethAmount = new BigNumber(50).times(precision);
let ethPairId;
let ethPair;

// contracts
let rcn;
let tico;
let poach;

// accounts
let user;
let hacker;

contract('Poach', function (accounts) {
    beforeEach('Create Poach and tokens', async function () {
        // set account addresses
        user = accounts[1];
        hacker = accounts[2];
        // deploy contracts
        rcn = await TestToken.new();
        tico = await TestToken.new();
        poach = await Poach.new();
        // create tokens
        await rcn.createTokens(user, web3.toWei('500'));
        await tico.createTokens(user, web3.toWei('300'));

        await rcn.createTokens(hacker, web3.toWei('500000'));
        await tico.createTokens(hacker, web3.toWei('500000'));
        // create custom pair
        await rcn.approve(poach.address, web3.toWei('100'), { from: user });
        let poachReceipt = await poach.create(rcn.address, web3.toWei('100'), { from: user });
        customPairId = poachReceipt.logs[1].args.pairId;
        poachReceipt = await poach.create(ethAddress, ethAmount.toString(), { from: user, value: ethAmount.toString() });
        ethPairId = poachReceipt.logs[0].args.pairId;
    });

    it('Test: create function', async () => {
        try { // try a create a pair without approve
            await poach.create(tico.address, web3.toWei('100'), { from: user });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        try { // try a create a pair with other account
            await rcn.approve(poach.address, web3.toWei('100'), { from: user });
            await poach.create(rcn.address, web3.toWei('100'), { from: hacker });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        customPair = await poach.getPair(customPairId);
        assert.equal(customPair[I_TOKEN], rcn.address);
        assert.equal(customPair[I_AMOUNT].toNumber(), web3.toWei('100'));
        assert.equal(customPair[I_ALIVE], true);

        // ETH cases
        try { // try a create a eth pair with amount != value
            await poach.create(ethAddress, ethAmount.toString(), { from: user, value: 1 });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        try { // try a create a eth pair with other ethAddress
            await poach.create(rcn.address, ethAmount.toString(), { from: user, value: ethAmount.toString() });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        assert.equal(web3.eth.getBalance(poach.address), ethAmount.toString());
        ethPair = await poach.getPair(ethPairId);
        assert.equal(ethPair[I_TOKEN], ethAddress);
        assert.equal(ethPair[I_AMOUNT].toNumber(), ethAmount.toString());
        assert.equal(ethPair[I_ALIVE], true);

        const poachReceipt = await poach.create(ethAddress, 1, { from: user, value: 1 });
        ethPairId = poachReceipt.logs[0].args.pairId;

        ethPair = await poach.getPair(ethPairId);
        assert.equal(ethPair[I_TOKEN], ethAddress);
        assert.equal(ethPair[I_AMOUNT].toNumber(), 1);
        assert.equal(ethPair[I_ALIVE], true);
    });

    it('Test: deposit function', async () => {
        try { // try deposit without approve
            await poach.deposit(customPairId, web3.toWei('50'), { from: user });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await rcn.approve(poach.address, web3.toWei('50'), { from: user });
        await poach.deposit(customPairId, web3.toWei('50'), { from: user });

        await rcn.approve(poach.address, web3.toWei('50'), { from: hacker });
        await poach.deposit(customPairId, web3.toWei('50'), { from: hacker });

        customPair = await poach.getPair(customPairId);
        assert.equal(customPair[I_TOKEN], rcn.address);
        assert.equal(customPair[I_AMOUNT].toNumber(), web3.toWei('200'));
        assert.equal(customPair[I_ALIVE], true);

        await poach.destroy(customPairId, { from: user });

        try { // try deposit in destroyed pair
            await rcn.approve(poach.address, web3.toWei('50'), { from: user });
            await poach.deposit(customPairId, web3.toWei('50'), { from: user });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        // ETH cases
        try { // try a create a eth pair with amount != value
            await poach.deposit(ethAddress, ethAmount.toString(), { from: user, value: 1 });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        try { // try a create a eth pair with other ethAddress
            await poach.create(rcn.address, ethAmount.toString(), { from: user, value: ethAmount.toString() });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await poach.deposit(ethPairId, 1, { from: user, value: 1 });
        await poach.deposit(ethPairId, 1, { from: hacker, value: 1 });

        ethPair = await poach.getPair(ethPairId);
        assert.equal(ethPair[I_TOKEN], ethAddress);
        assert.equal(ethPair[I_AMOUNT].toNumber(), ethAmount.plus(new BigNumber(1)).plus(new BigNumber(1)));
        assert.equal(ethPair[I_ALIVE], true);

        await poach.destroy(ethPairId, { from: user });

        try { // try deposit in destroyed eth pair
            await poach.deposit(ethPairId, 1, { from: user, value: 1 });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }
    });

    it('Test: destroy function', async () => {
        try { // try destroy a pair with other account
            await poach.destroy(customPairId, { from: hacker });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        let prevBal = await rcn.balanceOf(user);

        customPair = await poach.getPair(customPairId);
        await poach.destroy(customPairId, { from: user });
        const destroyPair = await poach.getPair(customPairId);
        assert.equal(destroyPair[I_TOKEN], rcn.address);
        assert.equal(destroyPair[I_AMOUNT].toNumber(), 0);
        assert.equal(destroyPair[I_ALIVE], false);

        assert.equal(customPair[I_TOKEN], rcn.address);
        assert.equal((await rcn.balanceOf(user)).toNumber(), prevBal.plus(customPair[I_AMOUNT]).toNumber());

        try { // try destroy a destroyed pair
            await rcn.createTokens(poach.address, web3.toWei('500000'));
            await poach.destroy(customPairId, { from: user });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        // ETH cases
        try { // try destroy a pair with other account
            await poach.destroy(ethPairId, { from: hacker });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }
        prevBal = web3.eth.getBalance(user);
        const prevPachBal = web3.eth.getBalance(poach.address);

        await poach.destroy(ethPairId, { from: user });

        ethPair = await poach.getPair(ethPairId);
        assert.equal(web3.eth.getBalance(poach.address).toString(), prevPachBal.sub(ethAmount));
        assert.equal(ethPair[I_TOKEN], ethAddress);
        assert.isAbove(web3.eth.getBalance(user).toNumber(), prevBal.toNumber());// TIP! Check gas price
        assert.equal(ethPair[I_ALIVE], false);

        try { // try destroy a destroyed eth pair
            await poach.destroy(ethPairId, { from: user });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }
    });
});
