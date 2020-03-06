pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../../../interfaces/Cosigner.sol";
import "../interfaces/Model.sol";
import "../interfaces/RateOracle.sol";
import "../LoanManager.sol";

import "./interfaces/CollateralAuctionCallback.sol";
import "./interfaces/CollateralHandler.sol";
import "../../../commons/ReentrancyGuard.sol";
import "../../../commons/Fixed224x32.sol";
import "../../../commons/Ownable.sol";
import "../../../commons/ERC721Base.sol";
import "../../../utils/SafeERC20.sol";
import "../../../utils/SafeMath.sol";
import "../utils/DiasporeUtils.sol";
import "../utils/OracleUtils.sol";
import "./CollateralAuction.sol";
import "./CollateralLib.sol";


/**
    @title Loan collateral handler
    @author Victor Fage <victor.fage@ripiocredit.network> & Agustin Aguilar <agustin@ripiocredit.network>
    @notice Handles the creation, activation and liquidation trigger
        of collateral guarantees for RCN loans.
*/
contract Collateral is ReentrancyGuard, Ownable, Cosigner, ERC721Base, CollateralAuctionCallback {
    using CollateralLib for CollateralLib.Entry;
    using OracleUtils for OracleUtils.Sample;
    using OracleUtils for RateOracle;
    using DiasporeUtils for LoanManager;
    using Fixed224x32 for bytes32;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SafeMath for uint32;

    event Created(
        uint256 indexed _entryId,
        bytes32 indexed _debtId,
        RateOracle _oracle,
        IERC20 _token,
        uint256 _amount,
        uint96 _liquidationRatio,
        uint96 _balanceRatio
    );

    event Deposited(
        uint256 indexed _entryId,
        uint256 _amount
    );

    event Withdraw(
        uint256 indexed _entryId,
        address _to,
        uint256 _amount
    );

    event Started(
        uint256 indexed _entryId
    );

    event ClaimedLiquidation(
        uint256 indexed _entryId,
        uint256 indexed _auctionId,
        uint256 _debt,
        uint256 _required,
        uint256 _marketValue
    );

    event ClaimedExpired(
        uint256 indexed _entryId,
        uint256 indexed _auctionId,
        uint256 _dueTime,
        uint256 _obligation,
        uint256 _obligationTokens,
        uint256 _marketValue
    );

    event ClosedAuction(
        uint256 indexed _entryId,
        uint256 _received,
        uint256 _leftover
    );

    event Redeemed(
        uint256 indexed _entryId,
        address _to
    );

    event BorrowCollateral(
        uint256 indexed _entryId,
        CollateralHandler _handler,
        uint256 _newAmount
    );

    event SetUrl(
        string _url
    );

    // All collateral entries
    CollateralLib.Entry[] public entries;

    // Maps a RCN Debt to a collateral entry
    // only after the collateral is cosigned
    mapping(bytes32 => uint256) public debtToEntry;

    // URL With collateral offers
    string private iurl;

    // Fixed for all collaterals, defined
    // during the contract creation
    LoanManager public loanManager;
    IERC20 public loanManagerToken;

    // Liquidation auctions
    CollateralAuction public auction;
    mapping(uint256 => uint256) public entryToAuction;
    mapping(uint256 => uint256) public auctionToEntry;

    constructor(
        LoanManager _loanManager,
        CollateralAuction _auction
    ) public ERC721Base("RCN Collateral Cosigner", "RCC") {
        loanManager = _loanManager;
        loanManagerToken = loanManager.token();
        // Invalid entry of index 0
        entries.length ++;
        // Create auction contract
        auction = _auction;
    }

    /**
        @notice Returns the total number of created collaterals

        @dev Includes inactive, empty and finalized entries
            and the entry zero, which is considered `invalid`

        @return The number of collateral entries
    */
    function getEntriesLength() external view returns (uint256) {
        return entries.length;
    }

    /**
        @notice Creates a collateral entry, pulls the amount of collateral
            from the function caller and mints an ERC721 that represents the collateral.

        @dev The `token` of the collateral is defined by the provided `oracle`
            `liquidationRatio` and `balanceRatio` should be encoded as Fixed64x32 numbers (e.g.: 1 == 2 ** 32)

        @param _debtId Id of the RCN debt
        @param _oracle The oracle that provides the rate between `loanManagerToken` and entry `token`
            If the oracle its the address 0 the entry token it's `loanManagerToken`
            otherwise the token it's provided by `oracle.token()`
        @param _amount The amount provided as collateral, in `token`
        @param _liquidationRatio collateral/debt ratio that triggers the execution of the margin call, encoded as Fixed64x32
        @param _balanceRatio Target collateral/debt ratio expected after a margin call execution, encoded as Fixed64x32

        @return The id of the new collateral entry and ERC721 token
    */
    function create(
        bytes32 _debtId,
        RateOracle _oracle,
        uint256 _amount,
        uint96 _liquidationRatio,
        uint96 _balanceRatio
    ) external nonReentrant() returns (uint256 entryId) {
        // Check status of loan, should be open
        require(loanManager.getStatus(_debtId) == 0, "collateral: loan request should be open");

        // Use the token provided by the oracle
        // if no oracle is provided, the token is assumed to be `loanManagerToken`
        IERC20 token = _oracle == RateOracle(0) ? loanManagerToken : IERC20(_oracle.token());

        // Create the entry, and push on entries array
        entryId = entries.push(
            CollateralLib.create(
                _oracle,
                token,
                _debtId,
                _amount,
                _liquidationRatio,
                _balanceRatio
            )
        ) - 1;

        // Pull the ERC20 tokens
        require(token.safeTransferFrom(msg.sender, address(this), _amount), "collateral: error pulling tokens");

        // Generate the ERC721 Token
        _generate(entryId, msg.sender);

        // Emit the collateral creation event
        emit Created(
            entryId,
            _debtId,
            _oracle,
            token,
            _amount,
            _liquidationRatio,
            _balanceRatio
        );
    }

    /**
        @notice Deposits collateral into an entry

        @dev Deposits are disabled if the entry is being auctioned,
            any address can deposit collateral on any entry

        @param _entryId The ID of the collateral entry
        @param _amount The amount to be deposited
    */
    function deposit(
        uint256 _entryId,
        uint256 _amount
    ) external nonReentrant() {
        // Deposits disabled during collateral auctions
        require(!inAuction(_entryId), "collateral: can't deposit during auction");

        // Load entry from storage
        CollateralLib.Entry storage entry = entries[_entryId];

        // Pull the ERC20 tokens
        require(entry.token.safeTransferFrom(msg.sender, address(this), _amount), "collateral: error pulling tokens");

        // Register the deposit of amount on the entry
        entry.amount = entry.amount.add(_amount);

        // Emit the deposit event
        emit Deposited(_entryId, _amount);
    }

    /**
        @notice Withdraw collateral from an entry,
            the withdrawal amount is determined by the `liquidationRatio` and the current debt,
            if the collateral is not attached to a debt, all the collateral can be withdrawn

        @dev Withdrawals are disabled if the entry is being auctioned

        @param _entryId The ID of the collateral entry
        @param _to The beneficiary of the withdrawn tokens
        @param _amount The amount to be withdrawn
        @param _oracleData Arbitrary data field requested by the
            collateral entry oracle, may be required to retrieve the rate
    */
    function withdraw(
        uint256 _entryId,
        address _to,
        uint256 _amount,
        bytes calldata _oracleData
    ) external nonReentrant() onlyAuthorized(_entryId) {
        // Withdrawals are disabled during collateral auctions
        require(!inAuction(_entryId), "collateral: can't withdraw during auction");

        // Read entry from storage
        CollateralLib.Entry storage entry = entries[_entryId];
        bytes32 debtId = entry.debtId;
        uint256 entryAmount = entry.amount;

        // Check if the entry was cosigned
        if (debtToEntry[debtId] != 0) {
            // Check if the requested amount can be withdrew
            require(
                _amount <= entry.canWithdraw(_debtInTokens(debtId, _oracleData)),
                "collateral: withdrawable collateral is not enough"
            );
        }

        // Reduce the amount of collateral of the entry
        require(entryAmount >= _amount, "collateral: withdrawable collateral is not enough");
        entry.amount = entryAmount.sub(_amount);

        // Send the amount of ERC20 tokens to `_to`
        require(entry.token.safeTransfer(_to, _amount), "collateral: error sending tokens");

        // Emit the withdrawal event
        emit Withdraw(_entryId, _to, _amount);
    }

    /**
        @notice Takes the collateral funds of an entry, can only be called
            if the loan status is `ERROR (4)`, intended to be a recovery mechanism
            if the loan model fails

        @param _entryId The ID of the collateral entry
        @param _to The receiver of the tokens
    */
    function redeem(
        uint256 _entryId,
        address _to
    ) external nonReentrant() onlyOwner {
        // Read entry from storage
        CollateralLib.Entry storage entry = entries[_entryId];

        // Check status, should be `ERROR` (4)
        require(loanManager.getStatus(entry.debtId) == 4, "collateral: debt should be have status error");
        emit Redeemed(_entryId, _to);

        // Load amount and token
        uint256 amount = entry.amount;
        IERC20 token = entry.token;

        // Destroy ERC721 collateral token
        delete debtToEntry[entry.debtId];
        delete entries[_entryId];

        // Send the amount of ERC20 tokens to `_to`
        require(token.safeTransfer(_to, amount), "collateral: error sending tokens");
    }

    /**
        @notice Borrows collateral, with the condition of increasing
            the collateral/debt ratio before the end of the call

        @dev Intended to be used to pay the loan using the collateral

        @param _entryId Id of the collateral entry
        @param _handler Contract handler of the collateral
        @param _data Arbitrary bytes array for the handler
        @param _oracleData Arbitrary data field requested by the
            collateral entry oracle, may be required to retrieve the rate
    */
    function borrowCollateral(
        uint256 _entryId,
        CollateralHandler _handler,
        bytes calldata _data,
        bytes calldata _oracleData
    ) external nonReentrant() onlyAuthorized(_entryId) {
        // Read entry
        CollateralLib.Entry storage entry = entries[_entryId];
        bytes32 debtId = entry.debtId;

        // Get original collateral/debt ratio
        bytes32 ogRatio = entry.ratio(_debtInTokens(debtId, _oracleData));

        // Send all colleteral to handler
        uint256 lent = entry.amount;
        entry.amount = 0;
        require(entry.token.safeTransfer(address(_handler), lent), "collateral: error sending tokens");

        // Callback to the handler
        uint256 surplus = _handler.handle(_entryId, lent, _data);

        // Expect to pull back any exceeding collateral
        require(entry.token.safeTransferFrom(address(_handler), address(this), surplus), "collateral: error pulling tokens");
        entry.amount = surplus;

        // Read collateral/debt ratio, should be better than previus one
        // or the loan has to be fully paid
        if (loanManager.getStatus(entry.debtId) != 2) {
            bytes32 afRatio = entry.ratio(_debtInTokens(debtId, _oracleData));
            require(afRatio.gt(ogRatio), "collateral: ratio should increase");
        }

        // Emit borrow colateral event
        emit BorrowCollateral(_entryId, _handler, surplus);
    }

    /**
        @notice Closes and finishes a liquidation auction, the bought tokens used to
            pay the maximun amount of debt possible, any exceeding amount is sent to the
            collateral owner. Exceeding collateral is deposited back on the entry

        @dev This method is an internal callback and it only accepts calls from
            the auction contract

        @param _id Id of the auction
        @param _leftover Exceeding collateral to be deposited on the entry
        @param _received Bought tokens to be used in the payment of the debt
        @param _data Arbitrary data for the *loan* oracle, that may be required
            to perform the payment (the loan oracle may differ from the collateral oracle)
    */
    function auctionClosed(
        uint256 _id,
        uint256 _leftover,
        uint256 _received,
        bytes calldata _data
    ) external nonReentrant() {
        // This method is an internal callback and should only
        // be called by the auction contract
        require(msg.sender == address(auction), "collateral: caller should be the auctioner");

        // Load the collateral ID associated with the auction ID
        uint256 entryId = auctionToEntry[_id];

        // A collateral associated with this ID should exists
        require(entryId != 0, "collateral: entry does not exists");

        // Read the collateral entry from storage
        CollateralLib.Entry storage entry = entries[entryId];

        // Delete auction entry
        delete entryToAuction[entryId];
        delete auctionToEntry[_id];

        // Use received to pay loan
        // `_data` should contain the `oracleData` for the loan
        (, uint256 paidTokens) = loanManager.safePayToken(
            entry.debtId,
            _received,
            address(this),
            _data
        );

        // If we have exceeding tokens
        // send them to the owner of the collateral
        if (paidTokens < _received) {
            require(
                loanManagerToken.safeTransfer(
                    _ownerOf(entryId),
                    _received - paidTokens
                ),
                "collateral: error sending tokens"
            );
        }

        // Return leftover collateral to the collateral entry
        entry.amount = _leftover;

        // Emit closed auction event
        emit ClosedAuction(
            entryId,
            _received,
            _leftover
        );
    }

    // ///
    // Cosigner methods
    // ///

    /**
        @notice Sets the url that provides metadata
            about the collateral entries

        @param _url New url
    */
    function setUrl(string calldata _url) external nonReentrant() onlyOwner {
        iurl = _url;
        emit SetUrl(_url);
    }

    /**
        @notice Returns the cost of the cosigner

        @dev This cosigner does not have any risk or maintenance cost, so its free

        @return 0, because it's free
    */
    function cost(
        address,
        uint256,
        bytes memory,
        bytes memory
    ) public view returns (uint256) {
        return 0;
    }

    /**
        @notice Returns an URL that points to metadata
            about the collateral entries

        @return An URL string
    */
    function url() public view returns (string memory) {
        return iurl;
    }

    /**
        @notice Request the consignment of a debt, this process finishes
            the attachment of the collateral to the debt

        @dev The collateral/debt ratio must not be below the liquidation ratio,
            this is intended to avoid front-running and removing the collateral

        @param _debtId Id of the debt
        @param _data Bytes array, must contain the collateral ID on the first 32 bytes
        @param _oracleData Arbitrary data for the *loan* oracle, that may be required
            to perform the payment (the loan oracle may differ from the collateral oracle)

        @return `true` If the consignment was successful
    */
    function requestCosign(
        address,
        uint256 _debtId,
        bytes memory _data,
        bytes memory _oracleData
    ) public nonReentrant() returns (bool) {
        bytes32 debtId = bytes32(_debtId);

        // Validate debtId, can't be zero
        require(_debtId != 0, "collateral: invalid debtId");

        // Only the loanManager can request consignments
        require(address(loanManager) == msg.sender, "collateral: only the loanManager can request cosign");

        // Load entryId from provided `_data`
        uint256 entryId = abi.decode(_data, (uint256));

        // Validate that the `entryId` corresponds to the `debtId`
        CollateralLib.Entry storage entry = entries[entryId];
        require(entry.debtId == debtId, "collateral: incorrect debtId");

        // Validate that the loan is collateralized
        require(
            !entry.inLiquidation(_debtInTokens(debtId, _oracleData)),
            "collateral: entry not collateralized"
        );

        // Save entryId, attach the entry to the debt
        debtToEntry[debtId] = entryId;

        // Callback loanManager and cosign
        require(loanManager.cosign(_debtId, 0), "collateral: error during cosign");

        // Emit the `Started` event
        emit Started(entryId);

        // Returning `true` signals the `loanManager`
        // that the consignment was accepted
        return true;
    }

    /**
        @notice Trigger the liquidation of collateral because of overdue payment or
            under-collateralized position, the liquidation is not instantaneous and happens through an auction process

        @dev There are two liquidation triggering conditions:
            Payment of the debt has expired, the liquidation is triggered to pay the total amount
                of overdue debt
            The `collateral / debt` ratio is below the `liquidationRatio`, the liquidation is
                triggered to balance the ratio up to `balanceRatio`

        @param _debtId Id of the debt
        @param _oracleData Arbitrary data for the *loan* oracle, that may be required
            to perform the payment (the loan oracle may differ from the collateral oracle)

        @return true If a liquidation was triggered
    */
    function claim(
        address,
        uint256 _debtId,
        bytes memory _oracleData
    ) public nonReentrant() returns (bool) {
        bytes32 debtId = bytes32(_debtId);
        uint256 entryId = debtToEntry[debtId];
        require(entryId != 0, "collateral: collateral not found for debtId");

        if (_claimLiquidation(entryId, debtId, _oracleData)) {
            return true;
        }

        return _claimExpired(entryId, debtId, _oracleData);
    }

    /**
        @notice Checks if a collateral entry is in the process of being auctioned

        @param _entryId Id of the collateral entry

        @return `true` if the collateral entry is being auctioned
    */
    function inAuction(uint256 _entryId) public view returns (bool) {
        return entryToAuction[_entryId] != 0;
    }

    /**
        @notice Validates if a collateral entry is under-collateralized and triggers a liquidation
            if that's the case. The liquidation tries to sell enough collateral to pay the debt
            and make the collateral/debt ratio reach `balanceRatio`

        @param _entryId Id of the collateral entry
        @param _debtId Id of the debt
        @param _oracleData Arbitrary data field requested by the
            collateral entry oracle, may be required to retrieve the rate

        @return `true` if a liquidation was triggered
    */
    function _claimLiquidation(
        uint256 _entryId,
        bytes32 _debtId,
        bytes memory _oracleData
    ) internal returns (bool) {
        // Read entry from storage
        CollateralLib.Entry memory entry = entries[_entryId];

        // Check if collateral needs liquidation
        uint256 debt = _debtInTokens(_debtId, _oracleData);
        if (entry.inLiquidation(debt)) {
            // Calculate how much collateral has to be sold
            // to balance the collateral/debt ratio
            (uint256 marketValue, uint256 required) = entry.balance(debt);

            // Trigger an auction
            uint256 auctionId = _triggerAuction(
                _entryId,
                required,
                marketValue
            );

            emit ClaimedLiquidation(
                _entryId,
                auctionId,
                debt,
                required,
                marketValue
            );

            return true;
        }
    }

    /**
        @notice Validates if the debt attached to a collateral has overdue payments, and
            triggers a liquidation to pay the arrear debt, an extra 5% is requested to
            account for accrued interest during the auction

        @param _entryId Id of the collateral entry
        @param _debtId Id of the debt
        @param _oracleData Arbitrary data field requested by the
            collateral entry oracle, may be required to retrieve the rate

        @return `true` if a liquidation was triggered
    */
    function _claimExpired(
        uint256 _entryId,
        bytes32 _debtId,
        bytes memory _oracleData
    ) internal returns (bool) {
        // Check if debt is expired
        Model model = Model(loanManager.getModel(_debtId));
        uint256 dueTime = model.getDueTime(_debtId);

        if (block.timestamp >= dueTime) {
            // Determine the arrear debt to pay
            (uint256 obligation,) = model.getObligation(_debtId, uint64(dueTime));

            // Add 5% extra to account for accrued interest during the auction
            obligation = obligation.mult(105).div(100);

            // Valuate the debt amount in loanManagerToken
            uint256 obligationTokens = _toToken(_debtId, obligation, _oracleData);

            // Determine how much collateral should be sold at the
            // current market value to cover the `obligationTokens`
            uint256 marketValue = entries[_entryId].oracle.read().toBase(obligationTokens);

            // Trigger an auction
            uint256 auctionId = _triggerAuction(
                _entryId,
                obligationTokens,
                marketValue
            );

            emit ClaimedExpired(
                _entryId,
                auctionId,
                dueTime,
                obligation,
                obligationTokens,
                marketValue
            );

            return true;
        }
    }

    /**
        @notice Calculates the value of an amount in the debt currency in
            `loanManagerToken`, using the rate provided by the oracle of the debt

        @param _debtId Id of the debt
        @param _amount Amount to valuate provided in the currency of the loan
        @param _data Arbitrary data field requested by the
            collateral entry oracle, may be required to retrieve the rate

        @return Value of `_amount` in `loanManagerToken`
    */
    function _toToken(
        bytes32 _debtId,
        uint256 _amount,
        bytes memory _data
    ) internal returns (uint256) {
        return loanManager
            .oracle(_debtId)
            .read(_data)
            .toTokens(_amount, true);
    }

    /**
        @notice Calculates how much `loanManagerToken` has to be paid in order
            to fully pay the total amount of the debt, at the current timestamp

        @param debtId Id of the debt
        @param _data Arbitrary data field requested by the
            collateral entry oracle, may be required to retrieve the rate

        @return The total amount required to be paid, in `loanManagerToken` tokens
    */
    function _debtInTokens(
        bytes32 debtId,
        bytes memory _data
    ) internal returns (uint256) {
        LoanManager _loanManager = loanManager;
        return _loanManager
            .oracle(debtId)
            .read(_data)
            .toTokens(_loanManager.getClosingObligation(debtId));
    }

    /**
        @notice Triggers a collateral auction with the objetive of buying a requested
            `_targetAmount` and using it to pay the debt

        @dev Only one auction per collateral entry can exist at the same time

        @param _entryId Id of the collateral entry
        @param _targetAmount Requested amount on `loanManagerToken`
        @param _marketValue Current value of the `_targetAmount` on collateral tokens,
            provided by the oracle of the entry. The auction reaches this rate after 10 minutes

        @return The ID of the created auction
    */
    function _triggerAuction(
        uint256 _entryId,
        uint256 _targetAmount,
        uint256 _marketValue
    ) internal returns (uint256 _auctionId) {
        // TODO: Maybe we can update the auction keeping the price?
        require(!inAuction(_entryId), "collateral: auction already exists");

        CollateralLib.Entry storage entry = entries[_entryId];

        // The initial offer is 5% below the current market offer
        // provided by the oracle, the market offer should be reached after 10 minutes
        uint256 initialOffer = _marketValue.mult(95).div(100);

        // Read storage
        CollateralAuction _auction = auction;
        uint256 _amount = entry.amount;
        IERC20 _token = entry.token;

        // Set the entry balance to zero
        delete entry.amount;

        // Approve auction contract
        require(_token.safeApprove(address(_auction), _amount), "collateral: error approving auctioneer");

        // Start auction
        _auctionId = _auction.create(
            _token,          // Token we are selling
            initialOffer,    // Initial offer of tokens
            _marketValue,    // Market reference offer provided by the Oracle
            _amount,         // The maximun amount of token that we can sell
            _targetAmount    // How much base tokens are needed
        );

        // Clear approve
        require(_token.clearApprove(address(_auction)), "collateral: error clearing approve");

        // Save Auction ID
        entryToAuction[_entryId] = _auctionId;
        auctionToEntry[_auctionId] = _entryId;
    }
}
