pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../../../utils/SafeERC20.sol";
import "../../../core/diaspore/cosigner/Collateral.sol";
import "../../../core/diaspore/cosigner/interfaces/CollateralHandler.sol";
import "../../../core/diaspore/utils/DiasporeUtils.sol";


contract TestCollateralHandler {
    using DiasporeUtils for LoanManager;
    using SafeERC20 for IERC20;

    event Handle(uint256 _amountToPay, uint256 _amountReturn);

    LoanManager public loanManager;
    DebtEngine public debtEngine;
    IERC20 public loanManagerToken;
    Collateral public collateral;

    uint256 amountToPay;
    uint256 amountReturn;

    constructor(Collateral _collateral) public {
        collateral = _collateral;
        loanManager = _collateral.loanManager();
        debtEngine = loanManager.debtEngine();
        loanManagerToken = loanManager.token();
    }

    function setHandlerConst(
        uint256 _amountToPay,
        uint256 _amountReturn
    ) external {
        amountToPay = _amountToPay;
        amountReturn = _amountReturn;
    }

    function handle(
        uint256 _entryId,
        uint256 _amount,
        bytes calldata _data
    ) external returns (uint256) {
        (bytes32 debtId,,, IERC20 token,,) = collateral.entries(_entryId);

        loanManager.safePayToken(
            debtId,
            amountToPay,
            address(this),
            _data
        );

        require(token.safeApprove(address(collateral), amountReturn), "TestCollateralHandler: error approving collateral");

        emit Handle(amountToPay, amountReturn);

        return amountReturn;
    }
}
