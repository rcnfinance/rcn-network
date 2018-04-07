pragma solidity ^0.4.19;

import "./../utils/Ownable.sol";
import "./Token.sol";

/**
    @dev Defines the interface of a standard RCN oracle.

    The oracle is an agent in the RCN network that supplies a convertion rate between RCN and any other currency,
    it's primarily used by the exchange but could be used by any other agent.
*/
contract Oracle is Ownable {
    uint256 public constant VERSION = 3;

    event NewSymbol(bytes32 _currency, string _ticker);
    
    struct Symbol {
        string ticker;
        bool supported;
    }

    mapping(bytes32 => Symbol) public currencies;

    /**
        @dev Returns the url where the oracle exposes a valid "oracleData" if needed
    */
    function url() public view returns (string);

    /**
        @dev Returns a valid convertion rate from the currency given to RCN

        @param symbol Symbol of the currency
        @param data Generic data field, could be used for off-chain signing
    */
    function getRate(bytes32 symbol, bytes data) public returns (uint256 rate, uint256 decimals);

    /**
        @dev Adds a currency to the oracle, once added it cannot be removed

        @param ticker Symbol of the currency

        @return the hash of the currency, calculated keccak256(ticker)
    */
    function addCurrency(string ticker) public onlyOwner returns (bytes32) {
        NewSymbol(currency, ticker);
        bytes32 currency = keccak256(ticker);
        currencies[currency] = Symbol(ticker, true);
        return currency;
    }

    /**
        @return true If the currency is supported
    */
    function supported(bytes32 symbol) public view returns (bool) {
        return currencies[symbol].supported;
    }
}