pragma solidity ^0.4.24;

interface DebtModel {
    // Meta
    function getVersion() external returns (bytes32);
    function getOwner() external returns (address);
    // Getters
    function getStatus(bytes32 id) external view returns (uint256);
    function getPaid(bytes32 id) external view returns (uint256);
    function getDebt(bytes32 id) external view returns (uint256);
    function getClock(bytes32 id) external view returns (uint256);
    // Interface
    function getDueTime(bytes32 id) external view returns (uint256);
    function create(bytes32 id, bytes32[] loanData) external returns (bool);
    function validate(bytes32[] loanData) external view returns (bool);
    function addPaid(bytes32 id, uint256 target) external returns (uint256 real);
    function advanceClock(bytes32 id, uint256 to) external returns (bool);
}