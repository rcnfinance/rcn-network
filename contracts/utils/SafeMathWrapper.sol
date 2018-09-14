pragma solidity ^0.4.24;

import "../interfaces/LoanStatus.sol";

library SafeMathWrapper {

    struct Result { 
        LoanStatus.Status status;
        string metadata; // metadata for events 
    }

    /**
    * @dev Adds two number, returns an error status on overflow.
    */
    function safeAdd(uint256 a, uint256 b, Result memory self) internal pure returns (uint256) {
        if (self.status == LoanStatus.Status.error) {
            return;
        }  
        uint256 c = a + b;
        if (c >= a) {
            return c;
        }  
        self.status = LoanStatus.Status.error;
        self.metadata = "Add overflow";
    }

    /**
    * @dev Subtracts two numbers, returns an error status on overflow..
    */
    function safeSub(uint256 x, uint256 y, Result memory self) internal pure returns (uint256) {
        if (self.status == LoanStatus.Status.error) {
            return;
        } 
        if (x >= y) {
            uint256 z = x - y;
            return z;
        }
        self.status = LoanStatus.Status.error;
        self.metadata = "Sub underflow";
    }

    /**
    * @dev Multiplies two numbers, returns an error status on overflow.
    */
    function safeMul(uint256 a, uint256 b, Result memory self) internal pure returns (uint256) {
        if (self.status == LoanStatus.Status.error) {
            return;
        } 
        if (a == 0) {
            return 0;
        }
        uint256 c = a * b;
        if (c / a == b) {
            return c;
        }
        self.status = LoanStatus.Status.error;
        self.metadata = "Mult overflow";

    }
  
    /**
    * @dev Integer division of two numbers truncating the quotient, returns an error status on overflow.
    */
    function safeDiv(uint256 a, uint256 b, Result memory self) internal pure returns (uint256) {
        if (self.status == LoanStatus.Status.error) {
            return;
        } 
        if (b > 0) { 
            uint256 c = a / b;
            return c;
        }
        self.status = LoanStatus.Status.error;
        self.metadata = "Div underflow";
    }

}