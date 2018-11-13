pragma solidity ^0.4.24;

import "./../../interfaces/LoanApprover.sol";
import "./../../../utils/ERC165.sol";
import "./../../../utils/BytesUtils.sol";

contract TestLoanApprover is ERC165, LoanApprover, BytesUtils {
    enum ErrorBehavior {
        Revert,
        ReturnFalse,
        WrongReturn
    }

    bytes32 public expectedApprove;

    ErrorBehavior public errorBehavior;

    constructor() public {
        _registerInterface(0x76ba6009);
        _registerInterface(0xcd40239e);
        _registerInterface(0xbbfa4397);
    }

    function setExpectedApprove(
        bytes32 _expected
    ) external {
        expectedApprove = _expected;
    }

    function setErrorBehavior(
        ErrorBehavior _code
    ) external {
        errorBehavior = _code;
    }

    function approveRequest(
        bytes32 _futureDebt
    ) external returns (bytes32) {
        if (_futureDebt != expectedApprove) {
            if (errorBehavior == ErrorBehavior.Revert) {
                revert("Loan rejected");
            } else if (errorBehavior == ErrorBehavior.WrongReturn) {
                return _futureDebt;
            } else {
                return;
            }
        }

        return _futureDebt ^ 0xdfcb15a077f54a681c23131eacdfd6e12b5e099685b492d382c3fd8bfc1e9a2a;
    }

    function settleApproveRequest(
        bytes _requestData,
        bytes _loanData,
        bool _isBorrower,
        uint256 _id
    ) external returns (bytes32) {
        bytes32 btotal;
        (btotal, ) = decode(_loanData, 16, 8);
        uint128 total = uint128(btotal);
        if (total == 666)
            return 0x0;
        // bytes32 expected = uint256(_id) XOR keccak256("approve-loan-request");
        return bytes32(_id) ^ keccak256("approve-loan-request");
    }
}
