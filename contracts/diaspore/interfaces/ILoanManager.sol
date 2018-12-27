pragma solidity ^0.5.0;


interface ILoanManager {
    function debtEngine() external view returns (address);
    function getBorrower(uint256 _id) external view returns (address);
    function getCreator(uint256 _id) external view returns (address);
    function getStatus(uint256 _id) external view returns (uint256);
    function getDueTime(uint256 _id) external view returns (uint256);
    function ownerOf(uint256 _id) external view returns (address);
    function getOracle(uint256 _id) external view returns (address);
    function getClosingObligation(uint256 _id) external view returns (uint256);
    function isApproved(uint256 _id) external view returns (bool);

    function cosign(uint256 _id, uint256 _cost) external returns (bool);
    function safeTransferFrom(address _from, address _to, uint256 _assetId) external;
    function requestLoan(uint128 _amount, address _model, address _oracle, address _borrower, uint256 _salt, uint64 _expiration, bytes calldata _loanData) external returns (bytes32 id);
    function registerApproveRequest(bytes32 _id, bytes calldata _signature) external returns (bool approved);
}
