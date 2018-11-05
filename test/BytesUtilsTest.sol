pragma solidity ^0.4.19;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/utils/BytesUtils.sol";

interface BytesUtilsInterface {
    function pReadBytes32(bytes data, uint256 index) external;
}

contract TestBytesUtils is BytesUtils {
    function pReadBytes32(bytes data, uint256 index) public returns (bytes32) {
        return readBytes32(data, index);
    }

    function pRead(bytes data, uint256 offset, uint256 length) public returns (bytes32) {
        return read(data, offset, length);
    }

    function pDecode(bytes data, uint256 a) public returns (bytes32) {
        return decode(data, a);
    }

    function pDecode(bytes data, uint256 a, uint256 b) public returns (bytes32,bytes32) {
        return decode(data, a, b);
    }

    function pDecode(bytes data, uint256 a, uint256 c, uint256 b) public returns (bytes32,bytes32,bytes32) {
        return decode(data, a, c, b);
    }

    function pDecode(bytes data, uint256 a, uint256 b, uint256 c, uint256 d) public returns (bytes32,bytes32,bytes32,bytes32) {
        return decode(data, a, b, c, d);
    }

    function pDecode(
        bytes data,
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e
    ) public returns (
        bytes32,
        bytes32,
        bytes32,
        bytes32,
        bytes32
    ) {
        return decode(data, a, b, c, d, e);
    }

    function pDecode(
        bytes data,
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 f
    ) public returns (
        bytes32,
        bytes32,
        bytes32,
        bytes32,
        bytes32,
        bytes32
    ) {
        return decode(data, a, b, c, d, e, f);
    }
}

// Proxy contract for testing throws
contract ThrowProxy {
    address public target;
    bytes data;

    function ThrowProxy(address _target) public {
        target = _target;
    }

    //prime the data using the fallback function.
    function() public {
        data = msg.data;
    }

    function execute() public returns (bool) {
        return target.call(data);
    }
}

contract BytesUtilsTest {
    TestBytesUtils bytesUtils;

    function beforeAll() external {
        bytesUtils = new TestBytesUtils();
    }

    function buildData(bytes32 a, bytes32 b, bytes32 c, bytes32 d) internal returns (bytes o) {
        assembly {
            let size := 128
            o := mload(0x40)
            mstore(0x40, add(o, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            mstore(o, size)
            mstore(add(o, 32), a)
            mstore(add(o, 64), b)
            mstore(add(o, 96), c)
            mstore(add(o, 128), d)
        }
    }

    function buildData(bytes32 a, bytes32 b, bytes4 c) internal returns (bytes o) {
        assembly {
            let size := 68
            o := mload(0x40)
            mstore(0x40, add(o, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            mstore(o, size)
            mstore(add(o, 32), a)
            mstore(add(o, 64), b)
            mstore(add(o, 96), c)
        }
    }

    function testReadBytes() external {
        bytes memory testData = buildData(bytes32(uint256(123)), bytes32(address(this)), keccak256("test"), bytes32(0x789));
        Assert.equal(bytesUtils.pReadBytes32(testData, 0), bytes32(uint256(123)), "Read index 0, uint256");
        Assert.equal(bytesUtils.pReadBytes32(testData, 1), bytes32(address(this)), "Read index 1, address");
        Assert.equal(bytesUtils.pReadBytes32(testData, 2), keccak256("test"), "Read index 2, bytes32");
        Assert.equal(bytesUtils.pReadBytes32(testData, 3), bytes32(0x789), "Read index 3, bytes32");
    }

    function testReadNonBytesMemory() external {
        ThrowProxy throwProxy = new ThrowProxy(address(bytesUtils));
        bytes memory testData = buildData(bytes32(uint256(123)), bytes32(address(this)), keccak256("test"), bytes32(0x789));

        // Test read index 4 (invalid)
        BytesUtilsInterface(address(throwProxy)).pReadBytes32(testData, 4);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Read index 4 should fail, it's not inside bytes array");

        // Test read index 0 of empty bytes (invalid)
        BytesUtilsInterface(address(throwProxy)).pReadBytes32(new bytes(0), 0);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Read index 0 should fail, it's not inside bytes array");
    }

    function testInvalidLengthBytes() external {
        ThrowProxy throwProxy = new ThrowProxy(address(bytesUtils));
        bytes memory testData = buildData(bytes32(uint256(123)), bytes32(address(this)), bytes4(keccak256("test")));

        // Reading 0 & 1 items should work
        Assert.equal(bytesUtils.pReadBytes32(testData, 0), bytes32(uint256(123)), "Read index 0, uint256");
        Assert.equal(bytesUtils.pReadBytes32(testData, 1), bytes32(address(this)), "Read index 1, address");

        // Reading index 2 should fail, the word has less than 32 bytes
        BytesUtilsInterface(address(throwProxy)).pReadBytes32(testData, 2);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Reading index 3 should fail, the word has less than 32 bytes");
    }

    function testReadOffset() external {
        bytes memory testData = buildData(bytes32(uint256(123)), bytes32(address(this)), keccak256("test"), bytes32(0x789));
        Assert.equal(bytesUtils.pRead(testData, 0, 32), bytes32(uint256(123)), "Read index 0, uint256");
        Assert.equal(bytesUtils.pRead(testData, 32, 32), bytes32(address(this)), "Read index 1, address");
        Assert.equal(bytesUtils.pRead(testData, 64, 32), keccak256("test"), "Read index 2, bytes32");
        Assert.equal(bytesUtils.pRead(testData, 96, 32), bytes32(0x789), "Read index 3, bytes32");
    }

    function testReadOffsetPacked() external {
        bytes32 test4 = keccak256("test4");
        bytes32 test5 = keccak256("test4");
        bytes32 test6 = keccak256("test4");
        bytes memory data = abi.encodePacked(uint8(12), address(this), test4, test5, test6, uint128(124), true, uint16(5355));
        Assert.equal(bytesUtils.pRead(data, 0, 1), bytes32(uint8(12)), "Read value 0");
        Assert.equal(address(bytesUtils.pRead(data, 1, 20)), address(this), "Read value 1");
        Assert.equal(bytesUtils.pRead(data, 1 + 20, 32), test4, "Read value 2");
        Assert.equal(bytesUtils.pRead(data, 1 + 20 + 32, 32), test5, "Read value 3");
        Assert.equal(bytesUtils.pRead(data, 1 + 20 + 32 + 32, 32), test6, "Read value 4");
        Assert.equal(uint256(bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32, 16)), uint256(124), "Read value 5");
        Assert.equal(bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32 + 16, 1), bytes32(1), "Read value 6");
        Assert.equal(bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32 + 16 + 1, 2), bytes32(uint16(5355)), "Read value 7");
    }

    function testDecode() external {
        bytes32 test4 = keccak256("test4");

        bytes memory data = abi.encodePacked(uint8(12), true, test4, address(this), uint256(0) - 1, uint64(now));
        (bytes32 a) = bytesUtils.pDecode(data, 1);
        Assert.equal(uint256(a), 12, "Decode 1 item");
        bytes32 b;
        (a, b) = bytesUtils.pDecode(data, 1, 1);
        Assert.equal(uint256(a), 12, "Decode 2 items");
        Assert.equal(b, bytes32(1), "Decode 2 items");
        bytes32 c;
        (a, b, c) = bytesUtils.pDecode(data, 1, 1, 32);
        Assert.equal(uint256(a), 12, "Decode 3 items");
        Assert.equal(b, bytes32(1), "Decode 3 items");
        Assert.equal(c, test4, "Decode 3 items");
        bytes32 d;
        (a, b, c, d) = bytesUtils.pDecode(data, 1, 1, 32, 20);
        Assert.equal(uint256(a), 12, "Decode 4 items");
        Assert.equal(b, bytes32(1), "Decode 4 items");
        Assert.equal(c, test4, "Decode 4 items");
        Assert.equal(address(d), address(this), "Decode 4 items");
        bytes32 e;
        (a, b, c, d, e) = bytesUtils.pDecode(data, 1, 1, 32, 20, 32);
        Assert.equal(uint256(a), 12, "Decode 5 items");
        Assert.equal(b, bytes32(1), "Decode 5 items");
        Assert.equal(c, test4, "Decode 5 items");
        Assert.equal(address(d), address(this), "Decode 5 items");
        Assert.equal(uint256(e), uint256(0) - 1, "Decode 5 items");
        bytes32 f;
        (a, b, c, d, e, f) = bytesUtils.pDecode(data, 1, 1, 32, 20, 32, 8);
        Assert.equal(uint256(a), 12, "Decode 6 items");
        Assert.equal(b, bytes32(1), "Decode 6 items");
        Assert.equal(c, test4, "Decode 6 items");
        Assert.equal(address(d), address(this), "Decode 6 items");
        Assert.equal(uint256(e), uint256(0) - 1, "Decode 6 items");
        Assert.equal(uint256(f), now, "Decode 6 items");
    }
}
