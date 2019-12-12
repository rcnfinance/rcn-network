pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";


contract TestCollateralAuction {
    function create(
        IERC20 _fromToken,
        uint256 _start,
        uint256 _ref,
        uint256 _limit,
        uint256 _amount
    ) external returns (uint256 id) {
        return 1;
    }
}
