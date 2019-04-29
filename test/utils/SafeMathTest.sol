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

    function testDivCeil() external {
        Assert.equal(uint256(0).divceil(1234), 0, "");
        Assert.equal(uint256(10).divceil(3), 4, "");
        Assert.equal(uint256(10).divceil(10), 1, "");

        // Zero div tests
        bool success;
        (success,) = address(safeMath).call(
            abi.encodeWithSelector(
                safeMath.divceil.selector,
                0,
                0
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testMultDivCeil() external {
        Assert.equal(uint256(0).multdivceil(20, 3), 0, "");
        Assert.equal(uint256(20).multdivceil(0, 3), 0, "");
        Assert.equal(uint256(34).multdivceil(13, 3), 148, "");
        Assert.equal(uint256(10).multdivceil(20, 5), 40, "");
        Assert.equal(uint256(10).multdivceil(10, 3), 34, "");
        Assert.equal(uint256(20).multdivceil(10, 3), 67, "");
        Assert.equal(uint256(30).multdivceil(30, 31), 30, "");
        Assert.equal(uint256(30).multdivceil(32, 31), 31, "");
        Assert.equal(uint256(32).multdivceil(32, 31), 34, "");
    }
}
