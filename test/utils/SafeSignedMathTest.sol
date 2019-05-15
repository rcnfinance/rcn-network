pragma solidity ^0.5.6;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/SafeSignedMath.sol";
import "../../contracts/test_utils/SafeSignedMathMock.sol";


contract SafeSignedMathTest {
    using SafeSignedMath for int256;

    SafeSignedMathMock safeSignedMath;

    constructor() public {
        safeSignedMath = new SafeSignedMathMock();
    }

    function testAbs() external {
        Assert.equal(int256(1000).abs(), 1000, "");
        Assert.equal(int256(-1234).abs(), 1234, "");
        Assert.equal(int256(0).abs(), 0, "");
    }

    function testAdd() external {
        Assert.equal(int256(1000).add(234), 1234, "");
        Assert.equal(int256(1234).add(-234), 1000, "");
        Assert.equal(int256(0).add(123), 123, "");
        Assert.equal(int256(123).add(0), 123, "");
        Assert.equal(int256(0).add(-123), -123, "");
        Assert.equal(int256(-123).add(0), -123, "");

        // Overflow tests
        bool success;
        (success,) = address(safeSignedMath).call(
            abi.encodeWithSelector(
                safeSignedMath.add.selector,
                int256(((2 ** 256) / 2) - 1),
                int256(((2 ** 256) / 2) - 1)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testSub() external {
        Assert.equal(int256(1234).sub(234), 1000, "");
        Assert.equal(int256(1000).sub(-234), 1234, "");
        Assert.equal(int256(0).sub(123), -123, "");
        Assert.equal(int256(123).sub(0), 123, "");
        Assert.equal(int256(0).sub(-123), 123, "");
        Assert.equal(int256(-123).sub(0), -123, "");

        // Underflow tests
        bool success;
        (success,) = address(safeSignedMath).call(
            abi.encodeWithSelector(
                safeSignedMath.sub.selector,
                int256((2 ** 256) / 2),
                int256(1)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testMul() external {
        Assert.equal(int256(0).mul(1234), 0, "");
        Assert.equal(int256(1234).mul(0), 0, "");
        Assert.equal(int256(20).mul(10), 200, "");
        Assert.equal(int256(-20).mul(10), -200, "");
        Assert.equal(int256(10).mul(-20), -200, "");
        Assert.equal(int256(-10).mul(-20), 200, "");

        // Overflow tests
        bool success;
        (success,) = address(safeSignedMath).call(
            abi.encodeWithSelector(
                safeSignedMath.mul.selector,
                int256(((2 ** 256) / 2) - 1),
                int256(((2 ** 256) / 2) - 1)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testDiv() external {
        Assert.equal(int256(0).div(1234), 0, "");
        Assert.equal(int256(10).div(3), 3, "");
        Assert.equal(int256(10).div(10), 1, "");

        // Zero div tests
        bool success;
        (success,) = address(safeSignedMath).call(
            abi.encodeWithSelector(
                safeSignedMath.div.selector,
                int256(0),
                int256(0)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testMulDiv() external {
        Assert.equal(int256(0).muldiv(20, 3), 0, "");
        Assert.equal(int256(20).muldiv(0, 3), 0, "");
        Assert.equal(int256(34).muldiv(13, 3), 147, "");
        Assert.equal(int256(10).muldiv(20, 5), 40, "");
        Assert.equal(int256(10).muldiv(10, 3), 33, "");
        Assert.equal(int256(20).muldiv(10, 3), 66, "");
        Assert.equal(int256(30).muldiv(30, 31), 29, "");
        Assert.equal(int256(30).muldiv(32, 31), 30, "");
        Assert.equal(int256(32).muldiv(32, 31), 33, "");

        // Zero div tests
        bool success;
        (success,) = address(safeSignedMath).call(
            abi.encodeWithSelector(
                safeSignedMath.muldiv.selector,
                int256(0),
                int256(0),
                int256(0)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }
}
