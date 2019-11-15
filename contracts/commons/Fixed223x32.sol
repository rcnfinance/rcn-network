pragma solidity ^0.5.11;

import "../utils/SafeMath.sol";


library Fixed223x32 {
    uint256 private constant BASE = 4294967296; // 2 ** 32
    using Fixed223x32 for bytes32;
    using SafeMath for uint256;

    function from(
        uint256 _num
    ) internal pure returns (bytes32) {
        return bytes32(_num.mult(BASE));
    }

    function raw(
        uint256 _raw
    ) internal pure returns (bytes32) {
        return bytes32(_raw);
    }

    function toUint256(
        bytes32 _a
    ) internal pure returns (uint256) {
        return uint256(_a) / BASE;
    }

    function add(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bytes32) {
        return bytes32(uint256(_a).add(uint256(_b)));
    }

    function sub(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bytes32) {
        return bytes32(uint256(_a).sub(uint256(_b)));
    }

    function mul(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bytes32) {
        uint256 a = uint256(_a);
        uint256 b = uint256(_b);

        return bytes32((a.mult(b) / BASE));
    }

    function div(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bytes32) {
        uint256 a = uint256(_a);
        uint256 b = uint256(_b);

        return bytes32((a.mult(BASE)) / b);
    }

    function gt(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bool) {
        return uint256(_a) > uint256(_b);
    }

    function lt(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bool) {
        return uint256(_a) < uint256(_b);
    }

    function eq(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bool) {
        return _a == _b;
    }
}
