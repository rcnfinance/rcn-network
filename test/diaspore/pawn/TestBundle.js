const TestERC721 = artifacts.require('./utils/test/TestERC721.sol');

const Bundle = artifacts.require('./diaspore/cosigner/pawn/Bundle.sol');

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

contract('TestBundle', function (accounts) {
    const user = accounts[1];
    const user2 = accounts[2];
    const beneficiary = accounts[3];

    let bundle;
    let erc721;

    const ERC721S = 0;
    const ERC721IDS = 1;

    before('Create the bundle contract', async function () {
        bundle = await Bundle.new();
        erc721 = await TestERC721.new();
    });

    async function generateERC721 (_erc721, to) {
        const assetId = bn(web3.utils.randomHex(32));
        await _erc721.generate(assetId, to);
        await _erc721.approve(bundle.address, assetId, { from: to });
        return assetId;
    };

    describe('Function create', function () {
        it('Should create a new package', async function () {
            const prevPackageLength = await bundle.packageLength();
            const Created = await Helper.toEvents(
                bundle.create(
                    { from: user }
                ),
                'Created'
            );

            assert.equal(Created._owner, user);
            expect(Created._packageId).to.eq.BN(dec(await bundle.packageLength()));

            const content = await bundle.content(Created._packageId);

            assert.isEmpty(content[ERC721S]);
            assert.isEmpty(content[ERC721IDS]);

            expect(await bundle.packageLength()).to.eq.BN(inc(prevPackageLength));
            assert.equal(await bundle.ownerOf(Created._packageId), user);
        });
    });

    describe('Reject assets sending by safeTransferFrom', function () {
        it('Try receive an erc721(legacy)', async function () {
            const assetId = await generateERC721(erc721, user);

            await Helper.tryCatchRevert(
                () => erc721.methods['safeTransferFrom(address,address,uint256)'](
                    user,
                    bundle.address,
                    assetId,
                    { from: user }
                ),
                'Contract rejected the token'
            );

            assert.equal(await erc721.ownerOf(assetId), user);
        });

        it('Try receive an erc721', async function () {
            const assetId = await generateERC721(erc721, user);

            await Helper.tryCatchRevert(
                () => erc721.methods['safeTransferFrom(address,address,uint256,bytes)'](
                    user,
                    bundle.address,
                    assetId,
                    '0x123456789a',
                    { from: user }
                ),
                'Contract rejected the token'
            );

            assert.equal(await erc721.ownerOf(assetId), user);
        });
    });

    describe('Function _deposit and deposit', function () {
        it('Should deposit an asset', async function () {
            const assetId = await generateERC721(erc721, user);
            const prevPackageLength = await bundle.packageLength();

            const events = await Helper.toEvents(
                bundle.deposit(
                    '0',
                    erc721.address,
                    assetId,
                    { from: user }
                ),
                'Created',
                'Deposit'
            );

            const Created = events[0];
            assert.equal(Created._owner, user);
            expect(Created._packageId).to.eq.BN(dec(await bundle.packageLength()));

            const Deposit = events[1];
            assert.equal(Deposit._sender, user);
            expect(Deposit._packageId).to.eq.BN(dec(await bundle.packageLength()));
            assert.equal(Deposit._erc721, erc721.address);
            expect(Deposit._erc721Id).to.eq.BN(assetId);

            const content = await bundle.content(Created._packageId);

            assert.equal(content[ERC721S].length, 1);
            assert.equal(content[ERC721IDS].length, 1);
            expect(await bundle.getPackageOrder(Created._packageId, erc721.address, assetId)).to.eq.BN('0');

            expect(await bundle.packageLength()).to.eq.BN(inc(prevPackageLength));
            assert.equal(await bundle.ownerOf(Created._packageId), user);
            assert.equal(await erc721.ownerOf(assetId), bundle.address);
        });

        it('Should deposit an asset in a created package', async function () {
            const assetId = await generateERC721(erc721, user);
            const packageId = (await Helper.toEvents(bundle.create({ from: user }), 'Created'))._packageId;

            const prevPackageLength = await bundle.packageLength();

            const Deposit = await Helper.toEvents(
                bundle.deposit(
                    packageId,
                    erc721.address,
                    assetId,
                    { from: user }
                ),
                'Deposit'
            );

            assert.equal(Deposit._sender, user);
            expect(Deposit._packageId).to.eq.BN(dec(await bundle.packageLength()));
            assert.equal(Deposit._erc721, erc721.address);
            expect(Deposit._erc721Id).to.eq.BN(assetId);

            const content = await bundle.content(packageId);

            assert.equal(content[ERC721S].length, 1);
            assert.equal(content[ERC721IDS].length, 1);
            expect(await bundle.getPackageOrder(packageId, erc721.address, assetId)).to.eq.BN('0');

            expect(await bundle.packageLength()).to.eq.BN(prevPackageLength);
            assert.equal(await bundle.ownerOf(packageId), user);
            assert.equal(await erc721.ownerOf(assetId), bundle.address);
        });

        it('Try deposit an erc721 without authorization', async function () {
            const assetId = await generateERC721(erc721, user);
            const packageId = (await Helper.toEvents(bundle.create({ from: user }), 'Created'))._packageId;

            await Helper.tryCatchRevert(
                () => bundle.deposit(
                    packageId,
                    erc721.address,
                    assetId,
                    { from: user2 }
                ),
                'Not authorized for deposit'
            );

            assert.equal(await erc721.ownerOf(assetId), user);
        });
    });

    describe('Function depositBatch', function () {
        it('Should deposit a batch of assets', async function () {
            const batchLength = 5;
            const erc721s = [];
            const erc721Ids = [];
            for (let i = 0; i < batchLength; i++) {
                erc721s.push(erc721);
                erc721Ids.push(await generateERC721(erc721, user));
            }
            const prevPackageLength = await bundle.packageLength();

            const events = await Helper.toEvents(
                bundle.depositBatch(
                    '0',
                    erc721s.map(x => x.address),
                    erc721Ids,
                    { from: user }
                ),
                'Created',
                'Deposit'
            );

            const Created = events[0];
            assert.equal(Created._owner, user);
            expect(Created._packageId).to.eq.BN(dec(await bundle.packageLength()));

            const packageId = dec(await bundle.packageLength());
            const Deposits = events.slice(1);
            assert.equal(Deposits.length, batchLength);
            for (let i = 0; i < batchLength; i++) {
                expect(Deposits[i]._packageId).to.eq.BN(packageId);
                assert.equal(Deposits[i]._erc721, erc721s[i].address);
                expect(Deposits[i]._erc721Id).to.eq.BN(erc721Ids[i]);
            }

            const content = await bundle.content(packageId);
            assert.equal(content[ERC721S].length, batchLength);
            assert.equal(content[ERC721IDS].length, batchLength);
            for (let i = 0; i < batchLength; i++) {
                expect(await bundle.getPackageOrder(packageId, erc721s[i].address, erc721Ids[i])).to.eq.BN(i);
            }

            expect(await bundle.packageLength()).to.eq.BN(inc(prevPackageLength));
            assert.equal(await bundle.ownerOf(packageId), user);
            for (let i = 0; i < erc721s.length; i++) {
                assert.equal(await erc721s[i].ownerOf(erc721Ids[i]), bundle.address);
            }
        });

        it('Should deposit an asset in a created package', async function () {
            const packageId = (await Helper.toEvents(bundle.create({ from: user }), 'Created'))._packageId;
            const batchLength = 5;
            const erc721s = [];
            const erc721Ids = [];
            for (let i = 0; i < batchLength; i++) {
                erc721s.push(erc721);
                erc721Ids.push(await generateERC721(erc721, user));
            }
            const prevPackageLength = await bundle.packageLength();

            const Deposits = await Helper.toEvents(
                bundle.depositBatch(
                    packageId,
                    erc721s.map(x => x.address),
                    erc721Ids,
                    { from: user }
                ),
                'Deposit'
            );

            assert.equal(Deposits.length, batchLength);
            for (let i = 0; i < batchLength; i++) {
                expect(Deposits[i]._packageId).to.eq.BN(packageId);
                assert.equal(Deposits[i]._erc721, erc721s[i].address);
                expect(Deposits[i]._erc721Id).to.eq.BN(erc721Ids[i]);
            }

            const content = await bundle.content(packageId);
            assert.equal(content[ERC721S].length, batchLength);
            assert.equal(content[ERC721IDS].length, batchLength);
            for (let i = 0; i < batchLength; i++) {
                expect(await bundle.getPackageOrder(packageId, erc721s[i].address, erc721Ids[i])).to.eq.BN(i);
            }

            expect(await bundle.packageLength()).to.eq.BN(prevPackageLength);
            assert.equal(await bundle.ownerOf(packageId), user);
            for (let i = 0; i < erc721s.length; i++) {
                assert.equal(await erc721s[i].ownerOf(erc721Ids[i]), bundle.address);
            }
        });

        it('Try deposit with erc721 array and erc721Ids array with different length', async function () {
            const assetId = await generateERC721(erc721, user);
            await Helper.tryCatchRevert(
                () => bundle.depositBatch(
                    '0',
                    [],
                    [assetId],
                    { from: user }
                ),
                'The _erc721s length and _erc721Ids length must be equal'
            );
        });
    });

    describe('Function _withdraw, withdraw and _remove', function () {
        it('Should withdraw an asset', async function () {
            const batchLength = 5;
            const erc721s = [];
            const erc721Ids = [];
            for (let i = 0; i < batchLength; i++) {
                erc721s.push(erc721);
                erc721Ids.push(await generateERC721(erc721, user));
            }
            const packageId = (await Helper.toEvents(await bundle.depositBatch('0', erc721s.map(x => x.address), erc721Ids, { from: user }), 'Created'))._packageId;
            await bundle.approve(user2, packageId, { from: user });

            const Withdraw = await Helper.toEvents(
                bundle.withdraw(
                    packageId,
                    erc721s[2].address,
                    erc721Ids[2],
                    beneficiary,
                    { from: user2 }
                ),
                'Withdraw'
            );

            assert.equal(Withdraw._retriever, user2);
            assert.equal(Withdraw._beneficiary, beneficiary);
            expect(Withdraw._packageId).to.eq.BN(packageId);
            assert.equal(Withdraw._erc721, erc721s[2].address);
            expect(Withdraw._erc721Id).to.eq.BN(erc721Ids[2]);

            const content = await bundle.content(packageId);
            assert.equal(content[ERC721S].length, batchLength - 1);
            assert.equal(content[ERC721IDS].length, batchLength - 1);
            expect(await bundle.getPackageOrder(packageId, erc721s[2].address, erc721Ids[2])).to.eq.BN('0');

            expect(await bundle.getPackageOrder(packageId, erc721s[2].address, erc721Ids[2])).to.eq.BN(erc721Ids[batchLength]);

            assert.equal(await bundle.ownerOf(packageId), user);
            assert.equal(await erc721s[2].ownerOf(erc721Ids[2]), beneficiary);
        });

        it('Should withdraw an asset in last posotion', async function () {
            const assetId = await generateERC721(erc721, user);
            const packageId = (await Helper.toEvents(await bundle.deposit('0', erc721.address, assetId, { from: user }), 'Created'))._packageId;

            const Withdraw = await Helper.toEvents(
                bundle.withdraw(
                    packageId,
                    erc721.address,
                    assetId,
                    beneficiary,
                    { from: user }
                ),
                'Withdraw'
            );

            assert.equal(Withdraw._retriever, user);
            assert.equal(Withdraw._beneficiary, beneficiary);
            expect(Withdraw._packageId).to.eq.BN(packageId);
            assert.equal(Withdraw._erc721, erc721.address);
            expect(Withdraw._erc721Id).to.eq.BN(assetId);

            const content = await bundle.content(packageId);
            assert.equal(content[ERC721S].length, 0);
            assert.equal(content[ERC721S][0], null);
            assert.equal(content[ERC721IDS].length, 0);
            assert.equal(content[ERC721S][1], null);
            expect(await bundle.getPackageOrder(packageId, erc721.address, assetId)).to.eq.BN('0');

            assert.equal(await bundle.ownerOf(packageId), user);
            assert.equal(await erc721.ownerOf(assetId), beneficiary);
        });

        it('Try withdraw an asset of inexist package', async function () {
            const packageId = (await Helper.toEvents(await bundle.deposit('0', erc721.address, await generateERC721(erc721, user), { from: user }), 'Created'))._packageId;

            await Helper.tryCatchRevert(
                () => bundle.withdraw(
                    packageId,
                    erc721.address,
                    '0',
                    beneficiary,
                    { from: user }
                ),
                'The package dont has the asset'
            );
        });
    });

    describe('Function withdrawBatch', function () {
        it('Should withdraw a batch of assets', async function () {
            const batchLength = 5;
            const erc721s = [];
            const erc721Ids = [];
            for (let i = 0; i < batchLength; i++) {
                erc721s.push(erc721);
                erc721Ids.push(await generateERC721(erc721, user));
            }
            const packageId = (await Helper.toEvents(await bundle.depositBatch('0', erc721s.map(x => x.address), erc721Ids, { from: user }), 'Created'))._packageId;

            const withdraws = await Helper.toEvents(
                bundle.withdrawBatch(
                    packageId,
                    [erc721s[0].address, erc721s[1].address],
                    [erc721Ids[0], erc721Ids[1]],
                    beneficiary,
                    { from: user }
                ),
                'Withdraw',
                'Withdraw'
            );

            for (let i = 0; i < 2; i++) {
                const Withdraw = withdraws[i];
                assert.equal(Withdraw._retriever, user);
                assert.equal(Withdraw._beneficiary, beneficiary);
                expect(Withdraw._packageId).to.eq.BN(packageId);
                assert.equal(Withdraw._erc721, erc721s[i].address);
                expect(Withdraw._erc721Id).to.eq.BN(erc721Ids[i]);
            }

            const content = await bundle.content(packageId);
            assert.equal(content[ERC721S].length, batchLength - 2);
            assert.equal(content[ERC721IDS].length, batchLength - 2);

            for (let i = 0; i < 2; i++) {
                expect(await bundle.getPackageOrder(packageId, erc721s[i].address, erc721Ids[i])).to.eq.BN('0');
                assert.equal(await erc721s[i].ownerOf(erc721Ids[i]), beneficiary);
            }
            for (let i = 2; i < batchLength; i++) {
                assert.equal(await erc721s[i].ownerOf(erc721Ids[i]), bundle.address);
            }
            assert.equal(await bundle.ownerOf(packageId), user);
        });

        it('Should withdraw a batch of assets to withdraw all assets', async function () {
            const batchLength = 5;
            const erc721s = [];
            const erc721Ids = [];
            for (let i = 0; i < batchLength; i++) {
                erc721s.push(erc721);
                erc721Ids.push(await generateERC721(erc721, user));
            }
            const packageId = (await Helper.toEvents(await bundle.depositBatch('0', erc721s.map(x => x.address), erc721Ids, { from: user }), 'Created'))._packageId;

            const withdraws = await Helper.toEvents(
                bundle.withdrawBatch(
                    packageId,
                    erc721s.map(x => x.address),
                    erc721Ids,
                    beneficiary,
                    { from: user }
                ),
                'Withdraw',
                'Withdraw',
                'Withdraw',
                'Withdraw',
                'Withdraw'
            );

            for (let i = 0; i < batchLength; i++) {
                const Withdraw = withdraws[i];
                assert.equal(Withdraw._retriever, user);
                assert.equal(Withdraw._beneficiary, beneficiary);
                expect(Withdraw._packageId).to.eq.BN(packageId);
                assert.equal(Withdraw._erc721, erc721s[i].address);
                expect(Withdraw._erc721Id).to.eq.BN(erc721Ids[i]);
            }

            const content = await bundle.content(packageId);
            assert.equal(content[ERC721S].length, 0);
            assert.equal(content[ERC721IDS].length, 0);

            for (let i = 0; i < batchLength; i++) {
                expect(await bundle.getPackageOrder(packageId, erc721s[i].address, erc721Ids[i])).to.eq.BN('0');
                assert.equal(await erc721s[i].ownerOf(erc721Ids[i]), beneficiary);
            }
            assert.equal(await bundle.ownerOf(packageId), user);
        });
    });

    describe('Function withdrawAll', function () {
        it('Should withdrawAll assets of a package with only one asset', async function () {
            const erc721Id = await generateERC721(erc721, user);
            const packageId = (await Helper.toEvents(await bundle.deposit('0', erc721.address, erc721Id, { from: user }), 'Created'))._packageId;

            await bundle.withdrawAll(
                packageId,
                beneficiary,
                { from: user }
            );

            const content = await bundle.content(packageId);
            assert.equal(content[ERC721S].length, 0);
            assert.equal(content[ERC721IDS].length, 0);

            expect(await bundle.getPackageOrder(packageId, erc721.address, erc721Id)).to.eq.BN('0');
            assert.equal(await erc721.ownerOf(erc721Id), beneficiary);

            assert.equal(await bundle.ownerOf(packageId), user);
        });

        it('Should withdraw all assets', async function () {
            const batchLength = 5;
            const erc721s = [];
            const erc721Ids = [];
            for (let i = 0; i < batchLength; i++) {
                erc721s.push(erc721);
                erc721Ids.push(await generateERC721(erc721, user));
            }
            const packageId = (await Helper.toEvents(await bundle.depositBatch('0', erc721s.map(x => x.address), erc721Ids, { from: user }), 'Created'))._packageId;

            const tx = await bundle.withdrawAll(
                packageId,
                beneficiary,
                { from: user }
            );

            for (let i = batchLength - 1; i >= 0; i--) {
                const index = tx.logs.findIndex(x => x.event === 'Withdraw');
                const Withdraw = tx.logs[index].args;
                tx.logs.splice(index, 1);

                assert.equal(Withdraw._retriever, user);
                assert.equal(Withdraw._beneficiary, beneficiary);
                expect(Withdraw._packageId).to.eq.BN(packageId);
                assert.equal(Withdraw._erc721, erc721s[i].address);
                expect(Withdraw._erc721Id).to.eq.BN(erc721Ids[i]);
            }

            const content = await bundle.content(packageId);
            assert.equal(content[ERC721S].length, 0);
            assert.equal(content[ERC721IDS].length, 0);

            for (let i = 0; i < batchLength; i++) {
                expect(await bundle.getPackageOrder(packageId, erc721s[i].address, erc721Ids[i])).to.eq.BN('0');
                assert.equal(await erc721s[i].ownerOf(erc721Ids[i]), beneficiary);
            }
            assert.equal(await bundle.ownerOf(packageId), user);
        });

        it('Try withdraw assets of a empty package', async function () {
            const packageId = (await Helper.toEvents(await bundle.create({ from: user }), 'Created'))._packageId;

            await Helper.tryCatchRevert(
                () => bundle.withdrawAll(
                    packageId,
                    beneficiary,
                    { from: user }
                ),
                'The package its empty'
            );
        });
    });
});
