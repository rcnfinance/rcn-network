const SimpleDelegable = artifacts.require("../utils/SimpleDelegable.sol");
const Helper = require('../Helper.js');

require('chai')
    .should();

contract('SimpleDelegable', function(accounts) {
    it("Should add delegates", async function(){
        const delegable = await SimpleDelegable.new();
        await delegable.addDelegate(accounts[2]);
        await delegable.addDelegate(accounts[4]);
        (await delegable.isDelegate(accounts[2])).should.be.equal(true);
        (await delegable.isDelegate(accounts[4])).should.be.equal(true);
    });
    it("Should remove delegates", async function(){
        const delegable = await SimpleDelegable.new();
        await delegable.addDelegate(accounts[2]);
        await delegable.addDelegate(accounts[4]);
        await delegable.removeDelegate(accounts[2]);
        (await delegable.isDelegate(accounts[2])).should.be.equal(false);
        (await delegable.isDelegate(accounts[4])).should.be.equal(true);
    });
    it("Only owner should add delegates", async function() {
        const delegable = await SimpleDelegable.new({ from: accounts[3] });
        await Helper.assertThrow(delegable.addDelegate(accounts[2]));
        await Helper.assertThrow(delegable.addDelegate(accounts[3]));
        await Helper.assertThrow(delegable.addDelegate(accounts[0]));
        (await delegable.isDelegate(accounts[2])).should.be.equal(false);
        (await delegable.isDelegate(accounts[3])).should.be.equal(false);
        (await delegable.isDelegate(accounts[0])).should.be.equal(false);
    });
    it("Only owner should remove delegates", async function() {
        const delegable = await SimpleDelegable.new({ from: accounts[3] });
        await delegable.addDelegate(accounts[2], { from: accounts[3] });
        await Helper.assertThrow(delegable.removeDelegate(accounts[2]));
        await Helper.assertThrow(delegable.removeDelegate(accounts[0]));
        (await delegable.isDelegate(accounts[2])).should.be.equal(true);
    });
})