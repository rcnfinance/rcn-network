pragma solidity ^0.4.15;

import "./../interfaces/Oracle.sol";
import "./../interfaces/Token.sol";

// by Agusx1211 27/07/2017
contract BasicOracle is Oracle {
    uint256 public constant VERSION = 2;

    Token public token;
    address public owner;
    address public provider;

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

    /**
        @param symbol Target symbol

        @return The Unix time of the last update of the given symbol, 0 if not implemented.
    */
    function getTimestamp(string symbol) constant returns(uint256) {
        return currencies[symbol].timestamp;
    }
    
    /**
        @dev Sells the current rate of a given symbol, the msg.sender must previously call "approve" on the RCN Token
        with the cost defined in the method "getCost", throws if not implemented.

        @param symbol Target symbol

        @return The current rate of the symbol
    */
    function getRateFor(string symbol) returns(uint256) {
        uint256 rate = currencies[symbol].rate;
        require(!blacklist[msg.sender]);
        require(rate != 0);
        uint256 cost = getCost(symbol);
        require(token.transferFrom(msg.sender, owner, cost));
        RateDelivered(rate, cost, currencies[symbol].timestamp, symbol);
        return rate;
    }

    /**
        @dev Provides the current rate of a symbol without charging the msg.sender, cannot be used by contracts;
        it's intended use is to know in advance how much RCN will take an operation using this oracle.

        @param symbol Target symbol

        @return The current rate of a symbol
    */
    function getRateForExternal(string symbol) constant returns (uint256) {
        require(!isContract(msg.sender));
        require(!blacklist[msg.sender]);
        return currencies[symbol].rate;
    }

    /**
        @return true if an address is an ethereum contract
    */
    function isContract(address addr) internal returns (bool) {
        uint size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }

    /**
        @dev The cost of calling "getRate" could be fixed in RCN or using the same currency of the oracle, it also can
        variate on the next block, so this value sometimes is only an approximation.

        @param symbol Target symbol

        @return The current cost of calling "getRate" for the same symbol, if it returns 0 the call is free.
    */
    function getCost(string symbol) constant returns (uint256) {
        Currency storage currency = currencies[symbol];
        if (currency.costInCurrency) {
            return currency.cost * currency.rate;
        } else {
            return currency.cost;
        }
    }

    /**
        @param symbol Target symbol

        @return The unit used to define the rate of the currency
    */
    function getDecimals(string symbol) constant returns(uint256) {
        return currencies[symbol].decimals;
    }

    /**
        @dev Adds a symbol to the oracle

        @param symbol String code of the symbol
        @param _decimals Unit used to define the rate of the currency, Ej: 2 = cents
        @param _rate Initial rate of the symbol
        @param _cost Cost to call the method "getRate"
        @param _costInCurrency True if the _cost is multiplied by the _rate, false if it's fixed in RCN.
    */
    function createSymbol(string symbol, uint8 _decimals, uint256 _rate, uint256 _cost, bool _costInCurrency) {
        require(msg.sender == owner);
        require(_rate != 0);
        NewSymbol(symbol, _decimals);
        currencies[symbol] = Currency(_decimals, _rate, _cost, block.timestamp, _costInCurrency);
    }

    /**
        @dev Updates the rate of a symbol and the timestamp of the last update.

        @param symbol Target symbol
        @param newRate New rate of the symbol, in RCN
    */
    function setRate(string symbol, uint256 newRate) {
        Currency storage currency = currencies[symbol];
        require(msg.sender == provider || msg.sender == owner);
        require(currency.rate != 0);
        require(newRate != 0);
        currency.rate = newRate;
        currency.timestamp = block.timestamp;
    }

    /**
        @dev Changes the cost of calling "getRate", keeping the costInCurrency setting.

        @param symbol Target symbol
        @param newCost New cost of calling "getRate"
    */
    function setCost(string symbol, uint256 newCost) {
        Currency storage currency = currencies[symbol];
        require(msg.sender == provider || msg.sender == owner);
        require(currency.rate != 0);
        currency.cost = newCost;
    }

    /**
        @dev Changes the cost of calling "getRate", and changes if it's fixed in RCN or not.

        @param symbol Target symbol
        @param newCost New cost of calling "getRate"
        @param inCurrency New setting for costInCurrency param
    */
    function setCost(string symbol, uint256 newCost, bool inCurrency) {
        Currency storage currency = currencies[symbol];
        require(msg.sender == provider || msg.sender == owner);
        require(currency.rate != 0);
        currency.cost = newCost;
        currency.costInCurrency = inCurrency;
    }

    /**
        @dev Transfers the ownership of the oracle

        @param to New owner of the oracle
    */
    function transfer(address to) {
        require(msg.sender == owner);
        require(to != address(0));
        owner = to;
    }

    /**
        @dev Sets a provider, the provider is an address that can update the cost and rate of the oracle symbols.

        @param _provider Address of the new provider
    */
    function setProvider(address _provider) {
        require(msg.sender == owner);
        provider = _provider;
    }

    function withdrawal(Token token, address to, uint256 amount) returns (bool) {
        require(msg.sender == owner);
        return token.transfer(to, amount);
    }

    /**
        @dev Blacklisted address cannot call "getRate" method; this is a security feature added to avoid "proxy" oracles

        @param _address Target address
        @param blacklisted Defines if that address is blacklisted or not, all addresses are not blacklisted by default
    */
    function setBlacklisted(address _address, bool blacklisted) {
        require(msg.sender == owner);
        blacklist[_address] = blacklisted;
    }
}