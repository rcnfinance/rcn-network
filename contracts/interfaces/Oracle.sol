pragma solidity ^0.4.15;

import "./../utils/Ownable.sol";
import "./Token.sol";

contract Oracle is Ownable {
    uint256 public constant VERSION = 2;

    event NewSymbol(bytes32 _currency, string _ticker, uint8 _decimals);
    
    struct Symbol {
        string ticker;
        uint8 decimals;
        bool supported;
    }

    mapping(bytes32 => Symbol) public currencies;

    function url() constant returns (string);
    function getRate(bytes32 symbol, bytes data) constant returns (uint256);

    function addCurrency(string ticker, uint8 decimals) public onlyOwner returns (bytes32) {
        NewSymbol(currency, ticker, decimals);
        bytes32 currency = keccak256(ticker, decimals);
        currencies[currency] = Symbol(ticker, decimals, true);
        return currency;
    }

    function decimals(bytes32 symbol) constant returns (uint8) {
        return currencies[symbol].decimals;
    }

    function supported(bytes32 symbol) constant returns (bool) {
        return currencies[symbol].supported;
    }
}