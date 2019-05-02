pragma solidity ^0.5.6;


library SafeCast {
    function toUint128(uint256 _a) internal pure returns (uint128) {
        require(_a < 2 ** 128, "cast overflow");
        return uint128(_a);
    }

    function toUint256(int256 _i) internal pure returns (uint256) {
        require(_i >= 0, "cast to unsigned must be positive");
        return uint256(_i);
    }

    function toInt256(uint256 _i) internal pure returns (int256) {
        require(_i < 2 ** 255, "cast overflow");
        return int256(_i);
    }
}
