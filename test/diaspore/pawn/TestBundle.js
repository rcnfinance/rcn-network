const TestToken = artifacts.require('./diaspore/utils/test/TestModel.sol');
const TestERC721 = artifacts.require('./utils/test/TestERC721.sol');

const Bundle = artifacts.require('./diaspore/cosigner/pawn/Bundle.sol');
const Poach = artifacts.require('./diaspore/cosigner/pawn/Poach.sol');

const Helper = require('./../../Helper.js');
const BigNumber = web3.BigNumber;
const precision = new BigNumber(10 ** 18);

// Contracts
let bundle;
let poach;
// ERC20 contacts
let rcn;
let pepeCoin;
const ethAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ethAmount = new BigNumber(50).times(precision);
// ERC721 contacts
let pokemons;
let zombies;
let magicCards;
// ERC721 ids
// pokemons
const ratata = 19;
const pikachu = 25;
const clefairy = 35;
const vulpix = 37;
const mewtwo = 150;
// zombies
const michaelJackson = 9953121564;
const theFirst = 0;
// magic cards
const blackDragon = 56153153;
const ent = 12312313;
const orc = 6516551;

// Accounts
let user;
let user2;

const I_TOKEN = 0;
const I_ID = 1;
const I_AMOUNT = 1;
const I_ALIVE = 2;

contract('TestBundle', function (accounts) {
    before('Create the bundle contract', async function () {
        // set account addresses
        user = accounts[1];
        user2 = accounts[2];

        bundle = await Bundle.new();
    });

    beforeEach('Create Bundle, ERC20, ERC721 contracts', async function () {
        // deploy contracts
        // ERC20
        rcn = await TestToken.new();
        await rcn.createTokens(user, web3.toWei(10));
        await rcn.createTokens(user2, web3.toWei(6));
        pepeCoin = await TestToken.new();
        await pepeCoin.createTokens(user, web3.toWei(15));
        // ERC721
        pokemons = await TestERC721.new();
        await pokemons.addNtf('ratata', ratata, user2);
        await pokemons.addNtf('pikachu', pikachu, user);
        await pokemons.addNtf('clefairy', clefairy, user);
        await pokemons.addNtf('vulpix', vulpix, user);
        await pokemons.addNtf('mewtwo', mewtwo, user);
        zombies = await TestERC721.new();
        await zombies.addNtf('michaelJackson', michaelJackson, user);
        await zombies.addNtf('theFirst', theFirst, user);
        magicCards = await TestERC721.new();
        await magicCards.addNtf('blackDragon', blackDragon, user);
        await magicCards.addNtf('ent', ent, user);
        await magicCards.addNtf('orc', orc, user);

        poach = await Poach.new();
    });

    it('test: create packages', async () => {
        await bundle.create({ from: user2 });
        const receipt = await bundle.create({ from: user });
        const package2 = receipt.logs[1].args._tokenId;

        assert.equal(await bundle.ownerOf(package2), user, 'check package 2 ownership');

        await bundle.create({ from: user });
        await bundle.create({ from: user });
        await bundle.create({ from: user2 });
        await bundle.create({ from: user });

        assert.equal(await bundle.balanceOf(user), 4, 'ckeck user balance');
        assert.equal(await bundle.balanceOf(user2), 2, 'ckeck user2 balance');

        const userPackages = await bundle.assetsOf(user);
        const user2Packages = await bundle.assetsOf(user2);

        assert.equal(userPackages.length, 4, 'ckeck user balance');
        assert.equal(user2Packages.length, 2, 'ckeck user2 balance');
    });

    it('test: add erc20 to a package', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;

        const prevRcnBal = await rcn.balanceOf(user);
        const prevPepeCoinBal = await pepeCoin.balanceOf(user);

        await rcn.approve(poach.address, web3.toWei(5), { from: user });
        await pepeCoin.approve(poach.address, web3.toWei(6), { from: user });

        let poachReceipt = await poach.create(rcn.address, web3.toWei(5), { from: user });
        const poach1Id = poachReceipt.logs[1].args.pairId;
        poachReceipt = await poach.create(pepeCoin.address, web3.toWei(6), { from: user });
        const poach2Id = poachReceipt.logs[1].args.pairId;
        poachReceipt = await poach.create(ethAddress, ethAmount, { from: user, value: ethAmount });
        const poachEthId = poachReceipt.logs[0].args.pairId;
        await poach.setApprovalForAll(bundle.address, true, { from: user });

        await bundle.deposit(packageId, poach.address, poach1Id, { from: user });
        await bundle.deposit(packageId, poach.address, poach2Id, { from: user });
        await bundle.deposit(packageId, poach.address, poachEthId, { from: user });

        // ckeck package balance
        assert.equal(await rcn.balanceOf(poach.address), web3.toWei(5), 'ckeck package balance in rcn');
        assert.equal(await pepeCoin.balanceOf(poach.address), web3.toWei(6), 'ckeck package balance in pepeCoin');
        assert.equal(await web3.eth.getBalance(poach.address), ethAmount.toString());
        assert.equal(await rcn.balanceOf(bundle.address), 0, 'ckeck package balance in rcn');
        assert.equal(await pepeCoin.balanceOf(bundle.address), 0, 'ckeck package balance in pepeCoin');
        assert.equal(await web3.eth.getBalance(bundle.address), 0);
        assert.equal(await poach.ownerOf(poach1Id), bundle.address);
        assert.equal(await poach.ownerOf(poach2Id), bundle.address);
        assert.equal(await poach.ownerOf(poachEthId), bundle.address);
        // ckeck user balance
        assert.equal(await rcn.balanceOf(user), prevRcnBal - web3.toWei(5), 'ckeck user balance in rcn');
        assert.equal(await pepeCoin.balanceOf(user), prevPepeCoinBal - web3.toWei(6), 'ckeck user balance in pepeCoin');

        let content = await bundle.content(packageId);
        assert.equal(content[I_TOKEN].length, 3);
        assert.equal(content[I_TOKEN].length, content[I_ID].length);
        assert.equal(content[I_TOKEN][0], poach.address);
        assert.equal(content[I_ID][0].toNumber(), poach1Id);
        assert.equal(content[I_TOKEN][1], poach.address);
        assert.equal(content[I_ID][1].toNumber(), poach2Id);

        // add a diferent amount of tokens in a registered package
        await rcn.createTokens(user, web3.toWei(4));
        await rcn.approve(poach.address, web3.toWei(4), { from: user });
        await poach.deposit(poach1Id, web3.toWei(4), { from: user });

        assert.equal(await rcn.balanceOf(poach.address), web3.toWei(9), 'ckeck bundle contract balance in rcn');

        content = await bundle.content(packageId);
        assert.equal(content[I_TOKEN].length, 3);
        assert.equal(content[I_TOKEN].length, content[I_ID].length);
        assert.equal(content[I_TOKEN][0], poach.address);
        assert.equal(content[I_ID][0].toNumber(), poach1Id);
        assert.equal(content[I_TOKEN][1], poach.address);
        assert.equal(content[I_ID][1].toNumber(), poach2Id);
    });

    it('test: add erc721 to a package', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;

        // pokemons
        await pokemons.approve(bundle.address, pikachu, { from: user });
        await pokemons.approve(bundle.address, clefairy, { from: user });
        await bundle.depositBatch(packageId, [pokemons.address, pokemons.address], [pikachu, clefairy], { from: user });
        // zombies
        await zombies.approve(bundle.address, theFirst, { from: user });
        await bundle.deposit(packageId, zombies.address, theFirst, { from: user });
        // magic cards
        await magicCards.approve(bundle.address, orc, { from: user });
        await bundle.deposit(packageId, magicCards.address, orc, { from: user });

        try { // try to add from other account
            await pokemons.approve(bundle.address, ratata, { from: user2 });
            await bundle.depositBatch(packageId, [pokemons.address], [ratata], { from: user });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        // add more non fungible token in a registered ERC721
        await magicCards.approve(bundle.address, ent, { from: user });
        await bundle.deposit(packageId, magicCards.address, ent, { from: user });

        // check ownership
        assert.equal(await pokemons.ownerOf(pikachu), bundle.address);
        assert.equal(await pokemons.ownerOf(clefairy), bundle.address);
        assert.equal(await zombies.ownerOf(theFirst), bundle.address);
        assert.equal(await magicCards.ownerOf(orc), bundle.address);
        assert.equal(await magicCards.ownerOf(ent), bundle.address);

        const content = await bundle.content(packageId);
        assert.equal(content[I_TOKEN].length, 5);
        assert.equal(content[I_TOKEN].length, content[I_ID].length);
        assert.equal(content[I_TOKEN][0], pokemons.address);
        assert.equal(content[I_ID][0], pikachu);
        assert.equal(content[I_TOKEN][1], pokemons.address);
        assert.equal(content[I_ID][1], clefairy);
        assert.equal(content[I_TOKEN][2], zombies.address);
        assert.equal(content[I_ID][2], theFirst);
        assert.equal(content[I_TOKEN][3], magicCards.address);
        assert.equal(content[I_ID][3], orc);
        assert.equal(content[I_TOKEN][4], magicCards.address);
        assert.equal(content[I_ID][4], ent);
    });

    it('test: withdraw erc20 from a package', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;

        // add erc20
        await rcn.approve(poach.address, web3.toWei(5), { from: user });
        await pepeCoin.approve(poach.address, web3.toWei(6), { from: user });

        let poachReceipt = await poach.create(rcn.address, web3.toWei(5), { from: user });
        const poach1Id = poachReceipt.logs[1].args.pairId;
        poachReceipt = await poach.create(pepeCoin.address, web3.toWei(6), { from: user });
        const poach2Id = poachReceipt.logs[1].args.pairId;
        poachReceipt = await poach.create(ethAddress, ethAmount, { from: user, value: ethAmount });
        const poachEthId = poachReceipt.logs[0].args.pairId;

        await poach.setApprovalForAll(bundle.address, true, { from: user });

        await bundle.deposit(packageId, poach.address, poach1Id, { from: user });
        await bundle.deposit(packageId, poach.address, poach2Id, { from: user });
        await bundle.deposit(packageId, poach.address, poachEthId, { from: user });

        let prevUserBal = await rcn.balanceOf(user);
        const prevUser2Bal = await rcn.balanceOf(user2);
        let prevPoachBal = await rcn.balanceOf(poach.address);

        // withdraw RCN
        await bundle.withdraw(packageId, poach.address, poach1Id, user2, { from: user });
        await poach.destroy(poach1Id, { from: user2 });
        assert.equal((await rcn.balanceOf(user2)).toString(), prevUser2Bal.plus(web3.toWei(5)).toString(), 'check user2 Balance');
        assert.equal((await rcn.balanceOf(user)).toString(), prevUserBal.toString(), 'check user Balance');
        assert.equal((await rcn.balanceOf(poach.address)).toString(), prevPoachBal.minus(web3.toWei(5)).toString(), 'check bundle contract Balance');

        // withdraw ALL poachs
        prevUserBal = await pepeCoin.balanceOf(user);
        prevPoachBal = await pepeCoin.balanceOf(poach.address);

        await bundle.withdrawBatch(packageId, [poach.address, poach.address], [poach2Id, poachEthId], user, { from: user });
        await poach.destroy(poach2Id, { from: user });

        assert.equal((await pepeCoin.balanceOf(user)).toString(), prevUserBal.plus(web3.toWei(6)).toString(), 'check user2 Balance');
        assert.equal((await pepeCoin.balanceOf(poach.address)).toString(), prevPoachBal.minus(web3.toWei(6)).toString(), 'check bundle contract Balance');

        await poach.destroy(poachEthId, { from: user });

        let content = await bundle.content(packageId);
        assert.equal(content[I_TOKEN].length, 0);
        assert.equal(content[I_ID].length, 0);

        try { // try to withdraw a deleted ERC20 id
            await bundle.withdraw(packageId, poach.address, poach2Id, user, { from: user });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        await bundle.deposit(packageId, poach.address, poachEthId, { from: user });
        await bundle.deposit(packageId, poach.address, poach2Id, { from: user });

        content = await bundle.content(packageId);
        assert.equal(content[I_TOKEN].length, 2);

        const poach2 = await poach.getPair(content[I_ID][0]);
        assert.equal(poach2[I_AMOUNT].toNumber(), 0);
        assert.equal(poach2[I_ALIVE], false);

        const poachEth = await poach.getPair(content[I_ID][0]);
        assert.equal(poachEth[I_AMOUNT].toNumber(), 0);
        assert.equal(poachEth[I_ALIVE], false);
    });

    it('test: withdraw erc721 from a package', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;
        // pokemons
        await pokemons.approve(bundle.address, pikachu, { from: user });
        await pokemons.approve(bundle.address, clefairy, { from: user });
        await bundle.depositBatch(packageId, [pokemons.address, pokemons.address], [pikachu, clefairy], { from: user });

        assert.equal(await pokemons.ownerOf(clefairy), bundle.address);
        assert.equal(await pokemons.ownerOf(pikachu), bundle.address);

        // zombies
        await zombies.approve(bundle.address, theFirst, { from: user });
        await bundle.depositBatch(packageId, [zombies.address], [theFirst], { from: user });

        // magic cards
        await magicCards.approve(bundle.address, orc, { from: user });
        await bundle.deposit(packageId, magicCards.address, orc, { from: user });

        await bundle.withdraw(packageId, pokemons.address, clefairy, user, { from: user });
        await bundle.withdraw(packageId, pokemons.address, pikachu, user, { from: user });

        const content = await bundle.content(packageId);
        assert.equal(content[I_TOKEN].length, 2);
        assert.equal(content[I_ID].length, 2);
        assert.equal(content[I_TOKEN][0], zombies.address);
        assert.equal(content[I_ID][0], theFirst);
        assert.equal(content[I_TOKEN][1], magicCards.address);
        assert.equal(content[I_ID][1], orc);

        assert.equal(await pokemons.ownerOf(clefairy), user);
        assert.equal(await pokemons.ownerOf(pikachu), user);
    });

    it('Should withdraw a single item from a package', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;

        await pokemons.approve(bundle.address, pikachu, { from: user });
        await pokemons.approve(bundle.address, clefairy, { from: user });
        await bundle.depositBatch(packageId, [pokemons.address, pokemons.address], [pikachu, clefairy], { from: user });

        await bundle.withdraw(packageId, pokemons.address, clefairy, user, { from: user });
        assert.equal(await pokemons.ownerOf(clefairy), user);
        assert.equal(await pokemons.ownerOf(pikachu), bundle.address);

        await bundle.withdraw(packageId, pokemons.address, pikachu, user, { from: user });
        assert.equal(await pokemons.ownerOf(pikachu), user);
    });

    it('Should not allow to withdraw if lacks permissions', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;

        await pokemons.approve(bundle.address, pikachu, { from: user });
        await pokemons.approve(bundle.address, clefairy, { from: user });
        await bundle.depositBatch(packageId, [pokemons.address, pokemons.address], [pikachu, clefairy], { from: user });

        try { // try to withdraw a deleted ERC20 id
            await bundle.withdraw(packageId, pokemons.address, clefairy, user, { from: user2 });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        assert.equal(await pokemons.ownerOf(clefairy), bundle.address);
        assert.equal(await pokemons.ownerOf(pikachu), bundle.address);

        try { // try to withdraw a deleted ERC20 id
            await bundle.withdraw(packageId, pokemons.address, pikachu, user2, { from: user2 });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        assert.equal(await pokemons.ownerOf(clefairy), bundle.address);
        assert.equal(await pokemons.ownerOf(pikachu), bundle.address);
    });

    it('Should withdraw a list of items', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;

        await pokemons.setApprovalForAll(bundle.address, true, { from: user });
        await magicCards.setApprovalForAll(bundle.address, true, { from: user });
        await pokemons.transferFrom(user2, user, ratata, { from: user2 });

        const tokens = [pokemons.address, pokemons.address, pokemons.address, pokemons.address, magicCards.address, pokemons.address];
        const items = [pikachu, clefairy, ratata, mewtwo, ent, vulpix];

        await bundle.depositBatch(packageId, tokens, items, { from: user });
        await bundle.transferFrom(user, user2, packageId, { from: user });

        const wtokens = [pokemons.address, pokemons.address, magicCards.address];
        const witems = [pikachu, mewtwo, ent];

        await bundle.withdrawBatch(packageId, wtokens, witems, user2, { from: user2 });
        assert.equal(await pokemons.ownerOf(pikachu), user2);
        assert.equal(await pokemons.ownerOf(clefairy), bundle.address);
        assert.equal(await pokemons.ownerOf(vulpix), bundle.address);
        assert.equal(await pokemons.ownerOf(mewtwo), user2);
        assert.equal(await magicCards.ownerOf(ent), user2);
        assert.equal(await pokemons.ownerOf(vulpix), bundle.address);
    });

    it('Should fail to withdraw a list of items', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;

        await pokemons.setApprovalForAll(bundle.address, true, { from: user });
        await magicCards.setApprovalForAll(bundle.address, true, { from: user });
        await pokemons.transferFrom(user2, user, ratata, { from: user2 });

        const tokens = [pokemons.address, pokemons.address, pokemons.address, pokemons.address, magicCards.address, pokemons.address];
        const items = [pikachu, clefairy, ratata, mewtwo, ent, vulpix];

        await bundle.depositBatch(packageId, tokens, items, { from: user });
        await bundle.transferFrom(user, user2, packageId, { from: user });

        const wtokens = [pokemons.address, pokemons.address, magicCards.address];
        const witems = [pikachu, mewtwo, ent];

        try { // try to withdraw a deleted ERC20 id
            await bundle.withdrawBatch(packageId, wtokens, witems, user2, { from: user });
            assert(false, 'throw was expected in line above.');
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), 'expected throw but got: ' + e);
        }

        assert.equal(await pokemons.ownerOf(pikachu), bundle.address);
        assert.equal(await pokemons.ownerOf(clefairy), bundle.address);
        assert.equal(await pokemons.ownerOf(vulpix), bundle.address);
        assert.equal(await pokemons.ownerOf(mewtwo), bundle.address);
        assert.equal(await magicCards.ownerOf(ent), bundle.address);
        assert.equal(await pokemons.ownerOf(vulpix), bundle.address);
    });

    it('Should withdraw all items', async () => {
        const receipt = await bundle.create({ from: user });
        const packageId = receipt.logs[1].args._tokenId;

        await pokemons.setApprovalForAll(bundle.address, true, { from: user });
        await magicCards.setApprovalForAll(bundle.address, true, { from: user });
        await pokemons.transferFrom(user2, user, ratata, { from: user2 });

        // add erc20
        await rcn.approve(poach.address, web3.toWei(5), { from: user });
        await pepeCoin.approve(poach.address, web3.toWei(6), { from: user });

        let poachReceipt = await poach.create(pepeCoin.address, web3.toWei(6), { from: user });
        const poach1Id = poachReceipt.logs[1].args.pairId;
        poachReceipt = await poach.create(ethAddress, ethAmount, { from: user, value: ethAmount });
        const poachEthId = poachReceipt.logs[0].args.pairId;

        await poach.setApprovalForAll(bundle.address, true, { from: user });

        const tokens = [pokemons.address, pokemons.address, pokemons.address, pokemons.address, magicCards.address, pokemons.address];
        const items = [pikachu, clefairy, ratata, mewtwo, ent, vulpix];

        await bundle.depositBatch(packageId, tokens, items, { from: user });
        await bundle.deposit(packageId, poach.address, poachEthId, { from: user });
        await bundle.deposit(packageId, poach.address, poach1Id, { from: user });
        await bundle.transferFrom(user, user2, packageId, { from: user });

        await bundle.withdrawAll(packageId, user2, { from: user2 });
        assert.equal((await bundle.content(packageId))[0].length, 0);
        assert.equal(await pokemons.ownerOf(pikachu), user2);
        assert.equal(await pokemons.ownerOf(clefairy), user2);
        assert.equal(await pokemons.ownerOf(vulpix), user2);
        assert.equal(await pokemons.ownerOf(mewtwo), user2);
        assert.equal(await magicCards.ownerOf(ent), user2);
        assert.equal(await pokemons.ownerOf(vulpix), user2);
    });
});
