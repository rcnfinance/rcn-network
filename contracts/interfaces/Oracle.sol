pragma solidity ^0.4.10;

contract Oracle {
	function getTimestamp(string symbol) returns (uint64);
    function getRateFor(string symbol) returns(uint256);
    function getCost(string symbol) external constant returns (uint256);
    function getDecimals(string symbol) external constant returns (uint256);
}