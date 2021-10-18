const TestSignedMath = artifacts.require('TestSignedMath');

contract('Test BytesUtils', function ([_]) {
  let signedMath;

  before('Create contracts', async function () {
    signedMath = await TestSignedMath.new();
  });

  it('Function min', async function () {
    assert.equal(await signedMath.min(0, 0), 0);
    assert.equal(await signedMath.min(-1, 0), -1);
    assert.equal(await signedMath.min(0, -1), -1);
    assert.equal(await signedMath.min(1, 0), 0);
    assert.equal(await signedMath.min(0, 1), 0);
  });

  it('Function max', async function () {
    assert.equal(await signedMath.max(0, 0), 0);
    assert.equal(await signedMath.max(-1, 0), 0);
    assert.equal(await signedMath.max(0, -1), 0);
    assert.equal(await signedMath.max(1, 0), 1);
    assert.equal(await signedMath.max(0, 1), 1);
  });
});
