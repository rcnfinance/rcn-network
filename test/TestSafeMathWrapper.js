const BigNumber = web3.BigNumber;
const SafeMathMock = artifacts.require('SafeMathWrapperMock');

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('SafeMathWrapper', function () {
  const MAX_UINT = new BigNumber(2).pow(256).minus(1);

  beforeEach(async function () {
    this.safeMath = await SafeMathMock.new();
  });

  describe('add', function () {
    
    it('adds correctly', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(1234);

      (await this.safeMath.add(a, b)).should.equal(true);

    });

    it('throws a revert error on addition overflow', async function () {
      const a = MAX_UINT;
      const b = new BigNumber(1);

      (await this.safeMath.add(a, b)).should.equal(false);

    });
  });

  describe('sub', function () {
    it('subtracts correctly', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(1234);

      (await this.safeMath.sub(a, b)).should.equal(true);
    });

    it('throws a revert error if subtraction result would be negative', async function () {
      const a = new BigNumber(1234);
      const b = new BigNumber(5678);

      (await this.safeMath.sub(a, b)).should.equal(false);
    });
  });

  describe('mul', function () {
    it('multiplies correctly', async function () {
      const a = new BigNumber(1234);
      const b = new BigNumber(5678);

      (await this.safeMath.mul(a, b)).should.equal(true);
    });

    it('handles a zero product correctly', async function () {
      const a = new BigNumber(0);
      const b = new BigNumber(5678);

      (await this.safeMath.mul(a, b)).should.equal(true);
    });

    it('throws a revert error on multiplication overflow', async function () {
      const a = MAX_UINT;
      const b = new BigNumber(2);

      (await this.safeMath.mul(a, b)).should.equal(false);
    });
  });

  describe('div', function () {
    it('divides correctly', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(5678);

      (await this.safeMath.div(a, b)).should.equal(true);
    });

    it('throws a revert error on zero division', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(0);

      (await this.safeMath.div(a, b)).should.equal(false);
    });
  });

  describe('chain operation', function () {
    it('chain operations correctly', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(5678);

      (await this.safeMath.chainOperations(a, b)).should.equal(true);
    });

    it('change status without revert error on operations', async function () {
      
      const a = new BigNumber(5678);
      const b = new BigNumber(0);

      (await this.safeMath.chainOperations(a, b)).should.equal(false);

      const c = MAX_UINT;
      const d = new BigNumber(2);

      (await this.safeMath.chainOperations(c, d)).should.equal(false);

      const e = new BigNumber(1234);
      const f = new BigNumber(5678);

      (await this.safeMath.chainOperations(e, f)).should.equal(false);

    });
  });


});