pragma solidity ^0.4.19;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/utils/BytesUtils.sol";

interface BytesUtilsInterface {
    function pReadBytes32(bytes data, uint256 index) public;
}

contract TestBytesUtils is BytesUtils {
    function pReadBytes32(bytes data, uint256 index) public returns (bytes32) {
        return readBytes32(data, index);
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

    function testReadBytes() public {
        TestBytesUtils bytesUtils = new TestBytesUtils();
        bytes memory testData = buildData(bytes32(uint256(123)), bytes32(address(this)), keccak256("test"), bytes32(0x789));
        Assert.equal(bytesUtils.pReadBytes32(testData, 0), bytes32(uint256(123)), "Read index 0, uint256");
        Assert.equal(bytesUtils.pReadBytes32(testData, 1), bytes32(address(this)), "Read index 1, address");
        Assert.equal(bytesUtils.pReadBytes32(testData, 2), keccak256("test"), "Read index 2, bytes32");
        Assert.equal(bytesUtils.pReadBytes32(testData, 3), bytes32(0x789), "Read index 3, bytes32");
    }

    function testReadNonBytesMemory() public {
        TestBytesUtils bytesUtils = new TestBytesUtils();
        ThrowProxy throwProxy = new ThrowProxy(address(bytesUtils));
        bytes memory testData = buildData(bytes32(uint256(123)), bytes32(address(this)), keccak256("test"), bytes32(0x789));

        // Test read index 4 (invalid)
        BytesUtilsInterface(address(throwProxy)).pReadBytes32(testData, 4);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Read index 4 should fail, it's not inside bytes array");

        // Test read index 0 of empty bytes (invalid)
        BytesUtilsInterface(address(throwProxy)).pReadBytes32(new bytes(0), 0);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Read index 0 should fail, it's not inside bytes array");
    }

    function testInvalidLengthBytes() public {
        TestBytesUtils bytesUtils = new TestBytesUtils();
        ThrowProxy throwProxy = new ThrowProxy(address(bytesUtils));
        bytes memory testData = buildData(bytes32(uint256(123)), bytes32(address(this)), bytes4(keccak256("test")));

        // Reading 0 & 1 items should work
        Assert.equal(bytesUtils.pReadBytes32(testData, 0), bytes32(uint256(123)), "Read index 0, uint256");
        Assert.equal(bytesUtils.pReadBytes32(testData, 1), bytes32(address(this)), "Read index 1, address");

        // Reading index 2 should fail, the word has less than 32 bytes
        BytesUtilsInterface(address(throwProxy)).pReadBytes32(testData, 2);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Reading index 3 should fail, the word has less than 32 bytes");
    }
}