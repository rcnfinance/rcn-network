pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../../../utils/SafeERC20.sol";
import "../../../commons/Ownable.sol";
import "./interfaces/CollateralAuctionCallback.sol";


contract CollateralAuction is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public baseToken;
    Auction[] public auctions;

    struct Auction {
        IERC20 fromToken;  // Token that we are intending to sell
        uint64 startTime;  // Start time of the auction
        uint256 startOffer; // Start offer of `fromToken` for the requested `amount`
        uint256 amount;     // Amount that we need to receive of `baseToken`
        uint256 limit;      // Limit of how much are willing to spend of `fromToken`
    }

    constructor(IERC20 _baseToken) public {
        baseToken = _baseToken;
    }

    function create(
        IERC20 _fromToken,
        uint256 _startOffer,
        uint256 _amount,
        uint256 _limit
    ) external onlyOwner returns (uint256) {
        // Trust that the owner transfered the tokens
        // the `_limit` should be transfered
        return auctions.push(Auction({
            fromToken: _fromToken,
            startTime: uint64(now),
            startOffer: _startOffer,
            amount: _amount,
            limit: _limit
        })) - 1;
    }

    function take(
        uint256 _id,
        bytes calldata _data
    ) external {
        Auction memory auction = auctions[_id];
        require(auction.amount != 0, "auction: does not exists");

        (uint256 selling, uint256 expecting) = _offer(auction);
        address owner = _owner;
        uint256 leftOver = auction.limit - selling;

        // Delete auction entry
        delete auctions[_id];

        // Swap tokens for base
        // baseToken should have already been transfered during create
        // of the auction, that's trusted because only the owner can create auctions
        require(baseToken.transfer(owner, expecting), "auction: error pulling tokens");
        require(auction.fromToken.safeTransfer(owner, auction.limit - selling), "auction: error sending leftover tokens");
        require(auction.fromToken.safeTransfer(msg.sender, selling), "auction: error sending tokens");

        // Callback to owner
        CollateralAuctionCallback(owner).auctionClosed(
            _id,
            leftOver,
            expecting,
            _data
        );
    }

    function _offer(
        Auction memory _auction
    ) private pure returns (uint256 _amount, uint256 _base) {
        // TODO Return correct offer
    }
}