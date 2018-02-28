pragma solidity ^0.4.15;

import "./../../interfaces/Oracle.sol";

contract TestOracle {
    function url() constant returns (string) {
        return "";
    }

    function getRate(bytes32 currency, bytes data) constant returns (uint256) {
        return block.timestamp;
    }
}