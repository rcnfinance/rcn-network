pragma solidity ^0.4.24;

import "../utils/SafeMathWrapper.sol";
import "../interfaces/LoanStatus.sol";

contract SafeMathWrapperMock {

    function mul(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Result memory result = SafeMathWrapper.Result(LoanStatus.Status.unknown, "metadata");
        SafeMathWrapper.safeMul(a, b, result);
        return result.status != LoanStatus.Status.error;
    }

    function div(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Result memory result = SafeMathWrapper.Result(LoanStatus.Status.unknown, "metadata");
        SafeMathWrapper.safeDiv(a, b, result);
        return result.status != LoanStatus.Status.error;
    }

    function sub(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Result memory result = SafeMathWrapper.Result(LoanStatus.Status.unknown, "metadata");
        SafeMathWrapper.safeSub(a, b, result);
        return result.status != LoanStatus.Status.error;
    }

    function add(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Result memory result = SafeMathWrapper.Result(LoanStatus.Status.unknown, "metadata");
        SafeMathWrapper.safeAdd(a, b, result);
        return result.status != LoanStatus.Status.error;
    }

    function chainOperations(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Result memory result = SafeMathWrapper.Result(LoanStatus.Status.unknown, "metadata");
        SafeMathWrapper.safeMul(a, b, result);
        SafeMathWrapper.safeAdd(a, b, result);
        SafeMathWrapper.safeDiv(a, b, result);
        SafeMathWrapper.safeSub(a, b, result);
        return result.status != LoanStatus.Status.error;
    }

}