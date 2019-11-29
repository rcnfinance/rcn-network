pragma solidity ^0.5.11;

import "../interfaces/RateOracle.sol";
import "../../../interfaces/IERC20.sol";
import "../../../commons/Fixed223x32.sol";
import "../../../utils/Math.sol";

import "../utils/OracleUtils.sol";
import "../LoanManager.sol";


library CollateralLib {
    using CollateralLib for CollateralLib.Entry;
    using OracleUtils for OracleUtils.Sample;
    using OracleUtils for RateOracle;
    using Fixed223x32 for bytes32;

    struct Entry {
        bytes32 debtId;
        uint256 amount;
        RateOracle oracle;
        IERC20 token;
        uint96 liquidationRatio;
        uint96 balanceRatio;
    }

    /*
        Creates a Collateral entry with the provided data.

        @param _oracle Oracle for the collateral
        @param _token Token used as collateral
        @param _debtId Debt ID tied to the collateral
        @param _amount Amount of `_token` provided as collateral
        @param _liquidationRatio Collateral ratio to trigger liquidation
        @param _balanceRatio Collateral ratio aimed during collateral liquidation
    */
    function create(
        RateOracle _oracle,
        IERC20 _token,
        bytes32 _debtId,
        uint256 _amount,
        uint96 _liquidationRatio,
        uint96 _balanceRatio
    ) internal pure returns (Entry memory _col) {
        require(_liquidationRatio < _balanceRatio, "collateral-lib: _liquidationRatio should be below _balanceRatio");
        require(_liquidationRatio >= 2 ** 32, "collateral-lib: _liquidationRatio should be above one");
        require(address(_token) != address(0), "collateral-lib: _token can't be address zero");

        _col.oracle = _oracle;
        _col.token = _token;
        _col.debtId = _debtId;
        _col.amount = _amount;
        _col.liquidationRatio = _liquidationRatio;
        _col.balanceRatio = _balanceRatio;
    }

    /*
        Returns the value of a given collateral, in `base` tokens
    */
    function toBase(
        Entry memory _col
    ) internal returns (uint256) {
        return _col.oracle
            .read()
            .toTokens(_col.amount);
    }

    /*
        Returns the collaterization ratio between the collateral
        and the provided `_debt` value.

        @dev `_debt` is an amount in `base` tokens
    */
    function ratio(
        Entry memory _col,
        uint256 _debt
    ) internal returns (bytes32) {
        bytes32 dividend = Fixed223x32.from(_col.toBase());
        bytes32 divisor = Fixed223x32.from(_debt);

        return dividend.div(divisor);
    }

    /*
        Returns the amount of collateral that has to be sold
        in order to make the ratio at least `balanceRatio` for a given debt.

        @notice Assumes that the collateral can be sold at the rate provided by the oracle
    */
    function balance(
        Entry memory _col,
        uint256 _debt
    ) internal returns (uint256) {
        // Read oracle
        OracleUtils.Sample memory sample = _col.oracle.read();

        // Create fixed point variables
        bytes32 liquidationRatio = Fixed223x32.raw(_col.liquidationRatio);
        bytes32 base = Fixed223x32.from(sample.toTokens(_col.amount));
        bytes32 debt = Fixed223x32.from(_debt);

        // Calculate target limit to reach
        bytes32 limit = debt.mul(liquidationRatio);

        // If current collateral is above limit
        // balance is not needed
        if (limit.lt(base)) {
            return 0;
        }

        // Load balance ratio to fixed point
        bytes32 balanceRatio = Fixed223x32.raw(_col.balanceRatio);

        // Calculate diff between current collateral and the limit needed
        bytes32 diff = debt.mul(balanceRatio).sub(base);

        // Return how much collateral has to be sold
        return Math.min(
            sample.toBase(diff.div(balanceRatio.sub(Fixed223x32.from(1))).toUint256()),
            _col.amount
        );
    }

    /*
        Returns how much collateral can be withdrew without reaching the
        liquidation ratio.
    */
    function canWithdraw(
        Entry memory _col,
        uint256 _debt
    ) internal returns (uint256) {
        OracleUtils.Sample memory sample = _col.oracle.read();

        // Load values and turn it into fixed point
        bytes32 base = Fixed223x32.from(sample.toTokens(_col.amount));
        bytes32 liquidationRatio = Fixed223x32.raw(_col.liquidationRatio);

        // Calculate _debt collateral liquidation limit
        bytes32 limit = Fixed223x32.from(_debt).mul(liquidationRatio);

        // If base is below limit, we can't withdraw collateral
        // (we need to liquidate collateral)
        if (base.lt(limit)) {
            return 0;
        }

        // Return remaining to reach liquidation
        return sample.toBase(base.sub(limit.ceil()).toUint256());
    }

    /*
        Returns `true` if the collateral is below the liquidation ratio
    */
    function inLiquidation(
        Entry memory _col,
        uint256 _debt
    ) internal returns (bool) {
        if (_debt == 0) {
            return false;
        }

        return _col.ratio(_debt).lt(Fixed223x32.raw(_col.liquidationRatio));
    }
}
