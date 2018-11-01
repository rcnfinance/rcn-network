pragma solidity ^0.4.24;

import "./../../interfaces/RateOracle.sol";
import "./../../../utils/ERC165.sol";
import "./../../../utils/BytesUtils.sol";

contract TestRateOracle is BytesUtils, ERC165, RateOracle {
    uint256 public constant VERSION = 5;
    bytes4 internal constant RATE_ORACLE_INTERFACE = 0xa265d8e0;

    constructor() public {
        _registerInterface(RATE_ORACLE_INTERFACE);
    }

    function symbol() external view returns (string) {}

    function name() external view returns (string) {}

    function decimals() external view returns (uint256) {}

    function token() external view returns (address) {}

    function currency() external view returns (bytes32) {}

    function maintainer() external view returns (string) {}

    function url() external view returns (string) {}

    function encodeRate(
        uint256 _rate,
        uint256 _token
    ) external pure returns (bytes) {
        return abi.encodePacked(_rate, _token);
    }

    function readSample(bytes _data) external returns (uint256 _rate, uint256 _tokens) {
        (bytes32 brate, bytes32 btoken) = decode(_data, 32, 32);
        _rate = uint256(brate);
        _tokens = uint256(btoken);
    }
}