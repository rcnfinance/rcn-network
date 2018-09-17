pragma solidity ^0.4.24;

import "../utils/SafeMathWrapper.sol";
import "../interfaces/LoanStatus.sol";

contract SafeMathWrapperMock {

    function mul(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Data memory data = SafeMathWrapper.Data(0);
        SafeMathWrapper.safeMul(a, b, data);
        return data.status != uint256(LoanStatus.Status.error);
    }

    function div(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Data memory data = SafeMathWrapper.Data(0);
        SafeMathWrapper.safeDiv(a, b, data);
        return data.status != uint256(LoanStatus.Status.error);
    }

    function sub(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Data memory data = SafeMathWrapper.Data(0);
        SafeMathWrapper.safeSub(a, b, data);
        return data.status != uint256(LoanStatus.Status.error);
    }

    function add(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Data memory data = SafeMathWrapper.Data(0);
        SafeMathWrapper.safeAdd(a, b, data);
        return data.status != uint256(LoanStatus.Status.error);
    }

    function chainOperations(uint256 a, uint256 b) public pure returns (bool) {
        SafeMathWrapper.Data memory data = SafeMathWrapper.Data(0);
        SafeMathWrapper.safeMul(a, b, data);
        SafeMathWrapper.safeAdd(a, b, data);
        SafeMathWrapper.safeDiv(a, b, data);
        SafeMathWrapper.safeSub(a, b, data);
        return data.status != uint256(LoanStatus.Status.error);
    }

}