pragma solidity ^0.4.19;


interface IDebtEngine {
    function withdraw(bytes32 _id, address _to) external returns (uint256 amount);
    function withdrawBatch(bytes32[] _ids, address _to) external returns (uint256 total);
    function withdrawPartial(bytes32 _id, address _to, uint256 _amount) external returns (bool success);
    function approve(address _operator, uint256 _assetId) external;
    function safeTransferFrom(address _from, address _to, uint256 _assetId) external;
}
