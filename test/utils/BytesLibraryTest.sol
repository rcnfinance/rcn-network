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

    function testBytesBytes32ToBytesLowOrder() external {
        bytes memory bts = hex"112233".toBytes();
        bytes memory btsExpctd = hex"0000000000000000000000000000000000000000000000000000000000112233";
        Assert.isTrue(bts.equals(btsExpctd), "fail testBytesBytes32ToBytesLowOrder");
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

    /*
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

    function testBytesBytes32ToBytesWithLenLowOrder() external {
        var bts = bytes32(0x112233).toBytes(31);
        bytes memory btsExpctd = hex"00000000000000000000000000000000000000000000000000000000001122";
        assert(bts.equals(btsExpctd));
    }

    function testBytesUintToBytesWithBitsize() external {
        uint n = 0x12345678;
        var bts = n.toBytes(32);
        bytes memory btsExpctd = hex"12345678";
        assert(bts.equals(btsExpctd));
    }

    function testBytesUintToBytesWithBitsizeThrowsBitsizeLow() external {
        uint(0).toBytes(0);
    }

    function testBytesUintToBytesWithBitsizeThrowsBitsizeHigh() external {
        uint(0).toBytes(264);
    }

    function testBytesUintToBytesWithBitsizeThrowsBitsizeNotMultipleOf8() external {
        uint(0).toBytes(15);
    }

    function testBytesBooleanToBytes() external {
        bytes memory btsTrue = hex"01";
        bytes memory btsFalse = hex"00";
        assert(true.toBytes().equals(btsTrue));
        assert(false.toBytes().equals(btsFalse));
    }*/

    /* Test for bytes32 */


    /* Test for uint */




}
