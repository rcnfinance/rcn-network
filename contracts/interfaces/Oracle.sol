pragma solidity ^0.4.15;

import "./../utils/Ownable.sol";
import "./Token.sol";

/**
    @dev Defines the interface of a standard RCN oracle.

    The oracle is an agent in the RCN network that supplies a convertion rate between RCN and any other currency,
    it's primarily used by the exchange but could be used by any other agent.
*/
contract Oracle is Ownable {
    uint256 public constant VERSION = 2;

    event NewSymbol(bytes32 _currency, string _ticker, uint8 _decimals);
    
    struct Symbol {
        string ticker;
        uint8 decimals;
        bool supported;
    }

    mapping(bytes32 => Symbol) public currencies;

    /**
        @dev Returns the url where the oracle exposes a valid "oracleData" if needed
    */
    function url() constant returns (string);

    /**
        @dev Returns a valid convertion rate from the currency given to RCN

        @param symbol Symbol of the currency
        @param data Generic data field, could be used for off-chain signing
    */
    function getRate(bytes32 symbol, bytes data) constant returns (uint256);

    /**
        @dev Adds a currency to the oracle, once added it cannot be removed

        @param ticker Symbol of the currency
        @param decimals Decimals of the convertion

        @return the hash of the currency, calculated keccak256(ticker, decimals)
    */
    function addCurrency(string ticker, uint8 decimals) public onlyOwner returns (bytes32) {
        NewSymbol(currency, ticker, decimals);
        bytes32 currency = keccak256(ticker, decimals);
        currencies[currency] = Symbol(ticker, decimals, true);
        return currency;
    }

    /**
        @return The number of decimals of a given currency hash, only if registered
    */
    function decimals(bytes32 symbol) constant returns (uint8) {
        return currencies[symbol].decimals;
    }

    /**
        @return true If the currency is supported
    */
    function supported(bytes32 symbol) constant returns (bool) {
        return currencies[symbol].supported;
    }
}