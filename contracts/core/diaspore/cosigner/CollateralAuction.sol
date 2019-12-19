pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../../../utils/SafeERC20.sol";
import "../../../utils/SafeMath.sol";
import "../../../utils/SafeCast.sol";
import "../../../utils/IsContract.sol";
import "../../../utils/Math.sol";
import "../../../commons/Ownable.sol";
import "../../../commons/ReentrancyGuard.sol";
import "./interfaces/CollateralAuctionCallback.sol";


contract CollateralAuction is ReentrancyGuard, Ownable {
    using IsContract for address payable;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SafeCast for uint256;

    uint256 private constant DELTA_TO_MARKET = 10 minutes;
    uint256 private constant DELTA_FINISH = 1 days;

    IERC20 public baseToken;
    Auction[] public auctions;

    struct Auction {
        IERC20 fromToken;    // Token that we are intending to sell
        uint64 startTime;    // Start time of the auction
        uint32 limitDelta;   // Limit time until all collateral is offered
        uint256 startOffer;  // Start offer of `fromToken` for the requested `amount`
        uint256 amount;      // Amount that we need to receive of `baseToken`
        uint256 limit;       // Limit of how much are willing to spend of `fromToken`
    }

    event CreatedAuction(
        uint256 indexed _id,
        IERC20 _fromToken,
        uint256 _startOffer,
        uint256 _refOffer,
        uint256 _amount,
        uint256 _limit
    );

    event Take(
        uint256 indexed _id,
        address _taker,
        uint256 _selling,
        uint256 _requesting
    );

    constructor(IERC20 _baseToken) public {
        baseToken = _baseToken;
        auctions.length++;
    }

    function create(
        IERC20 _fromToken,
        uint256 _start,
        uint256 _ref,
        uint256 _limit,
        uint256 _amount
    ) external nonReentrant() returns (uint256 id) {
        require(_start < _ref, "auction: offer should be below refence offer");
        require(_ref <= _limit, "auction: reference offer should be below or equal to limit");

        uint32 limitDelta = ((_limit - _start).mult(DELTA_TO_MARKET) / (_ref - _start)).toUint32();

        // Pull tokens for the auction
        require(_fromToken.safeTransferFrom(msg.sender, address(this), _limit), "auction: error pulling _fromToken");

        // Trust that the owner transfered the tokens
        // the `_limit` should be transfered
        id = auctions.push(Auction({
            fromToken: _fromToken,
            startTime: uint64(_now()),
            limitDelta: limitDelta,
            startOffer: _start,
            amount: _amount,
            limit: _limit
        })) - 1;

        emit CreatedAuction(
            id,
            _fromToken,
            _start,
            _ref,
            _amount,
            _limit
        );
    }

    function take(
        uint256 _id,
        bytes calldata _data,
        bool _callback
    ) external nonReentrant() {
        Auction memory auction = auctions[_id];
        require(auction.amount != 0, "auction: does not exists");

        (uint256 selling, uint256 requesting) = _offer(auction);
        address owner = _owner;
        uint256 leftOver = auction.limit - selling;

        // Delete auction entry
        delete auctions[_id];

        // Send the auctioned tokens to the sender
        // this is done first, because the sender may be doing arbitrage
        // and for that, it needs the tokens that's going to sell
        require(auction.fromToken.safeTransfer(msg.sender, selling), "auction: error sending tokens");

        // If msg.sender is a contract, we ping it so it can perform any arbitrage
        // if such arbitrage is neccesary
        if (_callback) {
            /* solium-disable-next-line */
            (bool success, ) = msg.sender.call(abi.encodeWithSignature("onTake()"));
            require(success, "auction: error during callback onTake()");
        }

        // Swap tokens for base
        // baseToken should have already been transfered during create
        // of the auction, that's trusted because only the owner can create auctions
        require(baseToken.transferFrom(msg.sender, owner, requesting), "auction: error pulling tokens");
        require(auction.fromToken.safeTransfer(owner, leftOver), "auction: error sending leftover tokens");

        // Callback to owner
        CollateralAuctionCallback(owner).auctionClosed(
            _id,
            leftOver,
            requesting,
            _data
        );

        emit Take(
            _id,
            msg.sender,
            selling,
            requesting
        );
    }

    function offer(
        uint256 _id
    ) external view returns (uint256 selling, uint256 requesting) {
        return _offer(auctions[_id]);
    }

    function _now() internal view returns (uint256) {
        return now;
    }

    function _offer(
        Auction memory _auction
    ) private view returns (uint256, uint256) {
        if (_auction.fromToken == baseToken) {
            // if the offered token is the same as the base token
            // the auction is skipped, and the requesting and selling amount are the same
            uint256 min = Math.min(_auction.limit, _auction.amount);
            return (min, min);
        } else {
            // Calculate selling and requesting amounts
            // for the current timestamp
            return (_selling(_auction), _requesting(_auction));
        }
    }

    function _selling(
        Auction memory _auction
    ) private view returns (uint256 _amount) {
        uint256 deltaAmount = _auction.limit - _auction.startOffer;
        uint256 deltaTime = _now() - _auction.startTime;

        if (deltaTime < _auction.limitDelta) {
            _amount = _auction.startOffer.add(deltaAmount.mult(deltaTime) / _auction.limitDelta);
        } else {
            _amount = _auction.limit;
        }
    }

    function _requesting(
        Auction memory _auction
    ) private view returns (uint256 _amount) {
        uint256 ogDeltaTime = _now() - _auction.startTime;

        if (ogDeltaTime > _auction.limitDelta) {
            uint256 deltaTime = ogDeltaTime - _auction.limitDelta;
            return _auction.amount.sub(_auction.amount.mult(deltaTime % DELTA_FINISH) / DELTA_FINISH);
        } else {
            return _auction.amount;
        }
    }
}
