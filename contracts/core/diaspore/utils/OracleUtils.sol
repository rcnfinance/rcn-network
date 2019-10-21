pragma solidity ^0.5.11;

import "../interfaces/RateOracle.sol";
import "../../../utils/SafeMath.sol";


library OracleUtils {
    using OracleUtils for OracleUtils.Sample;
    using OracleUtils for RateOracle;
    using SafeMath for uint256;

    struct Sample {
        uint256 tokens;
        uint256 equivalent;
    }

    function read(
        RateOracle _oracle,
        bytes memory data
    ) internal returns (Sample memory s) {
        if (address(_oracle) == address(0)) {
            s.tokens = 1;
            s.equivalent = 1;
        } else {
            (
                s.tokens,
                s.equivalent
            ) = _oracle.readSample(data);
        }
    }

    /*
        @dev Will fail with oracles that required oracle data
    */
    function read(
        RateOracle _oracle
    ) internal returns (Sample memory s) {
        s = _oracle.read("");
    }

    function encode(
        uint256 _tokens,
        uint256 _equivalent
    ) internal pure returns (Sample memory s) {
        s.tokens = _tokens;
        s.equivalent = _equivalent;
    }

    function toTokens(
        Sample memory _sample,
        uint256 _base
    ) internal pure returns (
        uint256 tokens
    ) {
        if (_sample.tokens == 1 && _sample.equivalent == 1) {
            tokens = _base;
        } else {
            tokens = _base.multdiv(_sample.tokens, _sample.equivalent);
        }
    }

    function toBase(
        Sample memory _sample,
        uint256 _tokens
    ) internal pure returns (
        uint256 base
    ) {
        if (_sample.tokens == 1 && _sample.equivalent == 1) {
            base = _tokens;
        } else {
            base = _tokens.multdiv(_sample.equivalent, _sample.tokens);
        }
    }
}
