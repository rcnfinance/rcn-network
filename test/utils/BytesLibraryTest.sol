pragma solidity ^0.5.0;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../../contracts/utils/BytesUtils.sol";

contract BytesLibraryTest {
    using Bytes for *;

    uint internal constant ZERO = uint(0);
    uint internal constant ONE = uint(1);
    uint internal constant ONES = uint(~0);

    bytes32 internal constant B32_ZERO = 0x0000000000000000000000000000000000000000000000000000000000000000;


    /* Test for bytes */
    function testBytesEqualsItselfWhenNull() external {
        bytes memory btsNull = new bytes(0);
        Assert.isTrue(btsNull.equals(btsNull), "Not equals it self is Null.");
    }

    function testBytesEqualsItself() external {
        bytes memory bts = hex"8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeffaabb";
        Assert.isTrue(bts.equals(bts), "Not equals it self.");
    }

    function testBytesEqualsCommutative() external {
        bytes memory bts1 = hex"8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeffaabb";
        bytes memory bts2 = hex"8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeffaabb";
        Assert.isTrue(bts1.equals(bts2) && bts2.equals(bts1), "This bytes are not commutative.");
    }

    function testBytesEqualsNotEqualData() external {
        bytes memory bts1 = hex"8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeffaabb";
        bytes memory bts2 = hex"8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddee8899aabbccddeeffaabbff";
        Assert.isFalse(bts1.equals(bts2), "This bytes are equals.");
    }

    function testBytesEqualsNotEqualLength() external {
        bytes memory bts1 = hex"8899aabbccddeeff8899";
        bytes memory bts2 = hex"8899aabbccddeeff88";
        Assert.isFalse(bts1.equals(bts2), "This bytes are equals lenght.");
    }

    function testBytesEqualsNotEqualCommutative() external {
        bytes memory bts1 = hex"8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeffaabb";
        bytes memory bts2 = hex"8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddeeff8899aabbccddee8899aabbccddeeffaabbff";
        Assert.isFalse(bts1.equals(bts2) && bts2.equals(bts1), "This bytes are commutative");
    }

    function testBytesBytes32ToBytesZero() external {
        bytes memory bts = B32_ZERO.toBytes();
        bytes memory btsExp = new bytes(32);
        Assert.isTrue(bts.equals(btsExp), "fail testBytesBytes32ToBytesZero");
    }

    function testBytesAddressToBytes() external {
        bytes memory bts = address(0x0123456789012345678901234567890123456789).toBytes();
        bytes memory btsExpctd = hex"0123456789012345678901234567890123456789";
        Assert.isTrue(bts.equals(btsExpctd), "fail testBytesAddressToBytes");
    }

    function testBytesUintToBytes() external {
        uint n = 0x12345678;
        bytes memory bts = n.toBytes();
        bytes memory btsExpctd = hex"0000000000000000000000000000000000000000000000000000000012345678";
        Assert.isTrue(bts.equals(btsExpctd), "fail testBytesUintToBytes");
    }

    function testBytesUintToBytesWithBitsizeZero() external {
        bytes memory bts = uint(0).toBytes(256);
        bytes memory btsExpctd = new bytes(32);
        Assert.isTrue(bts.equals(btsExpctd), "fail testBytesUintToBytesWithBitsizeZero");
    }

    function testUintToytes32Zero() external {
        bytes32 bts = uint(0).toBytes32();
        bytes32 btsExpected = bytes32(0x0);
        Assert.equal(bts, btsExpected, "fail testBytes32BytesToZero");
    }

    function testUintToBytes32Success() external {
        bytes32 bts = uint(100).toBytes32();
        Assert.equal(bts, 0x0000000000000000000000000000000000000000000000000000000000000064, "fail testUintToBytes32Success");
    }

    function testUint8ToBytes32Success() external {
        bytes32 bts = uint8(8).toBytes32();
        Assert.equal(bts, 0x0000000000000000000000000000000000000000000000000000000000000008, "fail testUint8ToBytes32Success");
    }

    function testUint24ToBytes32Success() external {
        bytes32 bts = uint24(24).toBytes32();
        Assert.equal(bts, 0x0000000000000000000000000000000000000000000000000000000000000018, "fail testUint24ToBytes32Success");
    }

    function testUint32ToBytes32Success() external {
        bytes32 bts = uint32(32).toBytes32();
        Assert.equal(bts, 0x0000000000000000000000000000000000000000000000000000000000000020, "fail testUint32ToBytes32Success");
    }

    function testUint64ToBytes32Success() external {
        bytes32 bts = uint64(64).toBytes32();
        Assert.equal(bts, 0x0000000000000000000000000000000000000000000000000000000000000040, "fail testUint64ToBytes32Success");
    }

    function testUint128ToBytes32Success() external {
        bytes32 bts = uint128(128).toBytes32();
        Assert.equal(bts, 0x0000000000000000000000000000000000000000000000000000000000000080, "fail testUint128ToBytes32Success");
    }

    function testBytesUintToBytesWithBitsize() external {
        bytes memory bts = 0x12345678.toBytes(32);
        bytes memory btsExpctd = hex"12345678";
        Assert.isTrue(bts.equals(btsExpctd), "fail testBytesUintToBytesWithBitsize");
    }

    /* Missing cases
    function testBytes32ToUint8Success() external {
        uint8 bts = uint8(8);
        uint8 btsExpected = 0x0000000000000000000000000000000000000000000000000000000000000008.toUint8();
        Assert.isTrue(bts == btsExpected, "fail testBytes32ToUint8Success");
    }

    function testBytesBytes32ToBytesLowOrder() external {
        bytes memory bts = bytes32(0x112233).toBytes();
        bytes memory btsExpctd = hex"0000000000000000000000000000000000000000000000000000000000112233";
        Assert.isTrue(bts.equals(btsExpctd), "fail testBytesBytes32ToBytesLowOrder");
    }

    function testBytesBytes32ToBytesLowOrder() external {
        bytes memory bts = bytes32(0x112233).toBytes();
        bytes memory btsExpctd = hex"0000000000000000000000000000000000000000000000000000000000112233";
        Assert.isTrue(bts.equals(btsExpctd), "fail testBytesBytes32ToBytesLowOrder");
    }

    function testBytesBytes32ToBytesHighOrder() external {
        bytes memory bts = bytes32("abc").toBytes();
        bytes memory btsExpctd = hex"6162630000000000000000000000000000000000000000000000000000000000";
        Assert.isTrue(bts.equals(btsExpctd), "fail testBytesBytes32ToBytesHighOrder");
    }

    function testBytesBytes32ToBytesWithLenHighOrder() external {
        bytes memory bts = bytes32("abc").toBytes(2);
        string memory str = "ab";
        Assert.isTrue(bts.equals(bytes(str)), "fail testBytesBytes32ToBytesWithLenHighOrder");
    }
    */
}
