pragma solidity ^0.4.15;

import './Oracle.sol';

contract Engine {
    uint256 public VERSION;
    string public VERSION_NAME;

    enum Status { initial, lent, paid, destroyed }
    struct Approbation {
        bool approved;
        bytes data;
        bytes32 checksum;
    }

    function getTotalLoans() constant returns (uint256);
    function getOracle(uint index) constant returns (Oracle);
    function getBorrower(uint index) constant returns (address);
    function getCosigner(uint index) constant returns (address);
    function ownerOf(uint256) constant returns (address owner);
    function getCreator(uint index) constant returns (address);
    function getAmount(uint index) constant returns (uint256);
    function getPaid(uint index) constant returns (uint256);
    function getDueTime(uint index) constant returns (uint256);
    function getApprobation(uint index, address _address) constant returns (bool);
    function getStatus(uint index) constant returns (Status);
    function isApproved(uint index) constant returns (bool);
    function getPendingAmount(uint index) constant public returns (uint256);
    function getCurrency(uint index) constant public returns (bytes32);
    function cosign(uint index, uint256 cost) external returns (bool);
    function approveLoan(uint index) public returns (bool);
    function transfer(address to, uint256 index) public returns (bool);
    function takeOwnership(uint256 index) public returns (bool);
    function withdrawal(uint index, address to, uint256 amount) public returns (bool);
}