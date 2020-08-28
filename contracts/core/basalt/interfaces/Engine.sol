/* solium-disable */
pragma solidity ^0.6.6;

import "./Oracle.sol";

interface Engine {
    enum Status { initial, lent, paid, destroyed }
    struct Approbation {
        bool approved;
        bytes data;
        bytes32 checksum;
    }

    function getTotalLoans() external view returns (uint256);
    function getOracle(uint index) external view returns (Oracle);
    function getBorrower(uint index) external view returns (address);
    function getCosigner(uint index) external view returns (address);
    function getCreator(uint index) external view returns (address);
    function getAmount(uint index) external view returns (uint256);
    function getPaid(uint index) external view returns (uint256);
    function getDueTime(uint index) external view returns (uint256);
    function getApprobation(uint index, address _address) external view returns (bool);
    function getStatus(uint index) external view returns (Status);
    function isApproved(uint index) external view returns (bool);
    function getPendingAmount(uint index) external returns (uint256);
    function getCurrency(uint index) external view returns (bytes32);
    function cosign(uint index, uint256 cost) external returns (bool);
    function approveLoan(uint index) external returns (bool);
    function withdrawal(uint index, address to, uint256 amount) external returns (bool);
}
