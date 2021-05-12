pragma solidity ^0.8.4;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/Math.sol";


contract TestMath {
    using Math for int256;
    using Math for uint256;

    function testMin() external {
        // min(int256,int256)
        Assert.equal(int256(0).min(0), 0, "");
        Assert.equal(int256(-1).min(0), -1, "");
        Assert.equal(int256(0).min(-1), -1, "");
        Assert.equal(int256(1).min(0), 0, "");
        Assert.equal(int256(0).min(1), 0, "");

        // min(uint256,uint256)
        Assert.equal(uint256(0).min(0), 0, "");
        Assert.equal(uint256(1).min(0), 0, "");
        Assert.equal(uint256(0).min(1), 0, "");
    }

    function testMax() external {
        // max(int256,int256)
        Assert.equal(int256(0).max(0), 0, "");
        Assert.equal(int256(-1).max(0), 0, "");
        Assert.equal(int256(0).max(-1), 0, "");
        Assert.equal(int256(1).max(0), 1, "");
        Assert.equal(int256(0).max(1), 1, "");

        // max(uint256,uint256)
        Assert.equal(uint256(0).max(0), 0, "");
        Assert.equal(uint256(1).max(0), 1, "");
        Assert.equal(uint256(0).max(1), 1, "");
    }
}
