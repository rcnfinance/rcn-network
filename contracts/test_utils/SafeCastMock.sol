pragma solidity ^0.5.6;

import "../utils/SafeCast.sol";


contract SafeCastMock {
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
