pragma solidity ^0.5.6;


contract ModelDescriptor {
    bytes4 internal constant MODEL_DESCRIPTOR_INTERFACE = 0x02735375;

    function simFirstObligation(bytes calldata data) external view returns (uint256 amount, uint256 time);
    function simTotalObligation(bytes calldata data) external view returns (uint256 amount);
    function simDuration(bytes calldata data) external view returns (uint256 duration);
    function simPunitiveInterestRate(bytes calldata data) external view returns (uint256 punitiveInterestRate);
    function simFrequency(bytes calldata data) external view returns (uint256 frequency);
    function simInstallments(bytes calldata data) external view returns (uint256 installments);
}
