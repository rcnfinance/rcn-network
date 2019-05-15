pragma solidity ^0.5.6;

import "./SafeCast.sol";
import "./SafeMath.sol";


library SafeSignedMath {
    using SafeSignedMath for int256;
    using SafeCast for uint256;
    using SafeMath for uint256;


    function abs(int256 _i) internal pure returns (int256) {
        if (_i < 0) {
            return -_i;
        } else {
            return _i;
        }
    }

    function add(int256 _a, int256 _b) internal pure returns (int256) {
        if (_b < 0) {
            return _a.sub(-_b);
        }

        int256 z = _a + _b;
        require(z >= _a, "add overflow");
        return z;
    }

    function sub(int256 _a, int256 _b) internal pure returns (int256) {
        if (_b < 0) {
            return _a.add(-_b);
        }

        int256 z = _a - _b;
        require(z <= _a, "sub underflow");
        return z;
    }

    function mul(int256 _a, int256 _b) internal pure returns (int256) {
        if (_b == 0) {
            return 0;
        }

        int256 z = _a * _b;
        require(z / _b == _a, "mul overflow");
        return z;
    }

    function div(int256 _a, int256 _b) internal pure returns (int256) {
        require(_b != 0, "div by zero");
        return _a / _b;
    }

    function muldiv(int256 _a, int256 _b, int256 _c) internal pure returns (int256 result) {
        require(_c != 0, "div by zero");
        return _a.mul(_b) / _c;
    }
}
