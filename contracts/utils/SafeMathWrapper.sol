pragma solidity ^0.4.24;

import "../interfaces/LoanStatus.sol";

library SafeMathWrapper {

    struct Data {
        uint256 status;
    } 

    /**
    * @dev Adds two number, returns an error status on overflow.
    */
    function safeAdd(uint256 a, uint256 b, Data memory self) internal pure returns (uint256) {
        if (self.status == uint8(LoanStatus.Status.error)) {
            return;
        }  
        uint256 c = a + b;
        if (c >= a) {
            return c;
        }  
        self.status = uint256(LoanStatus.Status.error); 
    }

    /**
    * @dev Subtracts two numbers, returns an error status on overflow.
    */
    function safeSub(uint256 a, uint256 b, Data memory self) internal pure returns (uint256) {
        if (self.status == uint256(LoanStatus.Status.error)) {
            return;
        } 
        if (a >= b) { 
            uint256 z = a - b;
            return z; 
        }
        self.status = uint256(LoanStatus.Status.error); 
    }

    /**
    * @dev Multiplies two numbers, returns an error status on overflow.
    */
    function safeMul(uint256 a, uint256 b, Data memory self) internal pure returns (uint256) {
        if (self.status == uint256(LoanStatus.Status.error)) {
            return;
        } 
        if (a == 0) {
            return 0;
        }
        uint256 c = a * b;
        if (c / a == b) {
            return c;
        }
        self.status = uint256(LoanStatus.Status.error); 

    }
  
    /**
    * @dev Integer division of two numbers truncating the quotient, returns an error status on overflow.
    */
    function safeDiv(uint256 a, uint256 b, Data memory self) internal pure returns (uint256) {
        if (self.status == uint256(LoanStatus.Status.error)) {
            return;
        } 
        if (b > 0) { 
            uint256 c = a / b;
            return c;
        }
        self.status = uint256(LoanStatus.Status.error);  
    }

}