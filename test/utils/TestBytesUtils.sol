/* solium-disable */
pragma solidity ^0.6.6;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../../contracts/utils/BytesUtils.sol";


interface TestBytesUtilsInterface {
    function pReadBytes32(bytes calldata data, uint256 index) external;
}


contract TestBytesUtilsMock is BytesUtils {
    function pReadBytes32(bytes memory data, uint256 index) public returns (bytes32) {
        return readBytes32(data, index);
    }

    function pRead(bytes memory data, uint256 offset, uint256 length) public returns (bytes32) {
        return read(data, offset, length);
    }

    function pDecode(bytes memory data, uint256 a) public returns (bytes32) {
        return decode(data, a);
    }

    function pDecode(bytes memory data, uint256 a, uint256 b) public returns (bytes32, bytes32) {
        return decode(data, a, b);
    }

    function pDecode(bytes memory data, uint256 a, uint256 c, uint256 b) public returns (bytes32, bytes32, bytes32) {
        return decode(data, a, c, b);
    }

    function pDecode(bytes memory data, uint256 a, uint256 b, uint256 c, uint256 d) public returns (bytes32, bytes32, bytes32, bytes32) {
        return decode(data, a, b, c, d);
    }

    function pDecode(
        bytes memory data,
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
        bytes memory data,
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
contract TestThrowProxy {
    address public target;
    bytes data;

    constructor(address _target) public {
        target = _target;
    }

    //prime the data using the fallback function.
    function() external {
        data = msg.data;
    }

    function execute() public returns (bool) {
        (bool success,) = target.call(data);
        return success;
    }
}


contract TestBytesUtils {
    TestBytesUtilsMock bytesUtils;

    function beforeAll() external {
        bytesUtils = new TestBytesUtilsMock();
    }

    function testReadBytes() external {
        bytes memory testData = abi.encodePacked(bytes32(uint256(123)), bytes32(uint256(address(this))), keccak256("test"), bytes32(uint256(0x789)));
        Assert.equal(bytesUtils.pReadBytes32(testData, 0), bytes32(uint256(123)), "Read index 0, uint256");
        Assert.equal(bytesUtils.pReadBytes32(testData, 1), bytes32(uint256(address(this))), "Read index 1, address");
        Assert.equal(bytesUtils.pReadBytes32(testData, 2), keccak256("test"), "Read index 2, bytes32");
        Assert.equal(bytesUtils.pReadBytes32(testData, 3), bytes32(uint256(0x789)), "Read index 3, bytes32");
    }

    function testReadNonBytesMemory() external {
        TestThrowProxy throwProxy = new TestThrowProxy(address(bytesUtils));
        bytes memory testData = abi.encodePacked(bytes32(uint256(123)), bytes32(uint256(address(this))), keccak256("test"), bytes32(uint256(0x789)));

        // Test read index 4 (invalid)
        TestBytesUtilsInterface(address(throwProxy)).pReadBytes32(testData, 4);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Read index 4 should fail, it's not inside bytes array");

        // Test read index 0 of empty bytes (invalid)
        TestBytesUtilsInterface(address(throwProxy)).pReadBytes32(new bytes(0), 0);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Read index 0 should fail, it's not inside bytes array");
    }

    function testInvalidLengthBytes() external {
        TestThrowProxy throwProxy = new TestThrowProxy(address(bytesUtils));
        bytes memory testData = abi.encodePacked(bytes32(uint256(123)), bytes32(uint256(address(this))), bytes4(keccak256("test")));

        // Reading 0 & 1 items should work
        Assert.equal(bytesUtils.pReadBytes32(testData, 0), bytes32(uint256(123)), "Read index 0, uint256");
        Assert.equal(bytesUtils.pReadBytes32(testData, 1), bytes32(uint256(address(this))), "Read index 1, address");

        // Reading index 2 should fail, the word has less than 32 bytes
        TestBytesUtilsInterface(address(throwProxy)).pReadBytes32(testData, 2);
        Assert.isFalse(throwProxy.execute.gas(200000)(), "Reading index 3 should fail, the word has less than 32 bytes");
    }

    function testReadOffset() external {
        bytes memory testData = abi.encodePacked(bytes32(uint256(123)), bytes32(uint256(address(this))), keccak256("test"), bytes32(uint256(0x789)));
        Assert.equal(bytesUtils.pRead(testData, 0, 32), bytes32(uint256(123)), "Read index 0, uint256");
        Assert.equal(bytesUtils.pRead(testData, 32, 32), bytes32(uint256(address(this))), "Read index 1, address");
        Assert.equal(bytesUtils.pRead(testData, 64, 32), keccak256("test"), "Read index 2, bytes32");
        Assert.equal(bytesUtils.pRead(testData, 96, 32), bytes32(uint256(0x789)), "Read index 3, bytes32");
    }

    function testReadOffsetPacked() external {
        bytes32 test4 = keccak256("test4");
        bytes32 test5 = keccak256("test4");
        bytes32 test6 = keccak256("test4");
        bytes memory data = abi.encodePacked(uint8(uint256(12)), address(this), test4, test5, test6, uint128(uint256(124)), true, uint16(uint256(5355)));
        Assert.equal(bytesUtils.pRead(data, 0, 1), bytes32(uint256(12)), "Read value 0");
        Assert.equal(address(uint256(bytesUtils.pRead(data, 1, 20))), address(this), "Read value 1");
        Assert.equal(bytesUtils.pRead(data, 1 + 20, 32), test4, "Read value 2");
        Assert.equal(bytesUtils.pRead(data, 1 + 20 + 32, 32), test5, "Read value 3");
        Assert.equal(bytesUtils.pRead(data, 1 + 20 + 32 + 32, 32), test6, "Read value 4");
        Assert.equal(uint256(bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32, 16)), uint256(124), "Read value 5");
        Assert.equal(bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32 + 16, 1), bytes32(uint256(1)), "Read value 6");
        Assert.equal(bytesUtils.pRead(data, 1 + 20 + 32 + 32 + 32 + 16 + 1, 2), bytes32(uint256(5355)), "Read value 7");
    }

    function testDecode() external {
        bytes32 test4 = keccak256("test4");

        bytes memory data = abi.encodePacked(uint8(uint256(12)), true, test4, address(this), uint256(0) - 1, uint64(now));
        (bytes32 a) = bytesUtils.pDecode(data, 1);
        Assert.equal(uint256(a), 12, "Decode 1 item");
        bytes32 b;
        (a, b) = bytesUtils.pDecode(data, 1, 1);
        Assert.equal(uint256(a), 12, "Decode 2 items");
        Assert.equal(b, bytes32(uint256(1)), "Decode 2 items");
        bytes32 c;
        (a, b, c) = bytesUtils.pDecode(data, 1, 1, 32);
        Assert.equal(uint256(a), 12, "Decode 3 items");
        Assert.equal(b, bytes32(uint256(1)), "Decode 3 items");
        Assert.equal(c, test4, "Decode 3 items");
        bytes32 d;
        (a, b, c, d) = bytesUtils.pDecode(data, 1, 1, 32, 20);
        Assert.equal(uint256(a), 12, "Decode 4 items");
        Assert.equal(b, bytes32(uint256(1)), "Decode 4 items");
        Assert.equal(c, test4, "Decode 4 items");
        Assert.equal(address(uint256(d)), address(this), "Decode 4 items");
        bytes32 e;
        (a, b, c, d, e) = bytesUtils.pDecode(data, 1, 1, 32, 20, 32);
        Assert.equal(uint256(a), 12, "Decode 5 items");
        Assert.equal(b, bytes32(uint256(1)), "Decode 5 items");
        Assert.equal(c, test4, "Decode 5 items");
        Assert.equal(address(uint256(d)), address(this), "Decode 5 items");
        Assert.equal(uint256(e), uint256(0) - 1, "Decode 5 items");
        bytes32 f;
        (a, b, c, d, e, f) = bytesUtils.pDecode(data, 1, 1, 32, 20, 32, 8);
        Assert.equal(uint256(a), 12, "Decode 6 items");
        Assert.equal(b, bytes32(uint256(1)), "Decode 6 items");
        Assert.equal(c, test4, "Decode 6 items");
        Assert.equal(address(uint256(d)), address(this), "Decode 6 items");
        Assert.equal(uint256(e), uint256(0) - 1, "Decode 6 items");
        Assert.equal(uint256(f), now, "Decode 6 items");
    }
}
