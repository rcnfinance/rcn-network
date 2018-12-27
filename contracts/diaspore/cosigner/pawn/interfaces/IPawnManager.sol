pragma solidity ^0.5.0;

import "./../../../../interfaces/Token.sol";
import "./../../../interfaces/ILoanManager.sol";


contract IPawnManager {
    enum Status { Pending, Ongoing, Canceled, Paid, Defaulted }
    address constant internal ETH = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint256 public constant STATUS_ONGOING = 1;
    uint256 public constant STATUS_PAID = 2;

    event NewPawn(uint256 pawnId, bytes32 loanId, address borrower, uint256 packageId);
    event RequestedPawn(uint256 pawnId, uint256 loanId, address borrower, ILoanManager loanManager, uint256 packageId);
    event StartedPawn(uint256 pawnId );
    event CanceledPawn(uint256 pawnId, address from, address to);
    event PaidPawn(uint256 pawnId, address from);
    event DefaultedPawn(uint256 pawnId);
}
