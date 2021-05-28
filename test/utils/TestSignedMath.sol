pragma solidity ^0.8.0;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/SignedMath.sol";


contract TestSignedMath {
    using SignedMath for int256;

    function testMin() external {
        // min(int256,int256)
        Assert.equal(int256(0).min(0), 0, "");
        Assert.equal(int256(-1).min(0), -1, "");
        Assert.equal(int256(0).min(-1), -1, "");
        Assert.equal(int256(1).min(0), 0, "");
        Assert.equal(int256(0).min(1), 0, "");
    }

    function testMax() external {
        // max(int256,int256)
        Assert.equal(int256(0).max(0), 0, "");
        Assert.equal(int256(-1).max(0), 0, "");
        Assert.equal(int256(0).max(-1), 0, "");
        Assert.equal(int256(1).max(0), 1, "");
        Assert.equal(int256(0).max(1), 1, "");
    }
}
