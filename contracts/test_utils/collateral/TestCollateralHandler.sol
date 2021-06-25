pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../cosigner/Collateral.sol";
import "../../cosigner/interfaces/CollateralHandler.sol";
import "../../DebtEngine.sol";
import "../../LoanManager.sol";


contract TestCollateralHandler {
    using SafeERC20 for IERC20;

    event Handle(uint256 _amountToPay, uint256 _amountReturn);

    DebtEngine public debtEngine;
    IERC20 public loanManagerToken;
    Collateral public collateral;

    uint256 amountToPay;
    uint256 amountReturn;

    bool skipPayment;

    constructor(Collateral _collateral) {
        collateral = _collateral;
        LoanManager loanManager = _collateral.loanManager();
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

            loanManagerToken.safeApprove(address(debtEngine), amountToPay);

            debtEngine.payToken(
                debtId,
                amountToPay,
                address(this),
                _data
            );

            token.safeApprove(address(collateral), amountReturn);

            emit Handle(amountToPay, amountReturn);

            return amountReturn;
        }
    }
}