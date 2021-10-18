pragma solidity ^0.8.0;


library SignedMath {
    function min(int256 _a, int256 _b) internal pure returns (int256) {
        if (_a < _b) {
            return _a;
        } else {
            return _b;
        }
    }

    function max(int256 _a, int256 _b) internal pure returns (int256) {
        if (_a > _b) {
            return _a;
        } else {
            return _b;
        }
    }
}
