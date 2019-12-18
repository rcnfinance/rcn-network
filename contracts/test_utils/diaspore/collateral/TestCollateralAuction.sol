pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../../../core/diaspore/cosigner/Collateral.sol";


contract TestCollateralAuction is CollateralAuction {
    LoanManager public loanManager;
    IERC20 public loanManagerToken;
    Collateral public collateral;

    mapping(uint256 => IERC20) public entryToToken;
    uint256 auctionId;

    uint256 public time;

    constructor(LoanManager _loanManager) public CollateralAuction(loanManager.token()) {
        loanManager = _loanManager;
        loanManagerToken = loanManager.token();
    }

    function setTime(uint256 _t) external {
        time = _t;
    }

    function increaseTime(uint256 _seconds) external {
        time += _seconds;
    }

    function _now() internal view returns (uint256) {
        uint256 t = time;

        if (t == 0) {
            return super._now();
        } else {
            return t;
        }
    }

    function setCollateral(Collateral _collateral) external {
        collateral = _collateral;
    }

    function create(
        IERC20 _fromToken,
        uint256 _start,
        uint256 _ref,
        uint256 _limit,
        uint256 _amount
    ) external returns (uint256 id) {
        id = auctionId;
        entryToToken[id] = _fromToken;
        auctionId++;
    }

    function toAuctionClosed(
        uint256 _id,
        uint256 _leftover,
        uint256 _received,
        bytes calldata _data
    ) external {
        entryToToken[_id].transfer(address(collateral), _leftover);
        loanManagerToken.transfer(address(collateral), _received);

        collateral.auctionClosed(
            _id,
            _leftover,
            _received,
            _data
        );
    }
}

