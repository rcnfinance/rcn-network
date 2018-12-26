pragma solidity ^0.5.0;


interface IDebtEngine {
    function withdraw(bytes32 _id, address _to) external returns (uint256 amount);
    function withdrawPartial(bytes32 _id, address _to, uint256 _amount) external returns (bool success);
    function approve(address _operator, uint256 _assetId) external;
    function safeTransferFrom(address _from, address _to, uint256 _assetId) external;
}
