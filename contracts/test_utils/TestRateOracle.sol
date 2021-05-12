pragma solidity ^0.8.4;

import "../interfaces/RateOracle.sol";
import "../utils/ERC165.sol";
import "../utils/BytesUtils.sol";


contract TestRateOracle is BytesUtils, ERC165, RateOracle {
    address internal _token;

    function symbol() external override view returns (string memory) {}

    function name() external override view returns (string memory) {}

    function decimals() external override view returns (uint256) {}

    function setToken(address token) external returns (address) {
        _token = token;
    }

    function token() external override view returns (address) {
        return _token;
    }

    function currency() external override view returns (bytes32) {}

    function maintainer() external override view returns (string memory) {}

    function url() external override view returns (string memory) {}

    function encodeRate(
        uint128 _tokens,
        uint128 _equivalent
    ) external pure returns (bytes memory) {
        return abi.encodePacked(_tokens, _equivalent);
    }

    function readSample(bytes calldata _data) external override returns (uint256 tokens, uint256 equivalent) {
        if (_data.length != 0) {
            (bytes32 btokens, bytes32 bequivalent) = decode(_data, 16, 16);
            tokens = uint256(btokens);
            equivalent = uint256(bequivalent);
        } else {
            tokens = 1000000000000000000;
            equivalent = RCNequivalent;
        }
    }
    // Used by collateral tests
    uint256 public RCNequivalent;

    event SetEquivalent(uint256 _equivalent);

    function setEquivalent(uint256 _equivalent) external {
        RCNequivalent = _equivalent;
        emit SetEquivalent(_equivalent);
    }
}
