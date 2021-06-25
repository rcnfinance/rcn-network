/* solium-disable */
pragma solidity ^0.8.0;

import "../utils/BytesUtils.sol";


contract TestBytesUtils is BytesUtils {
    function pReadBytes32(bytes memory data, uint256 index) pure external returns (bytes32) {
        return readBytes32(data, index);
    }

    function pRead(bytes memory data, uint256 offset, uint256 length) pure external returns (bytes32) {
        return read(data, offset, length);
    }

    function pDecode(bytes memory data, uint256 a) pure external returns (bytes32) {
        return decode(data, a);
    }

    function pDecode(bytes memory data, uint256 a, uint256 b) pure external returns (bytes32, bytes32) {
        return decode(data, a, b);
    }

    function pDecode(bytes memory data, uint256 a, uint256 c, uint256 b) pure external returns (bytes32, bytes32, bytes32) {
        return decode(data, a, c, b);
    }

    function pDecode(bytes memory data, uint256 a, uint256 b, uint256 c, uint256 d) pure external returns (bytes32, bytes32, bytes32, bytes32) {
        return decode(data, a, b, c, d);
    }

    function pDecode(
        bytes memory data,
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e
    ) pure external returns (
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
    ) pure external returns (
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
