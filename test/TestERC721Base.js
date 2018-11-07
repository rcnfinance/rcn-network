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
        const assetId = 2;

        const receiver = await TestERC721Receiver.new();

        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.lastOperator(), accounts[0]);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it('Test safeTransfer legacy', async function () {
        const assetId = 4;

        const receiver = await TestERC721ReceiverLegacy.new();

        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it('Test safeTransfer legacy witout fallback', async function () {
        const assetId = 5;

        const receiver = await TestERC721ReceiverLegacyRaw.new();

        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it('Test can\'t receive safe transfer', async function () {
        const assetId = 6;

        const receiver = await TestNoReceive.new();

        await token.generate(assetId, accounts[0]);
        await Helper.tryCatchRevert(() => token.safeTransferFrom(accounts[0], receiver.address, assetId), '');

        assert.equal(await token.ownerOf(assetId), accounts[0]);
    });

    it('Test safeTransfer with multiple implementations', async function () {
        const assetId = 8;

        const receiver = await TestERC721ReceiverMultiple.new();

        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.methodCalled(), 2);
        assert.equal(await receiver.lastOperator(), accounts[0]);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

      it("Test approve a third party operator to manage one particular asset ", async function(){
            let assetId = 9;

            await token.generate(assetId, accounts[0]);
            await token.approve(accounts[1], assetId);

            assert.equal(await token.getApprovedAddress(assetId), accounts[1]);
            assert.equal(await token.isApprovedForAll(accounts[1],accounts[0]),false);
        });

      it("Test approve a third party and transfer asset from the third party to another new owner ", async function(){
              let assetId = 10;

              await token.generate(assetId, accounts[0]);
              await token.approve(accounts[1], assetId);

              await token.safeTransferFrom(accounts[0], accounts[2], assetId,{from: accounts[1]});

              assert.equal(await token.ownerOf(assetId), accounts[2]);
          });

      it("Test approve a third party operator to manage all asset", async function(){
                let assetId = 11;

                await token.generate(assetId, accounts[0]);
                await token.setApprovalForAll(accounts[1], true);


                assert.equal(await token.isApprovedForAll(accounts[1],accounts[0]),true);

            });


})
