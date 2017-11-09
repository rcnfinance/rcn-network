pragma solidity ^0.4.15;

contract Oracle {
    event NewSymbol(string _symbol, uint8 _decimals);
    function getTimestamp(string symbol) constant returns(uint256);
    function getRateFor(string symbol) returns (uint256);
    function getCost(string symbol) constant returns (uint256);
    function getDecimals(string symbol) constant returns (uint256);
}