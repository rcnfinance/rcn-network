const Ownable = artifacts.require('../utils/Ownable.sol');
const Helper = require('../Helper.js');

contract('Ownable', function (accounts) {
    const owner = accounts[1];
    const secondOwner = accounts[2];
    const thirdOwner = accounts[3];

    it('Should change owner on transfer', async function () {
        const ownable = await Ownable.new({ from: owner });
        await ownable.transferTo(secondOwner, { from: owner });

        assert.equal(await ownable.owner(), secondOwner);
    });

    it('Should revert if try to transfer to 0x0', async function () {
        const ownable = await Ownable.new({ from: owner });

        await Helper.tryCatchRevert(
            () => ownable.transferTo(
                Helper.address0x,
                { from: owner }
            ),
            '0x0 Is not a valid owner'
        );

        assert.equal(await ownable.owner(), owner);
    });

    it('Should revert if another account tries to transfer', async function () {
        const ownable = await Ownable.new({ from: owner });

        await Helper.tryCatchRevert(
            () => ownable.transferTo(
                secondOwner,
                { from: secondOwner }
            ),
            'The owner should be the sender'
        );

        await Helper.tryCatchRevert(
            () => ownable.transferTo(
                thirdOwner,
                { from: secondOwner }
            ),
            'The owner should be the sender'
        );

        assert.equal(await ownable.owner(), owner);
    });

    it('Should be creator with caller as owner', async function () {
        const ownable = await Ownable.new({ from: accounts[7] });
        assert.equal(await ownable.owner(), accounts[7]);
    });
});
