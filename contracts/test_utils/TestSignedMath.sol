/* solium-disable */
pragma solidity ^0.8.12;

import "../utils/SignedMath.sol";


contract TestSignedMath {
    using SignedMath for int256;

    function min(int256 _a, int256 _b) external pure returns (int256) {
        return _a.min(_b);
    }

    function max(int256 _a, int256 _b) external pure returns (int256) {
        return _a.max(_b);
    }
}
