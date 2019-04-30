pragma solidity ^0.5.6;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/SafeMath.sol";
import "../../contracts/test_utils/SafeMathMock.sol";


contract SafeMathTest {
    using SafeMath for uint256;

    SafeMathMock safeMath;

    constructor() public {
        safeMath = new SafeMathMock();
    }

    function testAdd() external {
        Assert.equal(uint256(0).add(0), 0, "");
        Assert.equal(uint256(1).add(0), 1, "");
        Assert.equal(uint256(0).add(1), 1, "");
        Assert.equal(uint256(1).add(1), 2, "");

        // Overflow tests
        bool success;
        (success,) = address(safeMath).call(
            abi.encodeWithSelector(
                safeMath.add.selector,
                2 ** 255,
                2 ** 255
            )
        );

        Assert.isFalse(success, "Call should fail");

        (success,) = address(safeMath).call(
            abi.encodeWithSelector(
                safeMath.add.selector,
                0 - 1,
                1
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testSub() external {
        Assert.equal(uint256(0).sub(0), 0, "");
        Assert.equal(uint256(1).sub(0), 1, "");
        Assert.equal(uint256(1).sub(1), 0, "");

        // Underflow tests
        bool success;
        (success,) = address(safeMath).call(
            abi.encodeWithSelector(
                safeMath.sub.selector,
                0,
                1
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testMult() external {
        Assert.equal(uint256(0).mult(1234), 0, "");
        Assert.equal(uint256(1234).mult(0), 0, "");
        Assert.equal(uint256(0).mult(0), 0, "");
        Assert.equal(uint256(20).mult(10), 200, "");
        Assert.equal(uint256(10).mult(20), 200, "");

        // Overflow tests
        bool success;
        (success,) = address(safeMath).call(
            abi.encodeWithSelector(
                safeMath.mult.selector,
                0 - 1,
                0 - 1
            )
        );

        Assert.isFalse(success, "Call should fail");
    }
}
