pragma solidity ^0.5.11;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/SafeMath.sol";


contract TestSafeMathMock {
    using SafeMath for uint256;

    function add(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.add(b);
    }

    function sub(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.sub(b);
    }

    function mult(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.mult(b);
    }

    function div(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.div(b);
    }
}


contract TestSafeMath {
    using SafeMath for uint256;

    TestSafeMathMock safeMath;

    constructor() public {
        safeMath = new TestSafeMathMock();
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

    function testDiv() external {
        Assert.equal(uint256(0).div(1234), 0, "");
        Assert.equal(uint256(10).div(3), 3, "");
        Assert.equal(uint256(10).div(10), 1, "");

        // Zero div tests
        bool success;
        (success,) = address(safeMath).call(
            abi.encodeWithSelector(
                safeMath.div.selector,
                0,
                0
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testMultDiv() external {
        Assert.equal(uint256(0).multdiv(20, 3), 0, "");
        Assert.equal(uint256(20).multdiv(0, 3), 0, "");
        Assert.equal(uint256(34).multdiv(13, 3), 147, "");
        Assert.equal(uint256(10).multdiv(20, 5), 40, "");
        Assert.equal(uint256(10).multdiv(10, 3), 33, "");
        Assert.equal(uint256(20).multdiv(10, 3), 66, "");
        Assert.equal(uint256(30).multdiv(30, 31), 29, "");
        Assert.equal(uint256(30).multdiv(32, 31), 30, "");
        Assert.equal(uint256(32).multdiv(32, 31), 33, "");

        // Zero div tests
        bool success;
        (success,) = address(safeMath).call(
            abi.encodeWithSelector(
                safeMath.div.selector,
                0,
                0
            )
        );

        Assert.isFalse(success, "Call should fail");
    }
}
