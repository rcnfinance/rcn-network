const TestERC721 = artifacts.require('./utils/test/TestERC721.sol');
const TestERC721Receiver = artifacts.require('./utils/test/TestERC721Receiver.sol');
const TestERC721ReceiverLegacy = artifacts.require('./utils/test/TestERC721ReceiverLegacy.sol');
const TestERC721ReceiverLegacyRaw = artifacts.require('./utils/test/TestERC721ReceiverLegacyRaw.sol');
const TestERC721ReceiverMultiple = artifacts.require('./utils/test/TestERC721ReceiverMultiple.sol');
const TestNoReceive = artifacts.require('./utils/test/TokenLockable.sol');
const Helper = require('./Helper.js');

contract('ERC721 Base', function (accounts) {
    let token;

    before('Create ERC721 Base', async function () {
        token = await TestERC721.new();
    });

    it('Test safeTransfer', async function () {
        const assetId = 1;

        const receiver = await TestERC721Receiver.new();

        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.lastOperator(), accounts[0]);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it('Test safeTransfer legacy', async function () {
        const assetId = 2;

        const receiver = await TestERC721ReceiverLegacy.new();

        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it('Test safeTransfer legacy witout fallback', async function () {
        const assetId = 3;

        const receiver = await TestERC721ReceiverLegacyRaw.new();

        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it('Test can\'t receive safe transfer', async function () {
        const assetId = 4;

        const receiver = await TestNoReceive.new();

        await token.generate(assetId, accounts[0]);
        await Helper.tryCatchRevert(() => token.safeTransferFrom(accounts[0], receiver.address, assetId), '');

        assert.equal(await token.ownerOf(assetId), accounts[0]);
    });

    it('Test safeTransfer with multiple implementations', async function () {
        const assetId = 5;

        const receiver = await TestERC721ReceiverMultiple.new();

        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.methodCalled(), 2);
        assert.equal(await receiver.lastOperator(), accounts[0]);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it('Test approve a third party operator to manage one particular asset', async function () {
        const assetId = 6;

        await token.generate(assetId, accounts[0]);
        await token.approve(accounts[1], assetId);

        assert.equal(await token.getApprovedAddress(assetId), accounts[1]);
        assert.equal(await token.isApprovedForAll(accounts[1], accounts[0]), false);
    });

    it('should not allow unauthoriazed operators to approve an asset', async function () {
        const assetId = 7;
        await token.generate(assetId, accounts[0]);
        try {
            await token.approve(accounts[2], assetId, { from: accounts[1] });
            assert(false);
        } catch (err) {
            assert(err);
        }
    });

    it('test that an operator has been previously approved', async function () {
        const assetId = 8;
        await token.generate(assetId, accounts[0]);
        await token.approve(accounts[1], assetId);
        try {
            await token.approve(accounts[1], assetId);
            assert(true);
        } catch (err) {
            assert(err);
        }
    });

    it('Test approve a third party and transfer asset from the third party to another new owner', async function () {
        const assetId = 9;

        await token.generate(assetId, accounts[0]);
        await token.approve(accounts[1], assetId);

        const assetsOfAddr1before = await token.assetsOf(accounts[0]);

        await token.safeTransferFrom(accounts[0], accounts[2], assetId, { from: accounts[1] });

        const assetsOfAddr1after = await token.assetsOf(accounts[0]);
        const assetsOfAddr2 = await token.assetsOf(accounts[2]);

        assert.equal(await token.ownerOf(assetId), accounts[2]);
        assert.equal(assetsOfAddr1after.length, assetsOfAddr1before.length - 1);
        assert.equal(assetsOfAddr2.length, 1);
    });

    it('Test approve a third party operator to manage all asset', async function () {
        const assetId = 10;

        await token.generate(assetId, accounts[0]);
        await token.setApprovalForAll(accounts[1], true);

        assert.equal(await token.isApprovedForAll(accounts[1], accounts[0]), true);

        const assetsOfAccount0 = await token.assetsOf(accounts[0]);
        const assetsOfAccount0Count = assetsOfAccount0.length;

        let i;
        for (i = 0; i < assetsOfAccount0Count; i++) {
            const isAuthorized = await token.isAuthorized(accounts[1], assetsOfAccount0[i]);
            assert.equal(isAuthorized, true);
        }

        await token.safeTransferFrom(accounts[0], accounts[2], assetId, { from: accounts[1] });

        const ownerOfAsset = await token.ownerOf(assetId);

        assert.equal(ownerOfAsset, accounts[2]);
    });

    it('Test functions that get information of tokens and owners', async function () {
        const assetId = 11;

        await token.generate(assetId, accounts[0]);
        const totalSupply = await token.totalSupply();
        const allTokens = await token.allTokens();
        const name = await token.name();
        const symbol = await token.symbol();

        const tokenAtIndex = await token.tokenByIndex(totalSupply - 1);
        const assetsOfOWner = await token.assetsOf(accounts[0]);
        const auxOwnerIndex = assetsOfOWner.length - 1;
        const tokenOfOwnerByIndex = await token.tokenOfOwnerByIndex(accounts[0], auxOwnerIndex);

        assert.equal(totalSupply, 11);
        assert.equal(name, 'Test ERC721');
        assert.equal(symbol, 'TST');
        assert.equal(parseInt(tokenAtIndex), parseInt(tokenOfOwnerByIndex), 'Tokens Id of owner and allTokens at indexes should be equal');
        assert.equal(allTokens.length, 11);
    });

    it('Test safeTransferFrom modifiers onlyAuthorized, isCurrentOwner,AddressDefined, isAuthorized ', async function () {
        const assetId = 12;

        await token.generate(assetId, accounts[0]);
        try {
            await token.safeTransferFrom(accounts[1], accounts[2], assetId);
            assert(false);
        } catch (err) {
            assert(err);
        }
        try {
            await token.safeTransferFrom(accounts[0], '0x0', assetId, '0x031');
            assert(false);
        } catch (err) {
            assert(err);
        }
        try {
            await token.safeTransferFrom(accounts[0], accounts[2], 13);
            assert(false);
        } catch (err) {
            assert(err);
        }
        try {
            await token.isAuthorized('0x0', 12);
            assert(false);
        } catch (err) {
            assert(err);
        }
    });

    it('Test that a token does not exists, and token is not from owner or index is out of bounds', async function () {
        const assetId = 13;

        await token.generate(assetId, accounts[0]);
        try {
            await token.tokenByIndex(14);
            assert(false);
        } catch (err) {
            assert(err);
        }
        try {
            await token.tokenOfOwnerByIndex(accounts[0], 14);
            assert(false);
        } catch (err) {
            assert(err);
        }
        try {
            await token.tokenOfOwnerByIndex('0x0', 1);
            assert(false);
        } catch (err) {
            assert(err);
        }
    });

    it('test that an operator has been previously set approval to manage all tokens', async function () {
        const assetId = 14;
        await token.generate(assetId, accounts[0]);
        await token.setApprovalForAll(accounts[3], true);

        try {
            const receipt = await token.setApprovalForAll(accounts[3], true);
            await Helper.eventNotEmitted(receipt, 'ApprovalForAll');
            assert(true);
        } catch (err) {
            console.log(err);
            assert(err);
        }
    });

    it('test transferAsset that is not in the last position of the assetsOwner array', async function () {
        const assetId1 = 15;
        const assetId2 = 16;
        await token.generate(assetId1, accounts[0]);
        await token.generate(assetId2, accounts[0]);

        const assetsOfAddr1Before = await token.balanceOf(accounts[0]);
        const assetsOfAddr5Before = await token.balanceOf(accounts[5]);

        await token.safeTransferFrom(accounts[0], accounts[5], assetId1);

        const assetsOfAddr1after = await token.balanceOf(accounts[0]);
        const assetsOfAddr5After = await token.balanceOf(accounts[5]);

        assert.equal(await token.ownerOf(assetId1), accounts[5]);
        assert.equal(parseInt(assetsOfAddr1after), parseInt(assetsOfAddr1Before) - 1);
        assert.equal(parseInt(assetsOfAddr5After), parseInt(assetsOfAddr5Before) + 1);
    });
});
