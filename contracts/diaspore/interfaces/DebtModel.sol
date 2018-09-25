pragma solidity ^0.4.24;

import "./../../interfaces/ERC165.sol";

contract DebtModel is ERC165 {
    event Created(bytes32 indexed _id);
    event ChangedClock(bytes32 indexed _id, uint64 _to);
    event ChangedPaid(bytes32 indexed _id, uint256 _paid);
    event ChangedDebt(bytes32 indexed _id, uint256 _debt);
    event ChangedStatus(bytes32 indexed _id, uint256 _status);
    event ChangedDueTime(bytes32 indexed _id, uint64 _dueTime);

    // Debt model interface selector
    bytes4 internal debtModelInterface = 
    this.validate.selector
    ^ this.getStatus.selector
    ^ this.getPaid.selector
    ^ this.getDebt.selector
    ^ this.getDueTime.selector
    ^ this.create.selector
    ^ this.addPaid.selector;

    uint256 public constant STATUS_ONGOING = 1;
    uint256 public constant STATUS_PAID = 2;

    // Meta
    function isOperator(address operator) external view returns (bool);
    function validate(bytes32[] loanData) external view returns (bool);
    // Getters
    function getStatus(bytes32 id) external view returns (uint256);
    function getPaid(bytes32 id) external view returns (uint256);
    function getDebt(bytes32 id) external view returns (uint256);
    function getDueTime(bytes32 id) external view returns (uint256);
    // Interface
    function create(bytes32 id, bytes32[] loanData) external returns (bool);
    function addPaid(bytes32 id, uint256 amount) external returns (uint256 real);
    function run(bytes32 id) external returns (bool);
}