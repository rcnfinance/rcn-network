pragma solidity ^0.4.24;

interface DebtModel {
    event Created(bytes32 indexed _id);
    event ChangedClock(bytes32 indexed _id, uint64 _to);
    event ChangedPaid(bytes32 indexed _id, uint256 _paid);
    event ChangedDebt(bytes32 indexed _id, uint256 _debt);
    event ChangedStatus(bytes32 indexed _id, uint256 _status);
    event ChangedDueTime(bytes32 indexed _id, uint64 _dueTime);

    // Meta
    function getVersion() external returns (bytes32);
    function getOwner() external returns (address);
    function validate(bytes32[] loanData) external view returns (bool);
    // Getters
    function getStatus(bytes32 id) external view returns (uint256);
    function getPaid(bytes32 id) external view returns (uint256);
    function getDebt(bytes32 id) external view returns (uint256);
    function getClock(bytes32 id) external view returns (uint256);
    function getDueTime(bytes32 id) external view returns (uint256);
    // Interface
    function create(bytes32 id, bytes32[] loanData) external returns (bool);
    function addPaid(bytes32 id, uint256 target) external returns (uint256 real);
    function advanceClock(bytes32 id, uint256 to) external returns (bool);
}