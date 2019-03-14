pragma solidity ^0.5.0;

import "./../../../../interfaces/Token.sol";
import "./../../../interfaces/ILoanManager.sol";
import "./IEscrow.sol";


contract IPawnManager {
    enum Status { Pending, Ongoing, Canceled, Paid, Defaulted }
    address constant internal ETH = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint256 public constant STATUS_ONGOING = 1;
    uint256 public constant STATUS_PAID = 2;

    event NewUrl(string _url);
    event NewLoanManager(ILoanManager _loanManager);

    event RequestedPawn(uint256 _pawnId, bytes32 _loanId, IEscrow _escrow, address _owner, ILoanManager _loanManager, uint256 _packageId);
    event StartedPawn(uint256 _pawnId);
    event CanceledPawn(uint256 _pawnId, address _to);
    event PaidPawn(uint256 _pawnId, address _from);
    event DefaultedPawn(uint256 _pawnId);

    event AddedBalance(uint256 _pawnId, uint256 _packageId, uint256 _pairId, uint256 _amount);
    event TakedBalance(uint256 _pawnId, uint256 _packageId, uint256 _pairId, uint256 _amount);

    function getPawn(uint256 _pawnId) external view returns(address owner, address loanManager, bytes32 loanId, address escrow, uint256 packageId);
}
