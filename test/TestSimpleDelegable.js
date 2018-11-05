const SimpleDelegable = artifacts.require("./utils/SimpleDelegable.sol");
const Helper = require('./Helper.js');

contract('SimpleDelegable', function(accounts) {
    it("Should add delegates", async function(){
        const delegable = await SimpleDelegable.new();
        await delegable.addDelegate(accounts[2]);
        await delegable.addDelegate(accounts[4]);
        assert.equal(true, await delegable.isDelegate(accounts[2]));
        assert.equal(true, await delegable.isDelegate(accounts[4]));
    });
    it("Should remove delegates", async function(){
        const delegable = await SimpleDelegable.new();
        await delegable.addDelegate(accounts[2]);
        await delegable.addDelegate(accounts[4]);
        await delegable.removeDelegate(accounts[2]);
        assert.equal(false, await delegable.isDelegate(accounts[2]));
        assert.equal(true, await delegable.isDelegate(accounts[4]));
    });
    it("Only owner should add delegates", async function() {
        const delegable = await SimpleDelegable.new({ from: accounts[3] });
        await Helper.assertThrow(delegable.addDelegate(accounts[2]));
        await Helper.assertThrow(delegable.addDelegate(accounts[3]));
        await Helper.assertThrow(delegable.addDelegate(accounts[0]));
        assert.equal(false, await delegable.isDelegate(accounts[2]));
        assert.equal(false, await delegable.isDelegate(accounts[3]));
        assert.equal(false, await delegable.isDelegate(accounts[0]));
    });
    it("Only owner should remove delegates", async function() {
        const delegable = await SimpleDelegable.new({ from: accounts[3] });
        await delegable.addDelegate(accounts[2], { from: accounts[3] });
        await Helper.assertThrow(delegable.removeDelegate(accounts[2]));
        await Helper.assertThrow(delegable.removeDelegate(accounts[0]));
        assert.equal(true, await delegable.isDelegate(accounts[2]));
    });
})