pragma solidity ^0.5.11;

import "../../../../interfaces/TokenConverter.sol";
import "../../../../interfaces/IERC20.sol";
import "../../../../utils/SafeERC20.sol";
import "../interfaces/CollateralHandler.sol";
import "../../DebtEngine.sol";
import "../Collateral.sol";


contract CollateralDebtPayer is CollateralHandler {
    using SafeERC20 for IERC20;

    function encode(
        address _converter,
        uint256 _amount,
        uint256 _minReturn,
        bytes calldata _oracleData
    ) external pure returns (bytes memory) {
        return abi.encode(
            _converter,
            _amount,
            _minReturn,
            _oracleData
        );
    }

    function handle(
        uint256 _entryId,
        uint256 _total,
        bytes calldata _data
    ) external returns (uint256 surplus) {
        (
            TokenConverter converter,
            uint256 amount,
            uint256 minReturn,
            bytes memory oracleData
        ) = abi.decode(_data, (TokenConverter, uint256, uint256, bytes));

        // Read collateral info
        Collateral collateral = Collateral(msg.sender);
        (bytes32 debtId,,,IERC20 token,,) = collateral.entries(_entryId);

        // Read debt info
        DebtEngine debtEngine = collateral.loanManager().debtEngine();
        IERC20 base = debtEngine.token();

        // Convert amount before payment
        uint256 paying;
        if (token == base) {
            paying = amount;
        } else {
            token.approve(address(converter), amount);
            paying = converter.convertFrom(
                token,
                base,
                amount,
                minReturn
            );

            token.clearApprove(address(converter));
        }

        // Pay requested amount
        base.approve(address(debtEngine), paying);
        (, uint256 paidToken) = debtEngine.payToken(
            debtId,
            paying,
            msg.sender,
            oracleData
        );

        if (paidToken < paying) {
            // require(
            //     base.transfer(collateral.ownerOf(_entryId), paying - paidToken),
            //     "collateral-debt-payer: error sending base surplus"
            // );
        }

        // Approve surplus return to collateral
        surplus = _total - amount;
        token.approve(address(collateral), surplus);
    }
}
