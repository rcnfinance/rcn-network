const { expect } = require("chai");

describe('Test BytesUtils', function () {
  let signedMath;

  before('Create contracts', async function () {
    TestSignedMath = await ethers.getContractFactory("TestSignedMath");
    signedMath = await TestSignedMath.deploy();
  });

  it('Function min', async function () {
    expect(await signedMath.min(0, 0)).to.equal(0);
    expect(await signedMath.min(-1, 0)).to.equal(-1);
    expect(await signedMath.min(0, -1)).to.equal(-1);
    expect(await signedMath.min(1, 0)).to.equal(0);
    expect(await signedMath.min(0, 1)).to.equal(0);
  });

  it('Function max', async function () {
    expect(await signedMath.max(0, 0)).to.equal(0);
    expect(await signedMath.max(-1, 0)).to.equal(0);
    expect(await signedMath.max(0, -1)).to.equal(0);
    expect(await signedMath.max(1, 0)).to.equal(1);
    expect(await signedMath.max(0, 1)).to.equal(1);
  });
});
