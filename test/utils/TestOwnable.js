const Ownable = artifacts.require('../utils/Ownable.sol');
const Helper = require('../Helper.js');

require('chai')
    .should();

contract('Ownable', function (accounts) {
    it('Should change owner on transfer', async function () {
        const ownable = await Ownable.new();
        (await ownable.owner()).should.be.equal(accounts[0]);
        await ownable.transferTo(accounts[2]);
        (await ownable.owner()).should.be.equal(accounts[2]);
    });

    it('Should revert if try to transfer to 0x0', async function () {
        const ownable = await Ownable.new();
        await Helper.assertThrow(ownable.transferTo(Helper.address0x));
        (await ownable.owner()).should.be.equal(accounts[0]);
    });

    it('Should revert if another account tries to transfer', async function () {
        const ownable = await Ownable.new();
        await Helper.assertThrow(ownable.transferTo(accounts[3], { from: accounts[3] }));
        await Helper.assertThrow(ownable.transferTo(accounts[4], { from: accounts[3] }));
        (await ownable.owner()).should.be.equal(accounts[0]);
    });

    it('Should be creator with caller as owner', async function () {
        const ownable = await Ownable.new({ from: accounts[7] });
        (await ownable.owner()).should.be.equal(accounts[7]);
    });
});
