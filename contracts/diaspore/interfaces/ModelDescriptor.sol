pragma solidity ^0.5.0;

contract ModelDescriptor {
    bytes4 internal constant MODEL_DESCRIPTOR_INTERFACE = 0x02735375;
    function simFirstObligation(bytes data) external view returns (uint256 amount, uint256 time);
    function simTotalObligation(bytes data) external view returns (uint256 amount);
    function simDuration(bytes data) external view returns (uint256 duration);
    function simPunitiveInterestRate(bytes data) external view returns (uint256 punitiveInterestRate);
    function simFrequency(bytes data) external view returns (uint256 frequency);
    function simInstallments(bytes data) external view returns (uint256 installments);
}