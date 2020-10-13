pragma solidity ^0.6.6;

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

    bool skipPayment;

    constructor(Collateral _collateral) public {
        collateral = _collateral;
        loanManager = _collateral.loanManager();
        debtEngine = loanManager.debtEngine();
        loanManagerToken = loanManager.token();
    }

    function encode(
        IERC20 _token,
        uint256 surplus
    ) external pure returns (bytes memory) {
        return abi.encode(_token, surplus);
    }

    function setSkipPayment(bool _skip) external {
        skipPayment = _skip;
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
        uint256,
        bytes calldata _data
    ) external returns (uint256) {
        if (skipPayment) {
            (IERC20 token, uint256 surplus) = abi.decode(_data, (IERC20, uint256));

            token.approve(msg.sender, surplus);

            return surplus;
        } else {
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
}
