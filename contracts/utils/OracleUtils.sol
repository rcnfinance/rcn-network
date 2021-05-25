pragma solidity ^0.8.4;

import "../interfaces/RateOracle.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


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

    /*
        @dev Will fail if the oracle changes the contract state
    */
    function readStatic(
        RateOracle _oracle,
        bytes memory data
    ) internal view returns (Sample memory s) {
        if (address(_oracle) == address(0)) {
            s.tokens = 1;
            s.equivalent = 1;
        } else {
            (
                bool success,
                bytes memory returnData
            ) = address(_oracle).staticcall(
                abi.encodeWithSelector(
                    _oracle.readSample.selector,
                    data
                )
            );

            require(success, "oracle-utils: error static reading oracle");

            (
                s.tokens,
                s.equivalent
            ) = abi.decode(returnData, (uint256, uint256));
        }
    }

    /*
        @dev Will fail with oracles that required oracle data and
            if the oracle changes the contract state
    */
    function readStatic(
        RateOracle _oracle
    ) internal view returns (Sample memory s) {
        s = _oracle.readStatic("");
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
        tokens = _sample.toTokens(_base, false);
    }

    function toTokens(
        Sample memory _sample,
        uint256 _base,
        bool ceil
    ) internal pure returns (
        uint256 tokens
    ) {
        if (_sample.tokens == 1 && _sample.equivalent == 1) {
            tokens = _base;
        } else {
            uint256 mul = _base.mul(_sample.tokens);
            tokens = mul.div(_sample.equivalent);
            if (ceil && mul % tokens != 0) {
                tokens = tokens.add(1);
            }
        }
    }

    function toBase(
        Sample memory _sample,
        uint256 _tokens
    ) internal pure returns (
        uint256 base
    ) {
        base = _sample.toBase(_tokens, false);
    }

    function toBase(
        Sample memory _sample,
        uint256 _tokens,
        bool ceil
    ) internal pure returns (
        uint256 base
    ) {
        if (_sample.tokens == 1 && _sample.equivalent == 1) {
            base = _tokens;
        } else {
            uint256 mul = _tokens.mul(_sample.equivalent);
            base = mul.div(_sample.tokens);
            if (ceil && mul % base != 0) {
                base = base.add(1);
            }
        }
    }
}
