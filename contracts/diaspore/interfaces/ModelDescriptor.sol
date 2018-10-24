pragma solidity ^0.4.24;

contract ModelDescriptor {
    function simFirstObligation(bytes data) external view returns (uint256 amount, uint256 time);
    function simTotalObligation(bytes data) external view returns (uint256 amount);
    function simDuration(bytes data) external view returns (uint256 duration);
    function simPunitiveInterestRate(bytes data) external view returns (uint256 punitiveInterestRate);
    function simFrequency(bytes data) external view returns (uint256 frequency);
    function simInstallments(bytes data) external view returns (uint256 installments);
}