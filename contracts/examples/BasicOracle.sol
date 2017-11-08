pragma solidity ^0.4.15;

import "./../interfaces/Oracle.sol";
import "./../interfaces/Token.sol";

// by Agusx1211 27/07/2017
contract BasicOracle is Oracle {
    uint256 public constant VERSION = 2;

    Token public token;
    address public owner;

    event RateDelivered(uint256 rate, uint256 cost, uint256 timestamp, string currency);

    struct Currency {
        uint8 decimals;        
        uint256 rate;
        uint256 cost;
        uint256 timestamp;
        bool costInCurrency;
    }

    mapping(address => bool) public blacklist;
    mapping(string => Currency) currencies;
    
    function BasicOracle(Token _token) {
        token = _token;
        owner = msg.sender;
    }

    function getTimestamp(string symbol) constant returns(uint256) {
        return currencies[symbol].timestamp;
    }
    
    function getRateFor(string symbol) returns(uint256) {
        uint256 rate = currencies[symbol].rate;
        require(!blacklist[msg.sender]);
        require(rate != 0);
        uint256 cost = getCost(symbol);
        require(token.transferFrom(msg.sender, owner, cost));
        RateDelivered(rate, cost, currencies[symbol].timestamp, symbol);
        return rate;
    }

    function getRateForExternal(string symbol) constant returns (uint256) {
        require(!isContract(msg.sender));
        require(!blacklist[msg.sender]);
        return currencies[symbol].rate;
    }

    function isContract(address addr) internal returns (bool) {
        uint size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }

    function getCost(string symbol) constant returns (uint256) {
        Currency storage currency = currencies[symbol];
        if (currency.costInCurrency) {
            return currency.cost * currency.rate;
        } else {
            return currency.cost;
        }
    }

    function getDecimals(string symbol) constant returns(uint256) {
        return currencies[symbol].decimals;
    }

    function createSymbol(string symbol, uint8 _decimals, uint256 _rate, uint256 _cost, bool _costInCurrency) {
        require(msg.sender == owner);
        require(_rate != 0);
        NewSymbol(symbol, _decimals);
        currencies[symbol] = Currency(_decimals, _rate, _cost, block.timestamp, _costInCurrency);
    }

    function setRate(string symbol, uint256 newRate) {
        Currency storage currency = currencies[symbol];
        require(msg.sender == owner);
        require(currency.rate != 0);
        require(newRate != 0);
        currency.rate = newRate;
        currency.timestamp = block.timestamp;
    }

    function setCost(string symbol, uint256 newCost) {
        Currency storage currency = currencies[symbol];
        require(msg.sender == owner);
        require(currency.rate != 0);
        currency.cost = newCost;
    }

    function setCost(string symbol, uint256 newCost, bool inCurrency) {
        Currency storage currency = currencies[symbol];
        require(msg.sender == owner);
        require(currency.rate != 0);
        currency.cost = newCost;
        currency.costInCurrency = inCurrency;
    }

    function transfer(address to) {
        require(msg.sender == owner);
        require(to != address(0));
        owner = to;
    }

    function setBlacklisted(address _address, bool blacklisted) {
        require(msg.sender == owner);
        blacklist[_address] = blacklisted;
    }
}