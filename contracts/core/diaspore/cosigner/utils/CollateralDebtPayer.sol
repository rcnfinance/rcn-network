pragma solidity ^0.5.11;

import "../../../../interfaces/TokenConverter.sol";
import "../../../../interfaces/IERC20.sol";
import "../../../../utils/SafeERC20.sol";
import "../interfaces/CollateralHandler.sol";
import "../../DebtEngine.sol";
import "../Collateral.sol";


contract CollateralDebtPayer is CollateralHandler {
    using SafeERC20 for IERC20;

    struct Action {
        TokenConverter converter;
        IERC20 base;
        IERC20 token;
        DebtEngine engine;
        bytes32 debtId;
        uint256 amount;
        uint256 minReturn;
        bytes data;
    }

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
        Action memory action = _newAction();

        // Encode all initial parameters on action memory struct
        // doesn't fit on current EVM stack
        (
            action.converter,
            action.amount,
            action.minReturn,
            action.data
        ) = abi.decode(_data, (TokenConverter, uint256, uint256, bytes));

        // Read collateral info
        Collateral collateral = Collateral(msg.sender);
        (action.debtId,,,action.token,,) = collateral.entries(_entryId);

        // Read debt info
        action.engine = collateral.loanManager().debtEngine();
        action.base = action.engine.token();

        // Convert amount before payment
        uint256 paying = _convert(action);

        // Pay requested amount
        uint256 paidToken = _pay(
            action,
            paying
        );

        // Refund extra base token
        if (paidToken < paying) {
            require(
                action.base.transfer(collateral.ownerOf(_entryId), paying - paidToken),
                "collateral-debt-payer: error sending base surplus"
            );
        }

        // Approve surplus return to collateral
        surplus = _total - action.amount;
        action.token.approve(address(collateral), surplus);
    }

    function _convert(
        Action memory _action
    ) private returns (uint256 bought) {
        if (_action.token == _action.base) {
            bought = _action.amount;
        } else {
            _action.token.approve(address(_action.converter), _action.amount);
            bought = _action.converter.convertFrom(
                _action.token,
                _action.base,
                _action.amount,
                _action.minReturn
            );

            _action.token.clearApprove(address(_action.converter));
        }
    }

    function _pay(
        Action memory _action,
        uint256 _paying
    ) private returns (uint256 paid) {
        _action.base.approve(address(_action.engine), _paying);
        (, paid) = _action.engine.payToken(
            _action.debtId,
            _paying,
            msg.sender,
            _action.data
        );
    }

    function _newAction() private pure returns (Action memory action) {
        return Action(
            TokenConverter(address(0)),
            IERC20(address(0)),
            IERC20(address(0)),
            DebtEngine(address(0)),
            bytes32(0),
            0,
            0,
            ""
        );
    }
}
