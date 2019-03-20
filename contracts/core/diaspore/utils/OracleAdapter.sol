pragma solidity ^0.5.6;

import "./../interfaces/RateOracle.sol";
import "../../../commons/ERC165.sol";
import "../../basalt/interfaces/Oracle.sol";


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
        string memory _symbol,
        string memory _name,
        string memory _maintainer,
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

    function symbol() external view returns (string memory) { return isymbol; }

    function name() external view returns (string memory) { return iname; }

    function decimals() external view returns (uint256) { return idecimals; }

    function token() external view returns (address) { return itoken; }

    function currency() external view returns (bytes32) { return icurrency; }

    function maintainer() external view returns (string memory) { return imaintainer; }

    function url() external view returns (string memory) {
        return legacyOracle.url();
    }

    function readSample(bytes calldata _data) external returns (uint256 _tokens, uint256 _equivalent) {
        (_tokens, _equivalent) = legacyOracle.getRate(icurrency, _data);
        _equivalent = 10 ** _equivalent;
    }
}
