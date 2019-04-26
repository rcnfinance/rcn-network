pragma solidity ^0.5.6;


library Math {
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

    function min(uint256 _a, uint256 _b) internal pure returns (uint256) {
        if (_a < _b) {
            return _a;
        } else {
            return _b;
        }
    }

    function max(uint256 _a, uint256 _b) internal pure returns (uint256) {
        if (_a > _b) {
            return _a;
        } else {
            return _b;
        }
    }

    function min(uint256 _a, uint256 _b, uint256 _c) internal pure returns (uint256) {
        if (_a < _b) {
            return _a < _c ? _a : _c;
        } else {
            return _b < _c ? _b : _c;
        }
    }
}
