pragma solidity ^0.4.24;

import "./../../interfaces/ILoanManager.sol";
import "./../../interfaces/Cosigner.sol";


contract TestLoanManagerForReferenceCosigner is ILoanManager {
    function getStatus(uint256 _id) external view returns (uint256) {}
    function debtEngine() external view returns (address){}
    function getDueTime(uint256 _id) external view returns (uint256) {}
    function ownerOf(uint256 _id) external view returns (address) {}
    function getOracle(uint256 _id) external view returns (address) {}
    function getClosingObligation(uint256 _id) external view returns (uint256) {}
    function safeTransferFrom(address _from, address _to, uint256 _assetId) external{}

    function requestCosign(
        uint256 _id,
        address _cosigner,
        bytes _cosignerData
    ) external {
        Cosigner(_cosigner).requestCosign(
            address(this),
            _id,
            _cosignerData,
            ""
        );
    }

    function cosign(uint256 _id, uint256 _cost) external returns (bool) {
        if (_cost == 0)
            return true;
    }
}
