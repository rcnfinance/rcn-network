pragma solidity ^0.5.6;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/SafeCast.sol";


contract TestSafeCastMock {
    using SafeCast for uint256;
    using SafeCast for int256;

    function toUint128(uint256 x) external returns (uint128) {
        return x.toUint128();
    }

    function toUint256(int256 x) external returns (uint256) {
        return x.toUint256();
    }

    function toInt256(uint256 x) external returns (int256) {
        return x.toInt256();
    }
}


contract TestSafeCast {
    using SafeCast for uint256;
    using SafeCast for int256;

    TestSafeCastMock safeCast;

    bytes32 minUint256 = 0x0000000000000000000000000000000000000000000000000000000000000000;
    bytes32 maxUint256 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    bytes32 maxUint128InUint256 = 0x00000000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
    bytes32 overflowUint128InUint256 = 0x0000000000000000000000000000000100000000000000000000000000000000;

    bytes32 minInt256 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
    bytes32 zeroInt256 = 0x0000000000000000000000000000000000000000000000000000000000000000;
    bytes32 signedOneInt256 = 0x8000000000000000000000000000000000000000000000000000000000000000;
    bytes32 maxInt256 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    constructor() public {
        safeCast = new TestSafeCastMock();
    }

    function testToUint128() external {
        require(uint256(minUint256).toUint128() == uint128(0));
        require(uint256(maxUint128InUint256).toUint128() == uint128((2 ** 128) - 1));
        require(uint256(62).toUint128() == uint128(62));

        // Overflow cast tests
        bool success;
        (success,) = address(safeCast).call(
            abi.encodeWithSelector(
                safeCast.toUint128.selector,
                uint256(overflowUint128InUint256)
            )
        );

        Assert.isFalse(success, "Call should fail");

        (success,) = address(safeCast).call(
            abi.encodeWithSelector(
                safeCast.toUint256.selector,
                int256(maxUint256)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testToUint256() external {
        Assert.equal(int256(zeroInt256).toUint256(), 0, "");
        Assert.equal(int256(maxInt256).toUint256(), (2 ** 255) - 1, "");
        Assert.equal(int256(62).toUint256(), 62, "");

        // Overflow cast tests
        bool success;
        (success,) = address(safeCast).call(
            abi.encodeWithSelector(
                safeCast.toUint256.selector,
                int256(minInt256)
            )
        );

        Assert.isFalse(success, "Call should fail");

        (success,) = address(safeCast).call(
            abi.encodeWithSelector(
                safeCast.toUint256.selector,
                int256(signedOneInt256)
            )
        );

        Assert.isFalse(success, "Call should fail");

        (success,) = address(safeCast).call(
            abi.encodeWithSelector(
                safeCast.toUint256.selector,
                int256(-25648)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testToInt256() external {
        Assert.equal(uint256(minUint256).toInt256(), 0, "");
        Assert.equal(uint256(maxInt256).toInt256(), (2 ** 255) - 1, "");
        Assert.equal(uint256(62).toInt256(), 62, "");

        // Overflow cast tests
        bool success;
        (success,) = address(safeCast).call(
            abi.encodeWithSelector(
                safeCast.toInt256.selector,
                int256(minInt256)
            )
        );

        Assert.isFalse(success, "Call should fail");

        (success,) = address(safeCast).call(
            abi.encodeWithSelector(
                safeCast.toInt256.selector,
                int256(signedOneInt256)
            )
        );

        Assert.isFalse(success, "Call should fail");

        (success,) = address(safeCast).call(
            abi.encodeWithSelector(
                safeCast.toInt256.selector,
                int256(-25648)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }
}
