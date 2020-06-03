pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../interfaces/RateOracle.sol";
import "../../../utils/SafeMath.sol";
import "../utils/OracleUtils.sol";
import "../../../utils/SafeERC20.sol";
import "../../../commons/Ownable.sol";
import "../../../commons/Auth.sol";


contract Burner is Ownable, Auth {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using OracleUtils for RateOracle;
    using OracleUtils for OracleUtils.Sample;

    modifier isAlive() {
        // Checks contract is still alive
        require(live == 1, "Burner/not-live");
        _;
    }

    event StartedAuction(
      uint256 _id,
      uint256 _soldTAmount,
      uint256 _burnTAmount
    );

    event Offer(
      uint256 _id,
      uint256 _newBurnTBid,
      address _bidder
    );

    event Claim(
        uint256 _id,
        uint256 _claimAmount,
        uint256 _burnedAmount
    );

    event Reclaim(
        uint256 _id,
        address _bidder,
        uint256 _burnTAmount
    );

    event Recover(
        address _sender,
        uint256 _soldTAmount
    );

    event RestartAuction(uint256 id);
    event SetBidIncrement (uint256 bidIncrement);
    event SetBidDuration (uint48 bidDuration);
    event SetAuctionDuration(uint48 auctionDuration);
    event SetMinimumSoldTAmount(uint256 setMinimumSoldTAmount);

    struct Bid {
        uint256 burnTBid;
        uint256 soldTAmount;
        address bidder;
        uint48 expirationTime;
        uint48 end;
    }

    // Maps an auction with a bid
    mapping (uint256 => Bid) public bids;

    IERC20 public burnT;
    IERC20 public soldT;
    RateOracle public oracle;

    uint256 constant ONE = 1.00E18;
    uint256 public bidIncrement = 1.05E18;  // 5% minimum bid increase
    uint48 public bidDuration = 3 hours;  // 3 hours bid duration
    uint48 public auctionDuration = 2 days;   // 2 days total auction length
    uint256 public auctions;
    uint256 public minimumSoldTAmount = 100E6;
    uint256 public live;

     /**
        @notice Assign:
            The token to be burn `burnT`
            The token to be sold in the auction `soldT`
            The oracle that provides the rate between `burnT` and the `soldT`
            Sets the contract alive
    */
    constructor(
        address _burnToken,
        address _soldToken,
        address _oracle
    ) public {
        burnT = IERC20(_burnToken);
        soldT = IERC20(_soldToken);
        oracle = RateOracle(_oracle);
        live = 1;
    }

    /**
        @notice Sets the a new value for the `bidIncrement`
    */
    function setBidIncrement(uint256 _bidIncrement) external auth {
        bidIncrement = _bidIncrement;
        emit SetBidIncrement(_bidIncrement);
    }

    /**
        @notice Sets the a new value for the `bidDuration`
    */
    function setBidDuration(uint48 _bidDuration) external auth {
        bidDuration = _bidDuration;
        emit SetBidDuration(_bidDuration);

    }

    /**
        @notice Sets the a new value for `auctionDuration`
    */
    function setAuctionDuration(uint48 _auctionDuration) external auth {
        auctionDuration = _auctionDuration;
        emit SetAuctionDuration(_auctionDuration);
    }

    /**
        @notice Sets the a new value for `minimumSoldTAmount`
    */
    function setMinimumSoldTAmount(uint256 _minimumSoldTAmount) external auth {
        minimumSoldTAmount = _minimumSoldTAmount;
        emit SetMinimumSoldTAmount(_minimumSoldTAmount);
    }

    /**  Getters  */
    function claimAvailable(uint256 _id) external view returns (bool) {
        // Returns if auction is available to claim
        return (bids[_id].expirationTime != 0 && (bids[_id].expirationTime < now || bids[_id].end < now));
    }

    function minimumNeededOffer(uint256 _id) external view returns (uint256) {
        // Returns minimun needed new offer for auction
        return bidIncrement.multdiv(bids[_id].burnTBid, ONE).add(1);
    }

    function restartAvailable(uint256 _id) external view returns (bool) {
        // Returns if auction is available to restart
        return (bids[_id].end < now && bids[_id].expirationTime == 0);
    }

    /**
        @notice Start a new auction, sets the amount to be auctioned of `soldT` and the initial `burnT` bid.
                Can only be called by an authorized user.
        @dev The market value is defined by the provided `oracle`. The initial bid should have a discount in relation to
            the market price.
        @param _burnTBid Initial `burnT` bid
        @param _soldTAmount Amount to be auctioned of `soldT`
        @return The id of the new auction
    */
    function startAuction(uint256 _burnTBid, uint256 _soldTAmount) external auth isAlive returns (uint256 id) {
        // Checks _soldTAmount is more than minimum required to start auction
        require(_soldTAmount >= minimumSoldTAmount, "Burner/ _soldTAmount too low");

        //check bid delta to oracle rate value. Check if discount is applied.
        uint256 burntMarket = _toBurnT(oracle, _soldTAmount);
        require(_burnTBid < burntMarket, "Burner/Initial burnTBid should be less than market value");

        // assign auction id and map bid
        id = ++auctions;

        bids[id].burnTBid = _burnTBid;
        bids[id].soldTAmount = _soldTAmount;
        bids[id].bidder = msg.sender;
        bids[id].end = uint48(now.add(uint256(auctionDuration)));

        // Pull the burnT bid tokens
        require(burnT.safeTransferFrom(msg.sender, address(this), _burnTBid), "Burner/Error pulling tokens");

        // Acumulated sold tokens amount in contract is more than the minimum required
        require(soldT.balanceOf(address(this)) >= _soldTAmount, "Burner/not enought soldT balance to start auction");

        // Emit the started auction event
        emit StartedAuction(
            id,
            _soldTAmount,
            _burnTBid
        );
    }

    /**
        @notice Restarts an auction that has already ended and did not have a new bid.
        @param _id Auction Id
    */
    function restartAuction(uint256 _id) external isAlive {
        Bid storage bid = bids[_id];

        // Checks that the auction finished
        require(bid.end < now, "Burner/not-finished");

        // Checks there is no new bid placed
        require(bid.expirationTime == 0, "Burner/bid-already-placed");

        // Restart auction - set new end time
        bid.end = uint48(now.add(uint256(auctionDuration)));

        // Emit the Restart auction event
        emit RestartAuction(_id);
    }

    /**
        @notice Place a new offer that should beat the older bid.
        @dev The new bid should be higher than the old one. The increse percentage difference should
            be more or equal to the `bidIncrement` variable.
        @param _id Auction Id
        @param _newBurnTBid new bid amount `burnT`
    */
    function offer (uint256 _id, uint256 _newBurnTBid) external isAlive {
        Bid storage bid = bids[_id];

        // Checks the bidder is set. If not it means that the auction do not exits or was deleted
        require(bid.bidder != address(0), "Burner/bidder-not-set");

        // Checks that the offer expiration time has not been reached or is equal to 0
        require(bid.expirationTime > now || bid.expirationTime == 0, "Burner/already-finished-bid");

        // Checks auction did not end
        require(bid.end > now, "Burner/already-finished-end");

        // Checks that the bid is higher than the older bid and the increment is sufficient
        require(_newBurnTBid > bid.burnTBid, "Burner/bid-not-higher");
        require(_newBurnTBid.mult(ONE) >= bidIncrement.mult(bid.burnTBid), "Burner/insufficient-increase");

        // Transfer old `burnT` bid amount from msg.sender to the old bidder
        require(burnT.safeTransferFrom(msg.sender, bid.bidder, bid.burnTBid), "Burner/Error sending tokens for old bidder");

        //  Transfer the difference between the old and new bid of `burnT` from msg.sender to this contract
        require(burnT.safeTransferFrom(msg.sender, address(this), _newBurnTBid - bid.burnTBid),"Burner/Error pulling tokens from bidder");

        // Update mapping bid to auction with the new bid values
        bid.bidder = msg.sender;
        bid.burnTBid = _newBurnTBid;
        bid.expirationTime = uint48(now.add(uint256(bidDuration)));

        // Emit offer event
        emit Offer(_id, _newBurnTBid, msg.sender);
    }

    /**
        @notice Claim tokens won at auction
        @dev The total amount of `soldT` tokens auctioned are transferred to the bidder who won the auction.
            The `burnT` tokens of the bid are burned (transfer to address 0x).
        @param _id Auction Id
    */
    function claim(uint256 _id) external isAlive {
        Bid storage bid = bids[_id];

        // Checks that the offer expiration is not 0 and auction or offer expiration finished
        require(bid.expirationTime != 0 && (bid.expirationTime < now || bid.end < now), "Burner/not-finished");

        // Transfers the `soldT` tokens auctioned to the bidder who won the auction
        require(soldT.safeTransfer(bid.bidder, bid.soldTAmount), "Burner/ Error claiming tokens");

        // Transfers the bid burnT amount to the address(0)
        require(burnT.safeTransfer(address(0), bid.burnTBid), "Burner/Error burning tokens");

        // Emit claim event
        emit Claim(_id, bid.soldTAmount, bid.burnTBid);

        // Delete auction bid mapping entry
        delete bids[_id];
    }

    /**
        @notice Recovers an amount of `soldT` funds and sets live to 0.
        @dev Setting live to 0 disables startAuction, offer and claim functions and is irreversible.
            Can only be called by an authorized user.
        @param _amount amount of `soldT` to recover from the contract
    */
    function recover(uint256 _amount) external auth {
        live = 0;

        // Transfers an amount of `soldT` to the msg.sender
        require(soldT.safeTransfer(msg.sender, _amount), "Burner/Error recovering tokens");

        // emit Recover event
        emit Recover(msg.sender, _amount);
    }

    /**
        @notice Bidder is able to reclaim it's bid if contract is not live.
        @param _id auction Id
    */
    function reclaim(uint256 _id) external {
        // Checks contract is not alive
        require(live == 0, "Burner/still-live");

        Bid storage bid = bids[_id];

        // Checks auction has a bidder set
        require(bid.bidder != address(0), "Burner/bidder-not-set");

        // Trasfers `burnT` bid back to the bidder
        require(burnT.safeTransfer(bid.bidder, bid.burnTBid), "Burner/Error bidder recovering bid");

        // Emit reclaim event
        emit Reclaim(_id, bid.bidder, bid.burnTBid);

        // Delete auction bid mapping entry
        delete bids[_id];
    }

    /**
        @notice Calculates the value of a given amount of `soldT` tokens
            and returns the equivalent in `burnT` by reading the oracle
            and applying the convertion rate
        @param _oracle Oracle use to get the conversion rate
        @param _amount Amount of `soldT` to convert
        @return The value of the `soldT` amount denominated in `burnT`
    */
    function _toBurnT(RateOracle _oracle, uint256 _amount) private view returns (uint256) {
        return _oracle
            .readStatic()
            .toTokens(_amount);
    }
}
