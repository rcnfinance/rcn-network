pragma solidity ^0.4.24;

interface LoanRequester {
    function loanRequested(bytes32[8] requestData, bytes loanData, bool isBorrower, uint256 returnFlag) external returns (uint256);
}