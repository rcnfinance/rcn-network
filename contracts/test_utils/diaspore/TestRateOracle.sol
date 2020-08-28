pragma solidity ^0.6.6;

import "../../core/diaspore/interfaces/RateOracle.sol";
import "../../commons/ERC165.sol";
import "../../utils/BytesUtils.sol";


contract TestRateOracle is BytesUtils, ERC165, RateOracle {
    constructor() public {
        _registerInterface(RATE_ORACLE_INTERFACE);
    }

    function symbol() external view override returns (string memory) {}

    function name() external view override returns (string memory) {}

    function decimals() external view override returns (uint256) {}

    function token() external view override returns (address) {}

    function currency() external view override returns (bytes32) {}

    function maintainer() external view override returns (string memory) {}

    function url() external view override returns (string memory) {}

    function encodeRate(
        uint128 _tokens,
        uint128 _equivalent
    ) external pure returns (bytes memory) {
        return abi.encodePacked(_tokens, _equivalent);
    }

    function readSample(bytes calldata _data) external override returns (uint256 tokens, uint256 equivalent) {
        (bytes32 btokens, bytes32 bequivalent) = decode(_data, 16, 16);
        tokens = uint256(btokens);
        equivalent = uint256(bequivalent);
    }
}
