pragma solidity ^0.5.6;

import "../utils/SafeSignedMath.sol";


contract SafeSignedMathMock {
    using SafeSignedMath for int256;

    function abs(int256 x) external returns (int256) {
        return x.abs();
    }

    function add(int256 x, int256 y) external returns (int256) {
        return x.add(y);
    }

    function sub(int256 x, int256 y) external returns (int256) {
        return x.sub(y);
    }

    function mul(int256 x, int256 y) external returns (int256) {
        return x.mul(y);
    }

    function div(int256 x, int256 y) external returns (int256) {
        return x.div(y);
    }

    function muldiv(int256 x, int256 y, int256 z) external returns (int256) {
        return x.muldiv(y, z);
    }
}
