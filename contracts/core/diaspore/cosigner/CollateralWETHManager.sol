pragma solidity ^0.5.8;

import "../../../interfaces/IERC20.sol";
import "./Collateral.sol";



contract CollateralWETHManager {
    function create(
        bytes32 _debtId,
        RateOracle _oracle,
        uint32 _liquidationRatio,
        uint32 _balanceRatio,
        uint32 _burnFee,
        uint32 _rewardFee
    ) external payable returns (uint256 entryId) {
        
    }
}
