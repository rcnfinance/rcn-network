pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../../../utils/SafeERC20.sol";
import "../../../utils/SafeMath.sol";
import "../../../commons/Ownable.sol";
import "./interfaces/CollateralAuctionCallback.sol";


contract CollateralAuction is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 private constant TIME_TO_MARKET = 10 minutes;
    uint256 private constant TIME_FINISH = 1 days;

    IERC20 public baseToken;
    Auction[] public auctions;

    struct Auction {
        IERC20 fromToken;    // Token that we are intending to sell
        uint64 startTime;    // Start time of the auction
        uint256 startOffer;  // Start offer of `fromToken` for the requested `amount`
        uint256 refOffer;    // Reference `Market` offer
        uint256 amount;      // Amount that we need to receive of `baseToken`
        uint256 limit;       // Limit of how much are willing to spend of `fromToken`
    }

    constructor(IERC20 _baseToken) public {
        baseToken = _baseToken;
    }

    function create(
        IERC20 _fromToken,
        uint256 _startOffer,
        uint256 _refOffer,
        uint256 _amount,
        uint256 _limit
    ) external onlyOwner returns (uint256) {
        require(_startOffer > _refOffer, "auction: offer should be above refence offer");
        require(_limit < _startOffer, "auction: limit should be below initial offer");
        require(_step(_startOffer, _refOffer) != 0, "auction: step can't be zero");

        // Trust that the owner transfered the tokens
        // the `_limit` should be transfered
        return auctions.push(Auction({
            fromToken: _fromToken,
            startTime: uint64(now),
            startOffer: _startOffer,
            refOffer: _refOffer,
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

    function _step(
        uint256 _startOffer,
        uint256 _refOffer
    ) private pure returns (uint256) {
        return _startOffer.sub(_refOffer).div(TIME_TO_MARKET);
    }

    function _offer(
        Auction memory _auction
    ) private view returns (uint256 _selling, uint256 _expecting) {
        // Increase _selling
        uint256 stepFrom = _step(_auction.startOffer, _auction.refOffer);
        uint256 deltaAddFrom = now - _auction.startTime;

        _selling = _auction.startOffer.add(deltaAddFrom.mult(stepFrom));
        _expecting = _auction.amount;

        if (_selling > _auction.limit) {
            // Decrease change on _expecting
            uint256 stepTo = _auction.amount / TIME_FINISH;
            uint256 deltaSubTo = (_selling.sub(_auction.limit)) / stepFrom;
            uint256 decreaseExpecting = deltaSubTo.mult(stepTo);
            _expecting = decreaseExpecting > _expecting ? 0 : _expecting.sub(decreaseExpecting);
            _selling = _auction.limit;
        }
    }
}