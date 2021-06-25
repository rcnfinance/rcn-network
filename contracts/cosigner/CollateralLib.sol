pragma solidity ^0.8.0;

import "../interfaces/RateOracle.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../utils/Fixed224x32.sol";

import "../utils/OracleUtils.sol";


/**
    @title Loan collateral simulator
    @author Agustin Aguilar <agustin@ripiocredit.network> & Victor Fage <victor.fage@ripiocredit.network>
    @notice Implements schemes and rules for a generic collateralization,
        and liquidations for under-collateralized entries
    @dev `debt` and `collateral` may not be in the same currency,
        in such a case, an oracle is used to compare both
    @dev `base` and `tokens` calls to Oracle are inverted, in this context
        the `tokens` value provided by the Oracle corresponds to the `base` tokens value
*/
library CollateralLib {
    using CollateralLib for CollateralLib.Entry;
    using OracleUtils for OracleUtils.Sample;
    using OracleUtils for RateOracle;
    using Fixed224x32 for bytes32;

    struct Entry {
        bytes32 debtId;
        uint256 amount;
        RateOracle oracle;
        IERC20 token;
        uint96 liquidationRatio;
        uint96 balanceRatio;
    }

    /**
        @notice Builds a Collateral struct with the provided data.

        @dev The library is only compatible with Oracles that don't require `oracleData`,
            this condition is not validated at this stage

        @param _oracle Oracle for the collateral
        @param _token Token used as collateral
        @param _debtId Debt ID tied to the collateral
        @param _amount Amount of `_token` provided as collateral
        @param _liquidationRatio collateral/debt ratio that triggers a liquidation
        @param _balanceRatio collateral/debt ratio aimed during collateral liquidation

        @return _col The new Collateral Entry in memory
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
        require(_liquidationRatio > 2 ** 32, "collateral-lib: _liquidationRatio should be above one");
        require(address(_token) != address(0), "collateral-lib: _token can't be address zero");

        _col.oracle = _oracle;
        _col.token = _token;
        _col.debtId = _debtId;
        _col.amount = _amount;
        _col.liquidationRatio = _liquidationRatio;
        _col.balanceRatio = _balanceRatio;
    }

    /**
        @notice Calculates the value of a given collateral in `base` tokens
            by reading the oracle and applying the convertion rate
            to the collateral amount

        @param _col Collateral entry in memory

        @return The vaule of the collateral amount in `base` tokens
    */
    function toBase(
        Entry memory _col
    ) internal view returns (uint256) {
        return _col.oracle
            .readStatic()
            .toTokens(_col.amount);
    }

    /**
        @dev Returns the collateral/debt ratio between the collateral
            and the provided `_debt` value.

        @param _col Collateral entry in memory
        @param _debt Current total debt in `base`

        @return Fixed224x32 with collateral ratio
    */
    function ratio(
        Entry memory _col,
        uint256 _debt
    ) internal view returns (bytes32) {
        bytes32 dividend = Fixed224x32.from(_col.toBase());
        bytes32 divisor = Fixed224x32.from(_debt);

        return dividend.div(divisor);
    }

    /**
        @notice Returns the amount of collateral that has to be sold
            in order to make the ratio reach `balanceRatio` for a given debt

        @dev Assumes that the collateral can be sold at the rate provided by the oracle,
            the result is an estimation

        @param _col Collateral entry in memory
        @param _debt Current total debt in `base`

        @return _sell The amount required to be bought
        @return _buy An estimation of the expected used collateral
    */
    function balance(
        Entry memory _col,
        uint256 _debt
    ) internal view returns (uint256 _sell, uint256 _buy) {
        // Read oracle
        OracleUtils.Sample memory sample = _col.oracle.readStatic();

        // Create fixed point variables
        bytes32 liquidationRatio = Fixed224x32.raw(_col.liquidationRatio);
        uint256 base = sample.toTokens(_col.amount);
        bytes32 baseRaw = Fixed224x32.from(base);
        bytes32 debt = Fixed224x32.from(_debt);

        // Calculate target limit to reach
        bytes32 limit = debt.mul(liquidationRatio);

        // If current collateral is above limit
        // balance is not needed
        if (limit.lt(baseRaw)) {
            return (0, 0);
        }

        // Load balance ratio to fixed point
        bytes32 balanceRatio = Fixed224x32.raw(_col.balanceRatio);

        // Calculate diff between current collateral and the limit needed
        bytes32 diff = debt.mul(balanceRatio).sub(baseRaw);
        _buy = diff.div(balanceRatio.sub(Fixed224x32.from(1))).toUint256();

        // Estimate how much collateral has to be sold to obtain
        // the required amount to buy
        _sell = sample.toBase(_buy);

        // If the amount to be sold is above the total collateral of the entry
        // the entry is under-collateralized and all the collateral must be sold
        if (_sell > _col.amount) {
            return (_col.amount, base);
        }

        return (_sell, _buy);
    }

    /**
        @dev Calculates how much collateral can be withdawn before
            reaching the liquidation ratio.

        @param _col Collateral entry in memory
        @param _debt Current total debt in `base`

        @return The amount of collateral that can be withdawn without
            reaching the liquidation ratio (in `tokens`)
    */
    function canWithdraw(
        Entry memory _col,
        uint256 _debt
    ) internal view returns (uint256) {
        if (_debt == 0) {
            return _col.amount;
        }
        OracleUtils.Sample memory sample = _col.oracle.readStatic();

        // Load values and turn it into fixed point
        bytes32 base = Fixed224x32.from(sample.toTokens(_col.amount));
        bytes32 liquidationRatio = Fixed224x32.raw(_col.liquidationRatio);

        // Calculate _debt collateral liquidation limit
        bytes32 limit = Fixed224x32.from(_debt).mul(liquidationRatio);

        // If base is below limit, we can't withdraw collateral
        // (we need to liquidate collateral)
        if (base.lte(limit)) {
            return 0;
        }

        // Return remaining to reach liquidation
        return sample.toBase(base.sub(limit.ceil()).toUint256());
    }

    /**
        @dev Defines if a collateral entry got under the liquidation threshold.

        @param _col Collateral entry in memory
        @param _debt Current total debt in `base`

        @return `true` if the collateral entry has to be liquidated.
    */
    function inLiquidation(
        Entry memory _col,
        uint256 _debt
    ) internal view returns (bool) {
        // If debt is zero the collateral can't be
        // in liquidation
        if (_debt == 0) {
            return false;
        }

        // Compare the liquidation ratio with the real collateral/debt ratio
        return _col.ratio(_debt).lt(Fixed224x32.raw(_col.liquidationRatio));
    }
}
