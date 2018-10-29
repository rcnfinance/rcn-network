pragma solidity ^0.4.24;

import "./../interfaces/RateOracle.sol";
import "./../../utils/ERC165.sol";
import "./../../interfaces/Oracle.sol";

contract OracleAdapter is RateOracle, ERC165 {
    Oracle public legacyOracle;

    string public symbol;
    string public name;
    string public maintainer;

    uint256 public decimals;
    bytes32 public currency;

    address public token;

    constructor(
        Oracle _legacyOracle,
        string _symbol,
        string _name,
        string _maintainer,
        uint256 _decimals,
        bytes32 _currency,
        address _token
    ) public {
        legacyOracle = _legacyOracle;
        symbol = _symbol;
        name = _name;
        maintainer = _maintainer;
        decimals = _decimals;
        currency = _currency;
        token = _token;
    }

    function url() external view returns (string) {
        return legacyOracle.url();
    }

    function readSample(bytes _data) external returns (uint256 _currency, uint256 _tokens) {
        (_currency, _tokens) = legacyOracle.getRate(currency, _data);
        _tokens = 10 ** _tokens;
    }    
}