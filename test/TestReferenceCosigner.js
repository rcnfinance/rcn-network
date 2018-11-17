const ReferenceCosigner = artifacts.require('./examples/ReferenceCosigner.sol');
const Helper = require('./Helper.js');

contract('ReferenceCosigner', function (accounts) {
    const owner = accounts[0];

    before('Create contracts', async function () {
        cosigner = await ReferenceCosigner.new({ from: owner });
    });

    it('', async () => {
    });
});
