pragma solidity ^0.6.6;

import "../../cosigner/CollateralLib.sol";
import "../../interfaces/RateOracle.sol";
import "../../interfaces/IERC20.sol";


contract TestCollateralLib {
    using CollateralLib for CollateralLib.Entry;

    CollateralLib.Entry public entry;

    function create(
        RateOracle _oracle,
        IERC20 _token,
        bytes32 _debtId,
        uint256 _amount,
        uint96 _liquidationRatio,
        uint96 _balanceRatio
    ) external {
        entry = CollateralLib.create(
            _oracle,
            _token,
            _debtId,
            _amount,
            _liquidationRatio,
            _balanceRatio
        );
    }

    function toBase() external view returns (uint256) {
        return entry.toBase();
    }

    function ratio(uint256 _debt) external view returns (uint256) {
        return uint256(entry.ratio(_debt));
    }

    function balance(uint256 _debt) external view returns (uint256, uint256) {
        return entry.balance(_debt);
    }

    function canWithdraw(uint256 _debt) external view returns (uint256) {
        return entry.canWithdraw(_debt);
    }

    function inLiquidation(uint256 _debt) external view returns (bool) {
        return entry.inLiquidation(_debt);
    }
}
