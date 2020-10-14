pragma solidity ^0.6.6;

import "../../interfaces/TokenConverter.sol";
import "../../interfaces/IERC20.sol";
import "../../utils/SafeERC20.sol";
import "../interfaces/CollateralHandler.sol";
import "../../DebtEngine.sol";
import "../Collateral.sol";


/**
    @title Helper for paying debt using collateral
    @author Agustin Aguilar <agustin@ripiocredit.network>
    @notice Handles ERC-20 sent to the contract sent by the collateral contract,
        converts them using a `TokenConverter` interface and uses the tokens
        to pay an RCN loan, any extra tokens are sent to the owner of the collateral
*/
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
        address refundTo;
        bytes oracleData;
    }

    /**
        @notice Encodes a debt payment into a bytes array

        @dev Uses abi.encode(), it's a helper method

        @param _converter TokenConverter to convert collateral tokens into RCN tokens
        @param _amount Amount of collateral to be used to pay the loan
        @param _minReturn Minimum amount of RCN tokens to receive when converting the collateral tokens
        @param _refundTo The address where the refund tokens will be transferred
        @param _oracleData Aribitrary bytes array that may be used by the oracle of the loan to return a rate

        @return bytes array with the encoded debt payment
    */
    function encode(
        address _converter,
        uint256 _amount,
        uint256 _minReturn,
        address _refundTo,
        bytes calldata _oracleData
    ) external pure returns (bytes memory) {
        return abi.encode(
            _converter,
            _amount,
            _minReturn,
            _refundTo,
            _oracleData
        );
    }

    /**
        @notice Converts tokens sent to the contract and uses them to pay
            the RCN Loan, any extra RCN tokens are sent to the owner of the collateral

        @dev This method is expected to be called by the Collateral contract, or by
            a contract that implements a similar interface

        @param _entryId ID of the collateral entry
        @param _total Total amount of collateral available
        @param _oracleData bytes array that should contain an encoded debt payment

        @return surplus The surplus of collateral, that should be taken back by the Collateral contract
    */
    function handle(
        uint256 _entryId,
        uint256 _total,
        bytes calldata _oracleData
    ) external override returns (uint256 surplus) {
        Action memory action = _newAction();

        // Encode all initial parameters on action memory struct
        // because it doesn't fit with the current EVM stack limit
        (
            action.converter,
            action.amount,
            action.minReturn,
            action.refundTo,
            action.oracleData
        ) = abi.decode(_oracleData, (TokenConverter, uint256, uint256, address, bytes));

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
            require(action.refundTo != address(0), "collateral-debt-payer: refundTo should not be the address 0");
            require(
                action.base.safeTransfer(collateral.ownerOf(_entryId), paying - paidToken),
                "collateral-debt-payer: error sending base surplus"
            );
        }

        // Approve surplus return to collateral
        surplus = _total - action.amount;
        action.token.approve(address(collateral), surplus);
    }

    /**
        @notice Converts collateral tokens into tokens that can be used
            to pay an RCN loan, it uses a TokenConverter and enforces that a
            minimum amount of RCN tokens have been bought

        @dev If the collateral token matches the RCN token, no convertion takes place

        @param _action memory struct with the details of the operation

        @return bought How much RCN tokens have been bought
    */
    function _convert(
        Action memory _action
    ) private returns (uint256 bought) {
        if (_action.token == _action.base) {
            // If the collateral token matches the RCN token, no covertion takes place
            // and the bought amount of RCN tokens is the same as the sold amount, 1:1
            bought = _action.amount;
        } else {
            // The TokenConverter is trusted to perform the token convertion
            // a faulty TokenConverter could only damage the collateral owner funds
            // who is selecting the token converter in the first place
            require(_action.token.safeApprove(address(_action.converter), _action.amount), "collateral-debt-payer: error approving auction converter");

            bought = _action.converter.convertFrom(
                _action.token,
                _action.base,
                _action.amount,
                _action.minReturn
            );

            _action.token.clearApprove(address(_action.converter));
        }
    }

    /**
        @notice Pays the requested amount of an RCN loan

        @param _action memory struct with the details of the operation
        @param _paying amount of RCN tokens to be used during the payment

        @return paid How much tokes were used to paid the loan, if the loan
            is totally paid, it will be below `_paying`
    */
    function _pay(
        Action memory _action,
        uint256 _paying
    ) private returns (uint256 paid) {
        require(_action.base.safeApprove(address(_action.engine), _paying), "collateral-debt-payer: error approving engine");
        (, paid) = _action.engine.payToken(
            _action.debtId,
            _paying,
            msg.sender,
            _action.oracleData
        );
    }

    /**
        @dev Creates a memory internal struct for the Auction
    */
    function _newAction() private pure returns (Action memory action) {
        return Action(
            TokenConverter(address(0)),
            IERC20(address(0)),
            IERC20(address(0)),
            DebtEngine(address(0)),
            bytes32(0),
            0,
            0,
            address(0),
            ""
        );
    }
}
