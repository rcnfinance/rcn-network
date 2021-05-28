pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../cosigner/Collateral.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract TestCollateralAuctionMock {
    using SafeERC20 for IERC20;

    LoanManager public loanManager;
    IERC20 public loanManagerToken;
    Collateral public collateral;

    mapping(uint256 => IERC20) public entryToToken;
    uint256 auctionId = 1;

    constructor(LoanManager _loanManager) {
        loanManager = _loanManager;
        loanManagerToken = _loanManager.token();
    }

    function setCollateral(Collateral _collateral) external {
        collateral = _collateral;
    }

    function create(
        IERC20 _fromToken,
        uint256,
        uint256,
        uint256 _limit,
        uint256
    ) external returns (uint256 id) {
        id = auctionId;
        entryToToken[id] = _fromToken;
        auctionId++;

        _fromToken.safeTransferFrom(msg.sender, address(this), _limit);
    }

    function toAuctionClosed(
        uint256 _id,
        uint256 _leftover,
        uint256 _received,
        bytes calldata _data
    ) external {
        if (_leftover != 0) {
            entryToToken[_id].transfer(address(collateral), _leftover);
        }
        if (_received != 0) {
            loanManagerToken.transfer(address(collateral), _received);
        }

        collateral.auctionClosed(
            _id,
            _leftover,
            _received,
            _data
        );
    }
}
