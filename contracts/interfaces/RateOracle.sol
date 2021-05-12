pragma solidity ^0.8.4;

import "./IERC165.sol";


/**
    @dev Defines the interface of a standard Diaspore RCN Oracle,

    The contract should also implement it's ERC165 interface: 0xa265d8e0

    @notice Each oracle can only support one currency

    @author Agustin Aguilar
*/
abstract contract RateOracle is IERC165 {
    uint256 public constant VERSION = 5;
    bytes4 internal constant RATE_ORACLE_INTERFACE = 0xa265d8e0;

    /**
        3 or 4 letters symbol of the currency, Ej: ETH
    */
    function symbol() external view virtual returns (string memory);

    /**
        Descriptive name of the currency, Ej: Ethereum
    */
    function name() external view virtual returns (string memory);

    /**
        The number of decimals of the currency represented by this Oracle,
            it should be the most common number of decimal places
    */
    function decimals() external view virtual returns (uint256);

    /**
        The base token on which the sample is returned
            should be the RCN Token address.
    */
    function token() external view virtual returns (address);

    /**
        The currency symbol encoded on a UTF-8 Hex
    */
    function currency() external view virtual returns (bytes32);

    /**
        The name of the Individual or Company in charge of this Oracle
    */
    function maintainer() external view virtual returns (string memory);

    /**
        Returns the url where the oracle exposes a valid "oracleData" if needed
    */
    function url() external view virtual returns (string memory);

    /**
        Returns a sample on how many token() are equals to how many currency()
    */
    function readSample(bytes calldata _data) external virtual returns (uint256 _tokens, uint256 _equivalent);
}
