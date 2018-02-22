pragma solidity ^0.4.15;

contract Cosigner {
    uint256 public constant VERSION = 2;
    function url() constant returns (string);
    function getCost(address engine, uint256 index, bytes data) constant returns (uint256);
    function cosign(address engine, uint256 index, bytes data) returns (bool);
}