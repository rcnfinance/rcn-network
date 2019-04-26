pragma solidity ^0.5.6;

import "../../core/diaspore/interfaces/RateOracle.sol";
import "../../commons/ERC165.sol";
import "../../utils/BytesUtils.sol";


contract TestRateOracle is BytesUtils, ERC165, RateOracle {
    uint256 public constant VERSION = 5;
    bytes4 internal constant RATE_ORACLE_INTERFACE = 0xa265d8e0;

    constructor() public {
        _registerInterface(RATE_ORACLE_INTERFACE);
    }

    function symbol() external view returns (string memory) {}

    function name() external view returns (string memory) {}

    function decimals() external view returns (uint256) {}

    function token() external view returns (address) {}

    function currency() external view returns (bytes32) {}

    function maintainer() external view returns (string memory) {}

    function url() external view returns (string memory) {}

    function encodeRate(
        uint128 _tokens,
        uint128 _equivalent
    ) external pure returns (bytes memory) {
        return abi.encodePacked(_tokens, _equivalent);
    }

    function readSample(bytes calldata _data) external returns (uint256 tokens, uint256 equivalent) {
        (bytes32 btokens, bytes32 bequivalent) = decode(_data, 16, 16);
        tokens = uint256(btokens);
        equivalent = uint256(bequivalent);
    }
}
