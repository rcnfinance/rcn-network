const TestERC721 = artifacts.require('TestERC721');
const TestERC721Receiver = artifacts.require('TestERC721Receiver');
const TestERC721ReceiverLegacy = artifacts.require('TestERC721ReceiverLegacy');
const TestERC721ReceiverLegacyRaw = artifacts.require('TestERC721ReceiverLegacyRaw');
const TestERC721ReceiverMultiple = artifacts.require('TestERC721ReceiverMultiple');
const TestNoReceive = artifacts.require('TokenLockable');

const {
    expect,
    bn,
    address0x,
    toEvents,
    tryCatchRevert,
    eventNotEmitted,
} = require('./Helper.js');

function inc (number) {
    return number.add(bn('1'));
}

function dec (number) {
    return number.sub(bn('1'));
}

function maxUint (base) {
    return dec(bn('2').pow(bn(base)));
}

contract('ERC721 Base', function (accounts) {
    let token;

    const user = accounts[1];
    const otherUser = accounts[2];
    const approved = accounts[3];

    before('Create ERC721 Base', async function () {
        token = await TestERC721.new();
    });

    it('Test functions that get information of tokens and owners', async function () {
        assert.equal(await token.name(), 'Test ERC721');
        assert.equal(await token.symbol(), 'TST');
        const prevTotalSupply = await token.totalSupply();
        const prevAllTokens = (await token.allTokens()).length;

        const assetId = bn('2335');

        await token.generate(assetId, user);

        const totalSupply = await token.totalSupply();
        const tokenAtIndex = await token.tokenByIndex(dec(totalSupply));
        const assetsOfOWner = await token.assetsOf(user);
        const auxOwnerIndex = assetsOfOWner.length - 1;
        const tokenOfOwnerByIndex = await token.tokenOfOwnerByIndex(user, auxOwnerIndex);

        expect(totalSupply).to.eq.BN(inc(prevTotalSupply));
        expect(tokenAtIndex).to.eq.BN(tokenOfOwnerByIndex, 'Tokens Id of owner and allTokens at indexes should be equal');
        assert.equal((await token.allTokens()).length, prevAllTokens + 1);
    });
    describe('Function tokenByIndex', async function () {
        it('Should get asset id by the index', async function () {
            const assetId = bn('51651851');

            await token.generate(
                assetId,
                user
            );

            const lastIndex = dec(await token.totalSupply());
            expect(await token.tokenByIndex(lastIndex)).to.eq.BN(assetId);
        });

        it('Try get asset id by a higth index', async function () {
            const assetId = bn('7777');

            await token.generate(
                assetId,
                user
            );

            await tryCatchRevert(
                () => token.tokenByIndex(
                    maxUint('256')
                ),
                'Index out of bounds'
            );
        });
    });
    describe('Function tokenOfOwnerByIndex', async function () {
        it('Should get asset id of the owner by index of the asset', async function () {
            const assetId = bn('959652');

            await token.generate(
                assetId,
                user
            );

            const getAsset = await token.tokenOfOwnerByIndex(
                user,
                dec(await token.balanceOf(user))
            );

            expect(getAsset).to.eq.BN(assetId);
        });

        it('Try get asset id of the address 0xx', async function () {
            const assetId = bn('613213');

            await token.generate(
                assetId,
                user
            );

            const lastUserToken = dec(await token.balanceOf(user));

            await tryCatchRevert(
                () => token.tokenOfOwnerByIndex(
                    address0x,
                    lastUserToken
                ),
                '0x0 Is not a valid owner'
            );
        });

        it('Try get asset id by a higth index', async function () {
            const assetId = bn('65432156');

            await token.generate(
                assetId,
                user
            );

            await tryCatchRevert(
                () => token.tokenOfOwnerByIndex(
                    user,
                    maxUint('256')
                ),
                'Index out of bounds'
            );
        });
    });
    describe('Function isAuthorized', async function () {
        it('Should be authorized to be the owner', async function () {
            const assetId = bn('23442342');

            await token.generate(
                assetId,
                user
            );

            assert.isOk(await token.isAuthorized(user, assetId));
        });

        it('Should be authorized by the owner', async function () {
            const assetId = bn('53453543');

            await token.generate(
                assetId,
                user
            );

            assert.isOk(await token.isAuthorized(user, assetId));
        });

        it('Should be authorized setApprovalForAll be the owner', async function () {
            const assetId = bn('2221313144');

            await token.generate(
                assetId,
                user
            );

            assert.isOk(await token.isAuthorized(user, assetId));
        });

        it('Try get asset id by a higth index', async function () {
            const assetId = bn('23423432');

            await token.generate(
                assetId,
                user
            );

            await tryCatchRevert(
                () => token.isAuthorized(
                    address0x,
                    assetId
                ),
                '0x0 is an invalid operator'
            );
        });

        it('Test safeTransferFrom modifiers onlyAuthorized, isCurrentOwner,AddressDefined, isAuthorized ', async function () {
            const assetId = bn('2000154');

            await token.generate(assetId, accounts[0]);
            try {
                await token.safeTransferFrom(accounts[0], accounts[2], 13);
                assert(false);
            } catch (err) {
                assert(err);
            }
        });
    });
    describe('Function _doTransferFrom, safeTransfer, safeTransferFrom and safeTransferFrom with _userData', async function () {
        it('Perform a transferFrom with approval', async function () {
            const assetId = bn('561651561');
            const auxAssetId = bn('9999956262');
            await token.generate(assetId, user);
            await token.generate(auxAssetId, user);
            await token.generate(bn('546165651651411'), otherUser);

            const prevBalUser = await token.balanceOf(user);
            const prevLengthUser = (await token.assetsOf(user)).length;

            const prevBalOtherUser = await token.balanceOf(otherUser);
            const prevLengthOtherUser = (await token.assetsOf(otherUser)).length;

            await token.approve(
                approved,
                assetId,
                { from: user }
            );

            const events = await toEvents(
                token.transferFrom(
                    user,
                    otherUser,
                    assetId,
                    { from: approved }
                ),
                'Approval',
                'Transfer'
            );
            const Approval = events[0];
            assert.equal(Approval._owner, user);
            assert.equal(Approval._approved, address0x);
            expect(Approval._tokenId).to.eq.BN(assetId);
            const Transfer = events[1];
            assert.equal(Transfer._from, user);
            assert.equal(Transfer._to, otherUser);
            expect(Transfer._tokenId).to.eq.BN(assetId);

            assert.equal(await token.getApproved(assetId), address0x);
            assert.equal((await token.assetsOf(user)).length, prevLengthUser - 1);
            expect(await token.balanceOf(user)).to.eq.BN(dec(prevBalUser));

            assert.equal(await token.ownerOf(assetId), otherUser);
            assert.equal((await token.assetsOf(otherUser)).length, prevLengthOtherUser + 1);
            expect(await token.balanceOf(otherUser)).to.eq.BN(inc(prevBalOtherUser));
        });

        it('Perform a transferFrom with ownership', async function () {
            const assetId = bn('9959');
            await token.generate(assetId, user);

            await token.approve(
                approved,
                assetId,
                { from: user }
            );

            const Transfer = await toEvents(
                token.transferFrom(
                    user,
                    otherUser,
                    assetId,
                    { from: approved }
                ),
                'Transfer'
            );
            assert.equal(Transfer._from, user);
            assert.equal(Transfer._to, otherUser);
            expect(Transfer._tokenId).to.eq.BN(assetId);

            assert.equal(await token.ownerOf(assetId), otherUser);
        });

        it('Perform a transferFrom with operator privileges', async function () {
            const assetId = bn('989951');
            await token.generate(assetId, user);
            await token.setApprovalForAll(approved, true, { from: user });

            const Transfer = await toEvents(
                token.transferFrom(
                    user,
                    otherUser,
                    assetId,
                    { from: approved }
                ),
                'Transfer'
            );
            assert.equal(Transfer._from, user);
            assert.equal(Transfer._to, otherUser);
            expect(Transfer._tokenId).to.eq.BN(assetId);

            assert.equal(await token.ownerOf(assetId), otherUser);
            await token.setApprovalForAll(approved, false, { from: user });
        });

        it('Try tansfer an asset to address 0x0', async function () {
            const assetId = bn('65161');
            await token.generate(assetId, user);

            await tryCatchRevert(
                () => token.transferFrom(
                    user,
                    address0x,
                    assetId,
                    { from: user }
                ),
                'Target can\'t be 0x0'
            );
        });

        it('Try tansfer an asset without authorize', async function () {
            const assetId = bn('111199876543');
            await token.generate(assetId, user);

            await tryCatchRevert(
                () => token.transferFrom(
                    user,
                    otherUser,
                    assetId,
                    { from: otherUser }
                ),
                'msg.sender Not authorized'
            );
        });

        it('SafeTransferFrom legacy to a contract, safeTransferFrom(address,address,uint256)', async function () {
            const assetId = bn('894988913213216516516516516514796');
            const receiverLegacy = await TestERC721ReceiverLegacy.new();

            await token.generate(assetId, user);

            const Transfer = await toEvents(
                token.safeTransferFrom(
                    user,
                    receiverLegacy.address,
                    assetId,
                    { from: user }
                ),
                'Transfer'
            );

            assert.equal(Transfer._from, user);
            assert.equal(Transfer._to, receiverLegacy.address);
            expect(Transfer._tokenId).to.eq.BN(assetId);

            assert.equal(await token.ownerOf(assetId), receiverLegacy.address);
            assert.equal(await receiverLegacy.lastFrom(), user);
            expect(await receiverLegacy.lastTokenId()).to.eq.BN(assetId);
        });

        it('Test safeTransferFrom legacy witout fallback', async function () {
            const assetId = bn('62659592');

            const receiver = await TestERC721ReceiverLegacyRaw.new();

            await token.generate(assetId, user);
            await token.safeTransferFrom(
                user,
                receiver.address,
                assetId,
                { from: user }
            );

            assert.equal(await token.ownerOf(assetId), receiver.address);
            assert.equal(await receiver.lastFrom(), user);
            expect(await receiver.lastTokenId()).to.eq.BN(assetId);
        });

        it('Test can\'t receive safeTransferFrom', async function () {
            const assetId = bn('123131341');

            const receiver = await TestNoReceive.new();

            await token.generate(assetId, user);
            await tryCatchRevert(
                () => token.safeTransferFrom(
                    user,
                    receiver.address,
                    assetId
                ),
                ''
            );

            assert.equal(await token.ownerOf(assetId), user);
        });

        it('SafeTransferFrom to a contract, safeTransferFrom(address,address,uint256)', async function () {
            const assetId = bn('9292632651');

            const receiver = await TestERC721Receiver.new();

            await token.generate(assetId, user);

            const Transfer = await toEvents(
                token.safeTransferFrom(
                    user,
                    receiver.address,
                    assetId,
                    { from: user }
                ),
                'Transfer'
            );

            assert.equal(Transfer._from, user);
            assert.equal(Transfer._to, receiver.address);
            expect(Transfer._tokenId).to.eq.BN(assetId);

            assert.equal(await token.ownerOf(assetId), receiver.address);
            assert.equal(await receiver.lastOperator(), user);
            assert.equal(await receiver.lastFrom(), user);
            expect(await receiver.lastTokenId()).to.eq.BN(assetId);
        });

        it('SafeTransferFrom with _userData, safeTransferFrom(address,address,uint256,bytes)', async function () {
            const assetId = bn('61268456');

            const receiver = await TestERC721ReceiverMultiple.new();

            const _userData = web3.utils.asciiToHex('test safeTransferFrom with _userData');

            await token.generate(assetId, user);
            await token.setApprovalForAll(otherUser, true, { from: user });

            const Transfer = await toEvents(
                token.methods['safeTransferFrom(address,address,uint256,bytes)'](
                    user,
                    receiver.address,
                    assetId,
                    _userData,
                    { from: otherUser }
                ),
                'Transfer'
            );

            assert.equal(Transfer._from, user);
            assert.equal(Transfer._to, receiver.address);
            expect(Transfer._tokenId).to.eq.BN(assetId);

            assert.equal(await token.ownerOf(assetId), receiver.address);
            expect(await receiver.methodCalled()).to.eq.BN('2');
            assert.equal(await receiver.lastOperator(), otherUser);
            assert.equal(await receiver.lastFrom(), user);
            assert.equal(await receiver.lastData(), _userData);
            expect(await receiver.lastTokenId()).to.eq.BN(assetId);

            await token.setApprovalForAll(otherUser, false, { from: user });
        });

        it('Test safeTransferFrom with multiple implementations', async function () {
            const assetId = bn('1651651');

            const receiver = await TestERC721ReceiverMultiple.new();

            await token.generate(assetId, user);
            await token.safeTransferFrom(user, receiver.address, assetId, { from: user });

            assert.equal(await token.ownerOf(assetId), receiver.address);
            expect(await receiver.methodCalled()).to.eq.BN('2');
            assert.equal(await receiver.lastOperator(), user);
            assert.equal(await receiver.lastFrom(), user);
            expect(await receiver.lastTokenId()).to.eq.BN(assetId);
        });

        it('test transferAsset that is not in the last position of the assetsOwner array', async function () {
            const assetId1 = bn('412312343');
            const assetId2 = bn('4433123');
            await token.generate(assetId1, user);
            await token.generate(assetId2, user);

            const assetsOfAddr1Before = await token.balanceOf(user);
            const assetsOfAddr5Before = await token.balanceOf(otherUser);

            await token.safeTransferFrom(user, otherUser, assetId1, { from: user });

            const assetsOfAddr1after = await token.balanceOf(user);
            const assetsOfAddr5After = await token.balanceOf(otherUser);

            assert.equal(await token.ownerOf(assetId1), otherUser);
            expect(assetsOfAddr1after).to.eq.BN(assetsOfAddr1Before.sub(bn('1')));
            expect(assetsOfAddr5After).to.eq.BN(assetsOfAddr5Before.add(bn('1')));
        });
    });
    describe('Function _generate', async function () {
        it('Should generate a new NFT', async function () {
            const assetId = bn('62329');
            const prevBalUser = await token.balanceOf(user);
            const totalNFT = await token.totalSupply();

            const Transfer = await toEvents(
                token.generate(
                    assetId,
                    user
                ),
                'Transfer'
            );

            assert.equal(Transfer._from, address0x);
            assert.equal(Transfer._to, user);
            expect(Transfer._tokenId).to.eq.BN(assetId);

            assert.equal(await token.ownerOf(assetId), user);
            expect(await token.balanceOf(user)).to.eq.BN(inc(prevBalUser));
            expect(await token.totalSupply()).to.eq.BN(inc(totalNFT));
            assert.isOk((await token.allTokens()).some(x => x.toString() === assetId.toString()));
        });

        it('Try generate two same NFT', async function () {
            const assetId = bn('13201320320');

            await token.generate(
                assetId,
                user
            );

            await tryCatchRevert(
                () => token.generate(
                    assetId,
                    user
                ),
                'Asset already exists'
            );
        });
    });
    describe('Function approve', async function () {
        it('Test approve a third party operator to manage one particular asset', async function () {
            const assetId = bn('3123331');

            await token.generate(assetId, user);

            const Approval = await toEvents(
                token.approve(
                    otherUser,
                    assetId,
                    { from: user }
                ),
                'Approval'
            );

            assert.equal(Approval._owner, user);
            assert.equal(Approval._approved, otherUser);
            expect(Approval._tokenId).to.eq.BN(assetId);

            assert.equal(await token.getApproved(assetId), otherUser);
            assert.equal(await token.isApprovedForAll(otherUser, user), false);
        });

        it('test that an operator has been previously approved', async function () {
            const assetId = bn('986565165');
            await token.generate(assetId, user);
            await token.approve(otherUser, assetId, { from: user });

            assert.isEmpty((await token.approve(otherUser, assetId, { from: user })).logs);
        });

        it('Test approve a third party and transfer asset from the third party to another new owner', async function () {
            const assetId = bn('24411223');
            const user3 = accounts[4];

            await token.generate(assetId, user);
            await token.approve(otherUser, assetId, { from: user });

            const assetsOfAddr1before = await token.assetsOf(user);
            const assetsOfAddr2before = await token.assetsOf(user3);

            await token.safeTransferFrom(user, user3, assetId, { from: otherUser });

            const assetsOfAddr1after = await token.assetsOf(user);
            const assetsOfAddr2after = await token.assetsOf(user3);

            assert.equal(await token.ownerOf(assetId), user3);
            assert.equal(assetsOfAddr1after.length, assetsOfAddr1before.length - 1);
            assert.equal(assetsOfAddr2after.length, assetsOfAddr2before.length + 1);
        });

        it('should not allow unauthoriazed operators to approve an asset', async function () {
            const assetId = bn('123132129831981329');
            await token.generate(assetId, user);

            await tryCatchRevert(
                () => token.approve(
                    otherUser,
                    assetId,
                    { from: otherUser }
                ),
                'msg.sender can\'t approve'
            );
        });

        it('Try approve without authorization', async function () {
            const assetId = bn('65659941230');
            await token.generate(assetId, user);

            await token.approve(otherUser, assetId, { from: user });

            await tryCatchRevert(
                () => token.approve(
                    otherUser,
                    assetId,
                    { from: otherUser }
                ),
                'msg.sender can\'t approve'
            );
        });
    });
    describe('Function setApprovalForAll', async function () {
        it('Test approve a third party operator to manage all asset', async function () {
            const assetId = bn('9991831');
            const user3 = accounts[4];

            await token.generate(assetId, user);

            const ApprovalForAll = await toEvents(
                token.setApprovalForAll(
                    otherUser,
                    true,
                    { from: user }
                ),
                'ApprovalForAll'
            );

            assert.equal(ApprovalForAll._owner, user);
            assert.equal(ApprovalForAll._operator, otherUser);
            assert.equal(ApprovalForAll._approved, true);

            assert.equal(await token.isApprovedForAll(otherUser, user), true);

            const assetsOfUser = await token.assetsOf(user);
            for (let i = 0; i < assetsOfUser.length; i++) {
                const isAuthorized = await token.isAuthorized(otherUser, assetsOfUser[i]);
                assert.equal(isAuthorized, true);
            }

            await token.safeTransferFrom(user, user3, assetId, { from: otherUser });

            assert.equal(await token.ownerOf(assetId), user3);

            await token.setApprovalForAll(otherUser, false, { from: user });
        });

        it('test that an operator has been previously set approval to manage all tokens', async function () {
            const assetId = bn('651203');
            await token.generate(assetId, user);
            await token.setApprovalForAll(otherUser, true);

            const receipt = await token.setApprovalForAll(otherUser, true);
            await eventNotEmitted(receipt, 'ApprovalForAll');

            await token.setApprovalForAll(otherUser, false, { from: user });
        });
    });
    describe('Functions setURIProvider and tokenURI', async function () {
        it('test setURIProvider and tokenURI functions', async function () {
            const assetId = bn('443');
            const testURIProvider = await artifacts.require('TestURIProvider').new();
            const testTokenURI = await artifacts.require('TestTokenURI').new();

            await testURIProvider.generate(assetId, user);

            const SetURIProvider = await toEvents(
                testURIProvider.setURIProvider(testTokenURI.address),
                'SetURIProvider'
            );

            assert.equal(SetURIProvider._uriProvider, testTokenURI.address);

            assert.equal(await testTokenURI.tokenURI(assetId, { from: user }), await testURIProvider.uri());
        });

        it('test tokenURI(ERC721Base) function', async function () {
            const assetId = bn('42243');
            await token.generate(assetId, user);

            assert.equal(await token.tokenURI(assetId, { from: user }), '');
        });

        it('Try get tokenURI of a inexist token', async function () {
            await tryCatchRevert(
                () => token.tokenURI(
                    bn('9999999999999991'),
                    { from: accounts[9] }
                ),
                'Asset does not exist'
            );
        });
    });
    describe('Functional tests', async function () {
        it('Should generate a new NFTs and tansfer randomly', async function () {
            const assetIds = [];
            const totalAssets = 25;

            for (let i = 0; i < totalAssets; i++) {
                assetIds.push(600 + i);
                await token.generate(assetIds[i], accounts[i % 10]);
            }

            for (let i = totalAssets - 1; i >= 0; i--) {
                const owner = await token.ownerOf(assetIds[i]);
                const randomAcc = Math.floor(Math.random() * 10);

                await token.transferFrom(
                    owner,
                    accounts[randomAcc],
                    assetIds[i],
                    { from: owner }
                );
            }

            for (let i = 0; i < totalAssets; i++) {
                const owner = await token.ownerOf(assetIds[i]);
                const randomAcc = Math.floor(Math.random() * 10);

                await token.transferFrom(
                    owner,
                    accounts[randomAcc],
                    assetIds[i],
                    { from: owner }
                );
            }

            for (let i = totalAssets - 1; i >= 0; i--) {
                const owner = await token.ownerOf(assetIds[i]);
                const randomAcc = Math.floor(Math.random() * 10);

                await token.transferFrom(
                    owner,
                    accounts[randomAcc],
                    assetIds[i],
                    { from: owner }
                );
            }
        });
    });
});
