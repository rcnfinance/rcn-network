pragma solidity ^0.5.0;


interface ILoanManager {
    function getBorrower(bytes32 _id) external view returns (address);
    function getCreator(bytes32 _id) external view returns (address);
    function getDueTime(bytes32 _id) external view returns (uint256);
    function getApproved(bytes32 _id) external view returns (bool);
    function getStatus(bytes32 _id) external view returns (uint256);
    function ownerOf(bytes32 _id) external view returns (address);

    function cosign(bytes32 _id, uint256 _cost) external returns (bool);
    function safeTransferFrom(address _from, address _to, uint256 _assetId) external;
    function requestLoan(uint128 _amount, address _model, address _oracle, address _borrower, uint256 _salt, uint64 _expiration, bytes calldata _loanData) external returns (bytes32 id);
    function registerApproveRequest(bytes32 _id, bytes calldata _signature) external returns (bool approved);
}
