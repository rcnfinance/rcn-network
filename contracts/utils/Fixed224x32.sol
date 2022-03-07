pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";


library Fixed224x32 {
    uint256 private constant BASE = 4294967296; // 2 ** 32
    uint256 private constant DEC_BITS = 32;
    uint256 private constant INT_BITS = 224;

    using Fixed224x32 for bytes32;
    using SafeMath for uint256;

    function from(
        uint256 _num
    ) internal pure returns (bytes32) {
        return bytes32(_num.mul(BASE));
    }

    function raw(
        uint256 _raw
    ) internal pure returns (bytes32) {
        return bytes32(_raw);
    }

    function toUint256(
        bytes32 _a
    ) internal pure returns (uint256) {
        return uint256(_a) >> DEC_BITS;
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

        return bytes32((a.mul(b) >> DEC_BITS));
    }

    function floor(
        bytes32 _a
    ) internal pure returns (bytes32) {
        return (_a >> DEC_BITS) << DEC_BITS;
    }

    function ceil(
        bytes32 _a
    ) internal pure returns (bytes32) {
        uint256 rawDec = uint256(_a << INT_BITS);
        if (rawDec != 0) {
            uint256 diff = BASE.sub(rawDec >> INT_BITS);
            return bytes32(uint256(_a).add(diff));
        }

        return _a;
    }

    function div(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bytes32) {
        uint256 a = uint256(_a);
        uint256 b = uint256(_b);

        return bytes32((a.mul(BASE)) / b);
    }

    function gt(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bool) {
        return uint256(_a) > uint256(_b);
    }

    function gte(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bool) {
        return uint256(_a) >= uint256(_b);
    }

    function lt(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bool) {
        return uint256(_a) < uint256(_b);
    }

    function lte(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bool) {
        return uint256(_a) <= uint256(_b);
    }

    function eq(
        bytes32 _a,
        bytes32 _b
    ) internal pure returns (bool) {
        return _a == _b;
    }
}
