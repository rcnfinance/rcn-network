pragma solidity ^0.5.0;

import "./../../../../interfaces/Token.sol";
import "./../../../interfaces/ILoanManager.sol";


contract IPawnManager {
    enum Status { Pending, Ongoing, Canceled, Paid, Defaulted }
    address constant internal ETH = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint256 public constant STATUS_ONGOING = 1;
    uint256 public constant STATUS_PAID = 2;

    event RequestedPawn(uint256 _pawnId, bytes32 _loanId, address _owner, ILoanManager _loanManager, uint256 _packageId);
    event StartedPawn(uint256 _pawnId);
    event CanceledPawn(uint256 _pawnId, address _to);
    event PaidPawn(uint256 _pawnId, address _from);
    event DefaultedPawn(uint256 _pawnId);
}
