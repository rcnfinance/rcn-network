pragma solidity ^0.4.24;

import "./../interfaces/RateOracle.sol";
import "./../../utils/ERC165.sol";
import "./../../interfaces/Oracle.sol";

contract OracleAdapter is RateOracle, ERC165 {
    Oracle public legacyOracle;

    string private isymbol;
    string private iname;
    string private imaintainer;

    uint256 private idecimals;
    bytes32 private icurrency;

    address private itoken;

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
        isymbol = _symbol;
        iname = _name;
        imaintainer = _maintainer;
        idecimals = _decimals;
        icurrency = _currency;
        itoken = _token;

        _registerInterface(RATE_ORACLE_INTERFACE);
    }

    function symbol() external view returns (string) { return isymbol; }

    function name() external view returns (string) { return iname; }

    function decimals() external view returns (uint256) { return idecimals; }

    function token() external view returns (address) { return itoken; }

    function currency() external view returns (bytes32) { return icurrency; }
    
    function maintainer() external view returns (string) { return imaintainer; }

    function url() external view returns (string) {
        return legacyOracle.url();
    }

    function readSample(bytes _data) external returns (uint256 _currency, uint256 _tokens) {
        (_currency, _tokens) = legacyOracle.getRate(icurrency, _data);
        require(_tokens <= 18, "Max decimals is 18");
        _tokens = 10 ** (18 - _tokens);
    }    
}