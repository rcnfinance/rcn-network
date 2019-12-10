const Ownable = artifacts.require('Ownable');

const {
    address0x,
    toEvents,
    tryCatchRevert,
} = require('../Helper.js');

contract('Ownable', function (accounts) {
    const owner = accounts[1];
    const secondOwner = accounts[2];
    const thirdOwner = accounts[3];

    describe('Constructor', function () {
        it('ConstructorShould be creator with caller as owner', async function () {
            const ownable = await Ownable.new({ from: accounts[7] });
            assert.equal(await ownable.owner(), accounts[7]);
        });
    });

    describe('Function transferOwnership', function () {
        it('Should change owner on transfer', async function () {
            const ownable = await Ownable.new({ from: owner });

            const OwnershipTransferred = await toEvents(
                ownable.transferOwnership(
                    secondOwner,
                    { from: owner }
                ),
                'OwnershipTransferred'
            );

            assert.equal(OwnershipTransferred._previousOwner, owner);
            assert.equal(OwnershipTransferred._newOwner, secondOwner);

            assert.equal(await ownable.owner(), secondOwner);
        });

        it('Try to transfer ownership to 0x0', async function () {
            const ownable = await Ownable.new({ from: owner });

            await tryCatchRevert(
                () => ownable.transferOwnership(
                    address0x,
                    { from: owner }
                ),
                '0x0 Is not a valid owner'
            );

            assert.equal(await ownable.owner(), owner);
        });

        // modifier onlyOwner
        it('Should revert if account without ownership tries to transfer', async function () {
            const ownable = await Ownable.new({ from: owner });

            await tryCatchRevert(
                () => ownable.transferOwnership(
                    secondOwner,
                    { from: secondOwner }
                ),
                'The owner should be the sender'
            );

            await tryCatchRevert(
                () => ownable.transferOwnership(
                    thirdOwner,
                    { from: secondOwner }
                ),
                'The owner should be the sender'
            );

            assert.equal(await ownable.owner(), owner);

            await ownable.transferOwnership(secondOwner, { from: owner });

            await tryCatchRevert(
                () => ownable.transferOwnership(
                    secondOwner,
                    { from: owner }
                ),
                'The owner should be the sender'
            );

            assert.equal(await ownable.owner(), secondOwner);
        });
    });
});
