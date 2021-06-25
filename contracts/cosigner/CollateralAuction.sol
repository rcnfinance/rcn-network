pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/CollateralAuctionCallback.sol";


/**
    @title ERC-20 Dutch auction
    @author Agustin Aguilar <agustin@ripiocredit.network> & Victor Fage <victor.fage@ripiocredit.network>
    @notice Auctions tokens in exchange for `baseToken` using a Dutch auction scheme,
        the owner of the contract is the sole beneficiary of all the auctions.
        Auctions follow two linear functions to determine the exchange rate that
        are determined by the provided `reference` rate.
    @dev If the auction token matches the requested `baseToken`,
        the auction has a fixed rate of 1:1
*/
contract CollateralAuction is ReentrancyGuard, Ownable {
    using Address for address payable;
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

    constructor(IERC20 _baseToken) {
        baseToken = _baseToken;
        // Auction IDs start at 1
        auctions.push();
    }

    /**
        @notice Returns the size of the auctions array

        @dev The auction with ID 0 is invalid, thus the value
            returned by this method is the total number of auctions + 1

        @return The size of the auctions array
    */
    function getAuctionsLength() external view returns (uint256) {
        return auctions.length;
    }

    /**
        @notice Creates a new auction that starts immediately, any address
            can start an auction, but the beneficiary of all auctions is the
            owner of the contract

        @param _fromToken Token to be sold in exchange for `baseToken`
        @param _start Initial offer of `fromToken` for the requested `_amount` of base,
            should be below the market reference
        @param _ref Reference or "market" offer of `fromToken` for the requested `_amount` of base,
            it should be estimated with the current exchange rate, the real offered amount reaches
            this value after 10 minutes
        @param _limit Maximum amount of `fromToken` to exchange for the requested `_amount` of base,
            after this limit is reached, the requested `_amount` starts to reduce
        @param _amount Amount requested in exchange for `fromToken` until `_limit is reached`

        @return id The id of the created auction
    */
    function create(
        IERC20 _fromToken,
        uint256 _start,
        uint256 _ref,
        uint256 _limit,
        uint256 _amount
    ) external nonReentrant() returns (uint256 id) {
        require(_start < _ref, "auction: offer should be below refence offer");
        require(_ref <= _limit, "auction: reference offer should be below or equal to limit");

        // Calculate how much time takes the auction to offer all the `_limit` tokens
        // in exchange for the requested base `_amount`, this delta defines the linear
        // function of the first half of the auction
        uint32 limitDelta = ((_limit - _start).mul(DELTA_TO_MARKET) / (_ref - _start)).toUint32();

        // Pull tokens for the auction, the full `_limit` is pulled
        // any exceeding tokens will be returned at the end of the auction
        _fromToken.safeTransferFrom(msg.sender, address(this), _limit);

        // Create and store the auction
        auctions.push(Auction({
            fromToken: _fromToken,
            startTime: uint64(_now()),
            limitDelta: limitDelta,
            startOffer: _start,
            amount: _amount,
            limit: _limit
        }));
        id = auctions.length - 1;

        emit CreatedAuction(
            id,
            _fromToken,
            _start,
            _ref,
            _amount,
            _limit
        );
    }

    /**
        @notice Takes an ongoing auction, exchanging the requested `baseToken`
            for offered `fromToken`. The `baseToken` are transfered to the owner
            address and a callback to the owner is called for further processing of the tokens

        @dev In the context of a collateral auction, the tokens are used to pay a loan.
            If the oracle of the loan requires `oracleData`, such oracle data should be included
            on the `_data` field

        @dev The taker of the auction may request a callback to it's own address, this is
            intended to allow the taker to use the newly received `fromToken` and perform
            arbitrage with a dex before providing the requested `baseToken`

        @param _id ID of the auction to take
        @param _data Arbitrary data field that's passed to the owner
        @param _callback Requests a callback for the taker of the auction,
            that may be used to perform arbitrage
    */
    function take(
        uint256 _id,
        bytes calldata _data,
        bool _callback
    ) external nonReentrant() {
        Auction memory auction = auctions[_id];
        require(auction.amount != 0, "auction: does not exists");
        IERC20 fromToken = auction.fromToken;

        // Load the current rate of the auction
        // how much `fromToken` is being sold and how much
        // `baseToken` is requested
        (uint256 selling, uint256 requesting) = _offer(auction);
        address owner = owner();

        // Any non-offered `fromToken` is going
        // to be returned to the owner
        uint256 leftOver = auction.limit - selling;

        // Delete auction entry
        delete auctions[_id];

        // Send the auctioned tokens to the sender
        // this is done first, because the sender may be doing arbitrage
        // and for that, it needs the tokens that's going to sell
        fromToken.safeTransfer(msg.sender, selling);

        // If a callback is requested, we ping the sender so it can perform arbitrage
        if (_callback) {
            /* solium-disable-next-line */
            (bool success, ) = msg.sender.call(abi.encodeWithSignature("onTake(address,uint256,uint256)", fromToken, selling, requesting));
            require(success, "auction: error during callback onTake()");
        }

        // Swap tokens for base, send base directly to the owner
        require(baseToken.transferFrom(msg.sender, owner, requesting), "auction: error pulling tokens");

        // Send any leftOver tokens
        fromToken.safeTransfer(owner, leftOver);

        // Callback to owner to process the closed auction
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

    /**
        @notice Calculates the current offer of an auction if it were to be taken,
            how much `baseTokens` are being requested for how much `baseToken`

        @param _id ID of the auction

        @return selling How much is being requested
        @return requesting How much is being offered
    */
    function offer(
        uint256 _id
    ) external view returns (uint256 selling, uint256 requesting) {
        return _offer(auctions[_id]);
    }

    /**
        @notice Returns the current timestamp

        @dev Used for unit testing

        @return The current Unix timestamp
    */
    function _now() internal virtual view returns (uint256) {
        return block.timestamp;
    }

    /**
        @notice Calculates the current offer of an auction, with the auction
            in memory

        @dev If `fromToken` and `baseToken` are the same token, the auction
            rate is fixed as 1:1

        @param _auction Aunction in memory

        @return How much is being requested and how much is being offered
    */
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

    /**
        @notice Calculates how much `fromToken` is being sold, within the defined `_limit`
            the auction starts at `startOffer` and the offer it's increased linearly until
            reaching `reference` offer (after 10 minutes). Then the linear function continues
            until all the collateral is being offered

        @param _auction Auction in memory

        @return _amount How much `fromToken` is being offered
    */
    function _selling(
        Auction memory _auction
    ) private view returns (uint256 _amount) {
        uint256 deltaTime = _now() - _auction.startTime;

        if (deltaTime < _auction.limitDelta) {
            uint256 deltaAmount = _auction.limit - _auction.startOffer;
            _amount = _auction.startOffer.add(deltaAmount.mul(deltaTime) / _auction.limitDelta);
        } else {
            _amount = _auction.limit;
        }
    }

    /**
        @notice Calculates how much `baseToken` is being requested, before offering
            all the `_limit` `fromToken` the total `_amount` of `baseToken` is requested.
            After all the `fromToken` is being offered, the auction switches and the requested
            `baseToken` goes down linearly, until reaching 1 after 24 hours

        @dev If the auction is not taken after the requesting amount can reaches 1, the second part
            of the auction restarts and the initial amount of `baseToken` is requested, the process
            repeats until the auction is taken

        @param _auction Auction in memory

        @return _amount How much `baseToken` are being requested
    */
    function _requesting(
        Auction memory _auction
    ) private view returns (uint256 _amount) {
        uint256 ogDeltaTime = _now() - _auction.startTime;

        if (ogDeltaTime > _auction.limitDelta) {
            uint256 deltaTime = ogDeltaTime - _auction.limitDelta;
            return _auction.amount.sub(_auction.amount.mul(deltaTime % DELTA_FINISH) / DELTA_FINISH);
        } else {
            return _auction.amount;
        }
    }
}
