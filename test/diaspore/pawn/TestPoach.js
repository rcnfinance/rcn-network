const TestToken = artifacts.require('./utils/test/TestToken.sol');
const Poach = artifacts.require('./diaspore/cosigner/pawn/Poach.sol');

const Helper = require('./../../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn (number) {
    return new BN(number);
}

function inc (number) {
    return number.add(bn('1'));
}

function dec (number) {
    return number.sub(bn('1'));
}

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

contract('Poach', function (accounts) {
    const creator = accounts[1];
    const depositer = accounts[2];
    const beneficiary = accounts[3];

    let poach;
    let token;

    async function getETHBalance (account) {
        return bn(await web3.eth.getBalance(account));
    };

    beforeEach('Create Poach and token', async function () {
        poach = await Poach.new();
        token = await TestToken.new();
    });

    describe('create function', function () {
        it('Should create a ETH poach', async function () {
            const id = await poach.totalSupply();
            const prevETHBal = await getETHBalance(poach.address);

            const Created = await Helper.toEvents(
                poach.create(
                    ETH,
                    '0',
                    { from: creator }
                ),
                'Created'
            );

            expect(Created._pairId).to.eq.BN(id);
            assert.equal(Created._owner, creator);
            assert.equal(Created._erc20, ETH);
            expect(Created._amount).to.eq.BN('0');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('0');

            expect(await getETHBalance(poach.address)).to.eq.BN(prevETHBal);
        });

        it('Should create a ETH poach with balance', async function () {
            const id = await poach.totalSupply();
            const prevETHBal = await getETHBalance(poach.address);

            const Created = await Helper.toEvents(
                poach.create(
                    ETH,
                    '1',
                    { from: creator, value: '1' }
                ),
                'Created'
            );

            expect(Created._pairId).to.eq.BN(id);
            assert.equal(Created._owner, creator);
            assert.equal(Created._erc20, ETH);
            expect(Created._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('1');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('1');

            expect(await getETHBalance(poach.address)).to.eq.BN(inc(prevETHBal));
        });

        it('Try create a ETH poach with balance and dont send value', async function () {
            await Helper.tryCatchRevert(
                () => poach.create(
                    ETH,
                    '1',
                    { from: creator, value: '0' }
                ),
                ''
            );
        });

        it('Try create a ETH poach without balance and send value', async function () {
            await Helper.tryCatchRevert(
                () => poach.create(
                    ETH,
                    '0',
                    { from: creator, value: '1' }
                ),
                'The msg.value should be 0'
            );
        });

        it('Try create a ETH poach with wrong currency address', async function () {
            await Helper.tryCatchRevert(
                () => poach.create(
                    token.address,
                    '2',
                    { from: creator, value: '2' }
                ),
                'The amount should be equal to msg.value and the _token should be ETH'
            );
        });

        it('Try create a ETH poach with different balance and send value', async function () {
            await Helper.tryCatchRevert(
                () => poach.create(
                    ETH,
                    '2',
                    { from: creator, value: '1' }
                ),
                'The amount should be equal to msg.value and the _token should be ETH'
            );
        });

        it('Should create a Token poach', async function () {
            const id = await poach.totalSupply();
            const prevTokenBal = await token.balanceOf(poach.address);

            const Created = await Helper.toEvents(
                poach.create(
                    token.address,
                    '0',
                    { from: creator }
                ),
                'Created'
            );

            expect(Created._pairId).to.eq.BN(id);
            assert.equal(Created._owner, creator);
            assert.equal(Created._erc20, token.address);
            expect(Created._amount).to.eq.BN('0');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], token.address);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, token.address);
            expect(pair.balance).to.eq.BN('0');

            expect(await token.balanceOf(poach.address)).to.eq.BN(prevTokenBal);
        });

        it('Should create a Token poach with balance', async function () {
            const id = await poach.totalSupply();
            await token.setBalance(creator, '1');
            await token.approve(poach.address, '1', { from: creator });

            const prevTokenBal = await token.balanceOf(poach.address);

            const Created = await Helper.toEvents(
                poach.create(
                    token.address,
                    '1',
                    { from: creator }
                ),
                'Created'
            );

            expect(Created._pairId).to.eq.BN(id);
            assert.equal(Created._owner, creator);
            assert.equal(Created._erc20, token.address);
            expect(Created._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], token.address);
            expect(pair[1]).to.eq.BN('1');

            pair = await poach.poaches(id);
            assert.equal(pair.token, token.address);
            expect(pair.balance).to.eq.BN('1');

            expect(await token.balanceOf(poach.address)).to.eq.BN(inc(prevTokenBal));
        });

        it('Try create a Token poach without creator balance', async function () {
            await Helper.tryCatchRevert(
                () => poach.create(
                    token.address,
                    '1',
                    { from: creator }
                ),
                'Error pulling tokens'
            );
        });

        it('Try create a Token with addres 0x0', async function () {
            await Helper.tryCatchRevert(
                () => poach.create(
                    Helper.address0x,
                    '0',
                    { from: creator }
                ),
                'The Token should not be the address 0x0'
            );
        });
    });

    describe('deposit function', function () {
        it('Should deposit amount in a ETH poach', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator });

            const prevETHBal = await getETHBalance(poach.address);

            const Deposit = await Helper.toEvents(
                poach.deposit(
                    id,
                    '1',
                    { from: creator, value: '1' }
                ),
                'Deposit'
            );

            expect(Deposit._pairId).to.eq.BN(id);
            assert.equal(Deposit._sender, creator);
            expect(Deposit._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('1');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('1');

            expect(await getETHBalance(poach.address)).to.eq.BN(inc(prevETHBal));
        });

        it('Should deposit 0 amount in a ETH poach', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator });

            const prevETHBal = await getETHBalance(poach.address);

            const Deposit = await Helper.toEvents(
                poach.deposit(
                    id,
                    '0',
                    { from: creator, value: '0' }
                ),
                'Deposit'
            );

            expect(Deposit._pairId).to.eq.BN(id);
            assert.equal(Deposit._sender, creator);
            expect(Deposit._amount).to.eq.BN('0');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('0');

            expect(await getETHBalance(poach.address)).to.eq.BN(prevETHBal);
        });

        it('Should deposit amount in a Token poach', async function () {
            const id = await poach.totalSupply();
            await poach.create(token.address, '0', { from: creator });
            await token.setBalance(creator, '1');
            await token.approve(poach.address, '1', { from: creator });

            const prevTokenBal = await token.balanceOf(poach.address);

            const Deposit = await Helper.toEvents(
                poach.deposit(
                    id,
                    '1',
                    { from: creator }
                ),
                'Deposit'
            );

            expect(Deposit._pairId).to.eq.BN(id);
            assert.equal(Deposit._sender, creator);
            expect(Deposit._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], token.address);
            expect(pair[1]).to.eq.BN('1');

            pair = await poach.poaches(id);
            assert.equal(pair.token, token.address);
            expect(pair.balance).to.eq.BN('1');

            expect(await token.balanceOf(poach.address)).to.eq.BN(inc(prevTokenBal));
        });

        it('Should deposit 0 amount in a token poach', async function () {
            const id = await poach.totalSupply();
            await poach.create(token.address, '0', { from: creator });

            const prevTokenBal = await token.balanceOf(poach.address);

            const Deposit = await Helper.toEvents(
                poach.deposit(
                    id,
                    '0',
                    { from: creator }
                ),
                'Deposit'
            );

            expect(Deposit._pairId).to.eq.BN(id);
            assert.equal(Deposit._sender, creator);
            expect(Deposit._amount).to.eq.BN('0');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], token.address);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, token.address);
            expect(pair.balance).to.eq.BN('0');

            expect(await token.balanceOf(poach.address)).to.eq.BN(prevTokenBal);
        });

        it('Should a third member deposit amount in a ETH poach', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator });
            await poach.setApprovalForAll(depositer, true, { from: creator });

            const prevETHBal = await getETHBalance(poach.address);

            const Deposit = await Helper.toEvents(
                poach.deposit(
                    id,
                    '1',
                    { from: depositer, value: '1' }
                ),
                'Deposit'
            );

            expect(Deposit._pairId).to.eq.BN(id);
            assert.equal(Deposit._sender, depositer);
            expect(Deposit._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('1');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('1');

            expect(await getETHBalance(poach.address)).to.eq.BN(inc(prevETHBal));

            await poach.setApprovalForAll(depositer, false, { from: creator });
        });

        it('Try deposit in a inexists poach', async function () {
            await Helper.tryCatchRevert(
                () => poach.deposit(
                    '999999999999999999999',
                    '0',
                    { from: creator }
                ),
                'msg.sender Not authorized'
            );
        });
    });

    describe('withdraw function', function () {
        it('Should withdraw a ETH poach', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '1', { from: creator, value: '1' });

            const prevETHBal = await getETHBalance(poach.address);
            const prevBeneficiaryBal = await getETHBalance(beneficiary);

            const Withdraw = await Helper.toEvents(
                poach.withdraw(
                    id,
                    beneficiary,
                    { from: creator }
                ),
                'Withdraw'
            );

            expect(Withdraw._pairId).to.eq.BN(id);
            assert.equal(Withdraw._sender, creator);
            assert.equal(Withdraw._to, beneficiary);
            expect(Withdraw._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('0');

            expect(await getETHBalance(poach.address)).to.eq.BN(dec(prevETHBal));
            expect(await getETHBalance(beneficiary)).to.eq.BN(inc(prevBeneficiaryBal));
        });

        it('Should withdraw a ETH poach without amount', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator, value: '0' });

            const prevETHBal = await getETHBalance(poach.address);
            const prevBeneficiaryBal = await getETHBalance(beneficiary);

            const Withdraw = await Helper.toEvents(
                poach.withdraw(
                    id,
                    beneficiary,
                    { from: creator }
                ),
                'Withdraw'
            );

            expect(Withdraw._pairId).to.eq.BN(id);
            assert.equal(Withdraw._sender, creator);
            assert.equal(Withdraw._to, beneficiary);
            expect(Withdraw._amount).to.eq.BN('0');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('0');

            expect(await getETHBalance(poach.address)).to.eq.BN(prevETHBal);
            expect(await getETHBalance(beneficiary)).to.eq.BN(prevBeneficiaryBal);
        });

        it('Should withdraw a token poach with amount', async function () {
            const id = await poach.totalSupply();
            await token.setBalance(creator, '1');
            await token.approve(poach.address, '1', { from: creator });
            await poach.create(token.address, '1', { from: creator });

            const prevTokenBal = await token.balanceOf(poach.address);
            const prevBeneficiaryBal = await token.balanceOf(beneficiary);

            const Withdraw = await Helper.toEvents(
                poach.withdraw(
                    id,
                    beneficiary,
                    { from: creator }
                ),
                'Withdraw'
            );

            expect(Withdraw._pairId).to.eq.BN(id);
            assert.equal(Withdraw._sender, creator);
            assert.equal(Withdraw._to, beneficiary);
            expect(Withdraw._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], token.address);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, token.address);
            expect(pair.balance).to.eq.BN('0');

            expect(await token.balanceOf(poach.address)).to.eq.BN(dec(prevTokenBal));
            expect(await token.balanceOf(beneficiary)).to.eq.BN(inc(prevBeneficiaryBal));
        });

        it('Should withdraw a token poach without amount', async function () {
            const id = await poach.totalSupply();
            await poach.create(token.address, '0', { from: creator });

            const prevTokenBal = await token.balanceOf(poach.address);
            const prevBeneficiaryBal = await token.balanceOf(beneficiary);

            const Withdraw = await Helper.toEvents(
                poach.withdraw(
                    id,
                    beneficiary,
                    { from: creator }
                ),
                'Withdraw'
            );

            expect(Withdraw._pairId).to.eq.BN(id);
            assert.equal(Withdraw._sender, creator);
            assert.equal(Withdraw._to, beneficiary);
            expect(Withdraw._amount).to.eq.BN('0');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], token.address);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, token.address);
            expect(pair.balance).to.eq.BN('0');

            expect(await token.balanceOf(poach.address)).to.eq.BN(prevTokenBal);
            expect(await token.balanceOf(beneficiary)).to.eq.BN(prevBeneficiaryBal);
        });

        it('Try withdraw a poach and send the funds to 0x0 address', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator });

            await Helper.tryCatchRevert(
                () => poach.withdraw(
                    id,
                    Helper.address0x,
                    { from: creator }
                ),
                '_to should not be 0x0'
            );
        });

        it('Try withdraw an inexists poach', async function () {
            await Helper.tryCatchRevert(
                () => poach.withdraw(
                    '999999999999999999999999999999999',
                    beneficiary,
                    { from: creator }
                ),
                'msg.sender Not authorized'
            );
        });

        it('Try withdraw a pair with an unauthorized account', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator });

            await Helper.tryCatchRevert(
                () => poach.withdraw(
                    id,
                    beneficiary,
                    { from: accounts[9] }
                ),
                'msg.sender Not authorized'
            );
        });
    });

    describe('withdrawPartial function', function () {
        it('Should withdrawPartial a ETH poach', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '2', { from: creator, value: '2' });

            const prevETHBal = await getETHBalance(poach.address);
            const prevBeneficiaryBal = await getETHBalance(beneficiary);

            const Withdraw = await Helper.toEvents(
                poach.withdrawPartial(
                    id,
                    beneficiary,
                    '1',
                    { from: creator }
                ),
                'Withdraw'
            );

            expect(Withdraw._pairId).to.eq.BN(id);
            assert.equal(Withdraw._sender, creator);
            assert.equal(Withdraw._to, beneficiary);
            expect(Withdraw._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('1');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('1');

            expect(await getETHBalance(poach.address)).to.eq.BN(dec(prevETHBal));
            expect(await getETHBalance(beneficiary)).to.eq.BN(inc(prevBeneficiaryBal));
        });

        it('Should withdrawPartial a ETH poach without amount', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator, value: '0' });

            const prevETHBal = await getETHBalance(poach.address);
            const prevBeneficiaryBal = await getETHBalance(beneficiary);

            const Withdraw = await Helper.toEvents(
                poach.withdrawPartial(
                    id,
                    beneficiary,
                    '0',
                    { from: creator }
                ),
                'Withdraw'
            );

            expect(Withdraw._pairId).to.eq.BN(id);
            assert.equal(Withdraw._sender, creator);
            assert.equal(Withdraw._to, beneficiary);
            expect(Withdraw._amount).to.eq.BN('0');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], ETH);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, ETH);
            expect(pair.balance).to.eq.BN('0');

            expect(await getETHBalance(poach.address)).to.eq.BN(prevETHBal);
            expect(await getETHBalance(beneficiary)).to.eq.BN(prevBeneficiaryBal);
        });

        it('Should withdrawPartial a token poach with amount', async function () {
            const id = await poach.totalSupply();
            await token.setBalance(creator, '2');
            await token.approve(poach.address, '2', { from: creator });
            await poach.create(token.address, '2', { from: creator });

            const prevTokenBal = await token.balanceOf(poach.address);
            const prevBeneficiaryBal = await token.balanceOf(beneficiary);

            const Withdraw = await Helper.toEvents(
                poach.withdrawPartial(
                    id,
                    beneficiary,
                    '1',
                    { from: creator }
                ),
                'Withdraw'
            );

            expect(Withdraw._pairId).to.eq.BN(id);
            assert.equal(Withdraw._sender, creator);
            assert.equal(Withdraw._to, beneficiary);
            expect(Withdraw._amount).to.eq.BN('1');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], token.address);
            expect(pair[1]).to.eq.BN('1');

            pair = await poach.poaches(id);
            assert.equal(pair.token, token.address);
            expect(pair.balance).to.eq.BN('1');

            expect(await token.balanceOf(poach.address)).to.eq.BN(dec(prevTokenBal));
            expect(await token.balanceOf(beneficiary)).to.eq.BN(inc(prevBeneficiaryBal));
        });

        it('Should withdrawPartial a token poach without amount', async function () {
            const id = await poach.totalSupply();
            await poach.create(token.address, '0', { from: creator });

            const prevTokenBal = await token.balanceOf(poach.address);
            const prevBeneficiaryBal = await token.balanceOf(beneficiary);

            const Withdraw = await Helper.toEvents(
                poach.withdrawPartial(
                    id,
                    beneficiary,
                    '0',
                    { from: creator }
                ),
                'Withdraw'
            );

            expect(Withdraw._pairId).to.eq.BN(id);
            assert.equal(Withdraw._sender, creator);
            assert.equal(Withdraw._to, beneficiary);
            expect(Withdraw._amount).to.eq.BN('0');

            let pair = await poach.getPair(id);
            assert.equal(pair[0], token.address);
            expect(pair[1]).to.eq.BN('0');

            pair = await poach.poaches(id);
            assert.equal(pair.token, token.address);
            expect(pair.balance).to.eq.BN('0');

            expect(await token.balanceOf(poach.address)).to.eq.BN(prevTokenBal);
            expect(await token.balanceOf(beneficiary)).to.eq.BN(prevBeneficiaryBal);
        });

        it('Try withdrawPartial a poach and send the funds to 0x0 address', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator });

            await Helper.tryCatchRevert(
                () => poach.withdrawPartial(
                    id,
                    Helper.address0x,
                    '0',
                    { from: creator }
                ),
                '_to should not be 0x0'
            );
        });

        it('Try withdrawPartial an inexists poach', async function () {
            await Helper.tryCatchRevert(
                () => poach.withdrawPartial(
                    '999999999999999999999999999999999',
                    beneficiary,
                    '0',
                    { from: creator }
                ),
                'msg.sender Not authorized'
            );
        });

        it('Try withdrawPartial a pair with an unauthorized account', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator });

            await Helper.tryCatchRevert(
                () => poach.withdrawPartial(
                    id,
                    beneficiary,
                    '0',
                    { from: accounts[9] }
                ),
                'msg.sender Not authorized'
            );
        });

        it('Try make an underflow', async function () {
            const id = await poach.totalSupply();
            await poach.create(ETH, '0', { from: creator });

            await Helper.tryCatchRevert(
                () => poach.withdrawPartial(
                    id,
                    beneficiary,
                    '1',
                    { from: creator }
                ),
                'The balance of poach its to low'
            );

            const id2 = await poach.totalSupply();
            await poach.create(token.address, '0', { from: creator });

            await Helper.tryCatchRevert(
                () => poach.withdrawPartial(
                    id2,
                    beneficiary,
                    '1',
                    { from: creator }
                ),
                'The balance of poach its to low'
            );
        });
    });
});
