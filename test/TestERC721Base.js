const TestERC721 = artifacts.require('./utils/test/TestERC721.sol');
const TestERC721Receiver = artifacts.require('./utils/test/TestERC721Receiver.sol');
const TestERC721ReceiverLegacy = artifacts.require('./utils/test/TestERC721ReceiverLegacy.sol');
const TestNoReceive = artifacts.require('./utils/test/TokenLockable.sol');
const Helper = require('./Helper.js');

contract('ERC721 Base', function(accounts) {
    let token;

    before("Create ERC721 Base", async function(){
        token = await TestERC721.new();
    })

    it("Test safeTransfer", async function(){
        let assetId = 2;

        let receiver = await TestERC721Receiver.new();
        
        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.lastOperator(), accounts[0]);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it("Test safeTransfer legacy", async function(){
        let assetId = 4;

        let receiver = await TestERC721ReceiverLegacy.new();
        
        await token.generate(assetId, accounts[0]);
        await token.safeTransferFrom(accounts[0], receiver.address, assetId);

        assert.equal(await token.ownerOf(assetId), receiver.address);
        assert.equal(await receiver.lastFrom(), accounts[0]);
        assert.equal(await receiver.lastTokenId(), assetId);
    });

    it("Test can't receive safe transfer", async function(){
        let assetId = 6;

        let receiver = await TestNoReceive.new();
        
        await token.generate(assetId, accounts[0]);
        await Helper.assertThrow(token.safeTransferFrom(accounts[0], receiver.address, assetId));

        assert.equal(await token.ownerOf(assetId), accounts[0]);
    });
})