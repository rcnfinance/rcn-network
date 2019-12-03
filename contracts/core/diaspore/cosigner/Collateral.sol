pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../../../interfaces/Cosigner.sol";
import "../interfaces/Model.sol";
import "../interfaces/RateOracle.sol";
import "../LoanManager.sol";

import "./interfaces/CollateralAuctionCallback.sol";
import "./interfaces/CollateralHandler.sol";
import "../../../commons/ReentrancyGuard.sol";
import "../../../commons/Fixed223x32.sol";
import "../../../commons/Ownable.sol";
import "../../../commons/ERC721Base.sol";
import "../../../utils/SafeERC20.sol";
import "../../../utils/SafeMath.sol";
import "../utils/DiasporeUtils.sol";
import "../utils/OracleUtils.sol";
import "./CollateralAuction.sol";
import "./CollateralLib.sol";


contract Collateral is ReentrancyGuard, Ownable, Cosigner, ERC721Base, CollateralAuctionCallback {
    using CollateralLib for CollateralLib.Entry;
    using OracleUtils for OracleUtils.Sample;
    using OracleUtils for RateOracle;
    using DiasporeUtils for LoanManager;
    using Fixed223x32 for bytes32;
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

    event TriggerAuction(
        uint256 indexed _entryId,
        uint256 _reason
    );

    event StartedAuction(
        uint256 indexed _entryId,
        uint256 _startOffer,
        uint256 _referenceOffer,
        uint256 _limit,
        uint256 _required
    );

    event ClosedAuction(
        uint256 indexed _entryId,
        uint256 _received,
        uint256 _leftover
    );

    event Redeemed(
        uint256 indexed _entryId
    );

    event EmergencyRedeemed(
        uint256 indexed _entryId,
        address _to
    );

    event SetUrl(
        string _url
    );

    // All collateral entries
    CollateralLib.Entry[] public entries;

    // Define when cosign the debt on requestCosign function
    mapping(bytes32 => uint256) public debtToEntry;

    // URL With collateral offers
    string private iurl;

    // Constant, set in constructor
    LoanManager public loanManager;
    IERC20 public loanManagerToken;

    // Auction storage
    CollateralAuction public auction;
    mapping(uint256 => uint256) public entryToAuction;
    mapping(uint256 => uint256) public auctionToEntry;

    constructor(
        LoanManager _loanManager,
        CollateralAuction _auction
    ) public ERC721Base("RCN Collateral Cosigner", "RCC") {
        require(address(_loanManager) != address(0), "Error loading loan manager");
        loanManager = _loanManager;
        loanManagerToken = loanManager.token();
        // Invalid entry of index 0
        entries.length ++;
        // Create auction contract
        auction = _auction;
    }

    function getEntriesLength() external view returns (uint256) {
        return entries.length;
    }

    /**
        @notice Create an entry, previous need the approve of the ERC20 tokens
            Ratio: The ratio is expressed in order of BASE(10000), for example
                1% is 100
                150.00% is 15000
                123.45% is 12345

        @dev This generate an ERC721,
            The _liquidationRatio should be greater than BASE(10000)
            The _balanceRatio should be greater than _liquidationRatio
            The debt should be in open status

        @param _debtId Id of the debt
        @param _oracle The oracle to get the rate between loanManagerToken and entry token
            If the oracle its the address 0 the entry token its the loanManagerToken
                otherwise the token its the oracle.token
        @param _amount The amount to be transferred to the contract

        @param _liquidationRatio Ratio, when collateral ratio is lower enables the execution of the margin call
        @param _balanceRatio Ratio, expected collateral ratio after margin call execution

        @return The id of the entry
    */
    function create(
        bytes32 _debtId,
        RateOracle _oracle,
        uint256 _amount,
        uint96 _liquidationRatio,
        uint96 _balanceRatio
    ) external nonReentrant() returns (uint256 entryId) {
        // Check status of loan, should be open
        require(loanManager.getStatus(_debtId) == 0, "Debt request should be open");

        // Use the Oracle token
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

        // Take the ERC20 tokens
        require(token.safeTransferFrom(msg.sender, address(this), _amount), "Error pulling tokens");

        // Generate the ERC721 Token
        _generate(entryId, msg.sender);

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
        @notice Deposit an amount in an entry, previous need the approve of the ERC20 tokens

        @param _entryId The index of entry, inside of entries array
        @param _amount The amount to be transferred to the contract
    */
    function deposit(
        uint256 _entryId,
        uint256 _amount
    ) external nonReentrant() {
        require(!inAuction(_entryId), "collateral: can deposit during auction");

        // Load entry from storage
        CollateralLib.Entry storage entry = entries[_entryId];

        // Take the ERC20 tokens
        require(entry.token.safeTransferFrom(msg.sender, address(this), _amount), "Error pulling tokens");

        // Register the deposit of amount on the entry
        entry.amount = entry.amount.add(_amount);

        emit Deposited(_entryId, _amount);
    }

    /**
        @notice Withdraw an amount of an entry

        @param _entryId The index of entry, inside of entries array
        @param _to The beneficiary of the tokens
        @param _amount The amount to be subtract of the entry
        @param _oracleData Data of oracle to change the currency of debt
            to Token of debt engine
    */
    function withdraw(
        uint256 _entryId,
        address _to,
        uint256 _amount,
        bytes calldata _oracleData
    ) external nonReentrant() onlyAuthorized(_entryId) {
        require(!inAuction(_entryId), "collateral: can withdraw during auction");

        // Load entry from storage
        CollateralLib.Entry storage entry = entries[_entryId];
        bytes32 debtId = entry.debtId;
        uint256 entryAmount = entry.amount;

        // Check if the entry is cosigned
        // and if it's cosigned check how much collateral
        // can be withdrew
        if (debtToEntry[debtId] != 0) {
            // Check if can withdraw the requested amount
            require(
                _amount <= entry.canWithdraw(_debtInTokens(debtId, _oracleData)),
                "Dont have collateral to withdraw"
            );
        }

        // Register the withdraw of amount on the entry
        require(entryAmount >= _amount, "Don't have collateral to withdraw");
        entry.amount = entryAmount.sub(_amount);

        // Send the amount of ERC20 tokens to _to
        require(entry.token.safeTransfer(_to, _amount), "Error sending tokens");

        emit Withdraw(_entryId, _to, _amount);
    }

    /**
        @notice Redeem/Forgive an entry, only an authorized can be use this function
            The state of the debt must be request(0)
            The state of the debt must be paid(2)

        @dev call _redeem function with false in _emergency parameter
            * look in _redeem function documentation for more info

        @param _entryId The index of entry, inside of entries array

        @return The amount of transferred tokens
    */
    function redeem(
        uint256 _entryId
    ) external nonReentrant() onlyAuthorized(_entryId) returns(uint256) {
        return _redeem(_entryId, msg.sender, false);
    }

    /**
        @notice Redeem/Forgive an entry, only owner of contract can be use this function
            The state of the debt must be ERROR(4)

        @dev call _redeem function with true in _emergency parameter
            * look in _redeem function documentation for more info

        @param _entryId The index of entry, inside of entries array
        @param _to The beneficiary of the tokens

        @return The amount of transferred tokens
    */
    function emergencyRedeem(
        uint256 _entryId,
        address _to
    ) external nonReentrant() onlyOwner returns(uint256) {
        return _redeem(_entryId, _to, true);
    }

    /**
        Borrows collateral, with the condition of returning it at the end of the call.

        @dev Can be used to pay the loan using the collateral

        @param _entryId Id of the entry
        @param _handler Contract handler of the collateral
        @param _data Arbitrary _data field for the handler
        @param _oracleData Loan oracle data
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

        // Get original collateral ratio
        bytes32 ogRatio = entry.ratio(_debtInTokens(debtId, _oracleData));

        // Send all colleteral to handler
        uint256 lent = entry.amount;
        entry.amount = 0;
        entry.token.safeTransfer(address(_handler), lent);

        // Call handler
        // replace with interface
        uint256 surplus = _handler.handle(_entryId, lent, _data);
        entry.token.safeTransferFrom(address(_handler), address(this), surplus);
        entry.amount = surplus;

        // Read ratio, should be better than previus one
        // only if the loan wasn’t fully paid
        if (loanManager.getStatus(entry.debtId) != 2) {
            bytes32 afRatio = entry.ratio(_debtInTokens(debtId, _oracleData));
            require(afRatio.gt(ogRatio), "collateral: ratio should increase");
        }
    }

    function auctionClosed(
        uint256 _id,
        uint256 _leftover,
        uint256 _received,
        bytes calldata _data
    ) external nonReentrant() {
        require(msg.sender == address(auction), "collateral: caller should be the auctioner");
        uint256 entryId = auctionToEntry[_id];

        require(entryId != 0, "collateral: entry does not exists");
        CollateralLib.Entry storage entry = entries[entryId];

        // Delete auction entry
        delete entryToAuction[entryId];
        delete auctionToEntry[_id];

        // Use received to pay loan
        (, uint256 paidTokens) = loanManager.safePayToken(
            entry.debtId,
            _received,
            address(this),
            _data
        );

        // If we have exceeding tokens
        // send them to the owner of the collateral
        if (paidTokens < _received) {
            loanManagerToken.transfer(
                _ownerOf(entryId),
                _received - paidTokens
            );
        }

        // Return leftover collateral
        entry.amount = entry.amount.add(_leftover);

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
        @dev Sets the url to retrieve the data for "requestCosign"

        @param _url New url
    */
    function setUrl(string calldata _url) external nonReentrant() onlyOwner {
        iurl = _url;
        emit SetUrl(_url);
    }

    /**
        @notice Returns the cost of the cosigner

        This cosigner does not have any risk or maintenance cost, so its free.

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

    function url() public view returns (string memory) {
        return iurl;
    }

    /**
        @notice Request the cosign of a debt

        @dev This function should be send by the loanManager

        @param _debtId Id of the debt
        @param _data Data with the entry index
        @param _oracleData Data of oracle to change the currency of debt
            to Token of debt engine

        @return true If the cosign was done
    */
    function requestCosign(
        address,
        uint256 _debtId,
        bytes memory _data,
        bytes memory _oracleData
    ) public nonReentrant() returns (bool) {
        bytes32 debtId = bytes32(_debtId);

        // Validate call from loan manager
        require(address(loanManager) == msg.sender, "Not the debt manager");

        // Load entryId and entry
        uint256 entryId = abi.decode(_data, (uint256));
        CollateralLib.Entry storage entry = entries[entryId];
        require(entry.debtId == debtId, "Wrong debt id");

        // Validate if the collateral is enough
        // and if the loan is collateralized
        require(
            !entry.inLiquidation(_debtInTokens(debtId, _oracleData)),
            "The entry its not collateralized"
        );

        // Save entryId
        debtToEntry[debtId] = entryId;

        // Cosign
        require(loanManager.cosign(_debtId, 0), "Error performing cosign");

        emit Started(entryId);

        return true;
    }

    /**
        @notice Execute a pay of a expired debt or a margin call

        @dev There are two important behaviors:
            Execute a pay of a expired debt, transform the Token of the entry to LoanManager Token
                to pay the expired part of the debt and the fees
            Execute a margin call, transform the Token of the entry to LoanManager Token to pay a
                part(the minimum amount required to equilibrate the balance) of the debt and the fees,
                to try balance the collateral ratio

        @param _debtId Id of the debt
        @param _oracleData Data of oracle to change the currency of debt
            to Token of debt engine

        @return true If execute a pay debt or a margin call
    */
    function claim(
        address,
        uint256 _debtId,
        bytes memory _oracleData
    ) public nonReentrant() returns (bool) {
        bytes32 debtId = bytes32(_debtId);
        uint256 entryId = debtToEntry[debtId];
        require(entryId != 0, "The loan dont lent");

        if (_claimLiquidation(entryId, debtId, _oracleData)) {
            return true;
        }

        return _claimExpired(debtId, _oracleData);
    }

    function inAuction(uint256 _entryId) public view returns (bool) {
        return entryToAuction[_entryId] != 0;
    }

    function _claimLiquidation(
        uint256 _entryId,
        bytes32 _debtId,
        bytes memory _oracleData
    ) internal returns (bool) {
        CollateralLib.Entry memory entry = entries[_entryId];

        // Check if collateral needs liquidation
        uint256 debt = _debtInTokens(_debtId, _oracleData);
        if (entry.inLiquidation(debt)) {
            // Trigger auction
            _triggerAuction(
                _entryId,
                entry.balance(debt)
            );

            return true;
        }
    }

    function _claimExpired(
        bytes32 _debtId,
        bytes memory _oracleData
    ) internal returns (bool) {
        // Check if debt is expired
        Model model = Model(loanManager.getModel(_debtId));
        uint256 dueTime = model.getDueTime(_debtId);

        if (block.timestamp >= dueTime) {
            // Run payment of debt, use collateral to buy tokens
            (uint256 obligation,) = model.getObligation(_debtId, uint64(dueTime));

            // Valuate the debt amount from debt currency to loanManagerToken
            // request 5% extra to account for accrued interest during the auction
            uint256 obligationToken = _toToken(_debtId, obligation, _oracleData);

            // Trigger the auction
            _triggerAuction(
                debtToEntry[_debtId],
                obligationToken
            );

            return true;
        }
    }

    function _toToken(
        bytes32 _debtId,
        uint256 _amount,
        bytes memory _data
    ) internal returns (uint256) {
        return loanManager
            .oracle(_debtId)
            .read(_data)
            .toTokens(_amount, true)
            .mult(105)
            .div(100);
    }

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

    function _triggerAuction(
        uint256 _entryId,
        uint256 _targetAmount
    ) internal {
        // TODO: Maybe we can update the auction keeping the price?
        require(!inAuction(_entryId), "collateral: auction already exists");

        CollateralLib.Entry storage entry = entries[_entryId];

        // TODO: @audit reentrancy on oracle ?
        uint256 referenceOffer = entry.oracle
            .read()
            .toBase(_targetAmount);

        uint256 initialOffer = referenceOffer.mult(95).div(100);

        // Read storage
        CollateralAuction _auction = auction;
        uint256 _amount = entry.amount;
        IERC20 _token = entry.token;

        // Approve auction contract
        _token.safeApprove(address(_auction), _amount);

        // Start auction
        uint256 auctionId = _auction.create(
            _token,          // Token we are selling
            initialOffer,    // Initial offer of tokens
            referenceOffer,  // Market reference offer provided by the Oracle
            _amount,         // The maximun amount of token that we can sell
            _targetAmount    // How much base tokens are needed
        );

        // Clear approve
        _token.clearApprove(address(_auction));

        // Save Auction ID
        entryToAuction[_entryId] = auctionId;
        auctionToEntry[auctionId] = _entryId;

        // Send tokens to auction contract
        require(_token.safeTransfer(address(_auction), _amount), "collatereal: error sending token to auction");

        emit StartedAuction(
            _entryId,
            initialOffer,
            referenceOffer,
            _amount,
            _targetAmount
        );
    }

    /**
        @notice Redeem/Forgive an entry

        @dev Send the balance of the entry to _to and delete the entry

        @param _entryId Id of the entry
        @param _to The beneficiary of the tokens
        @param _emergency Boolean:
            True, look in emergencyRedeem function
            False, look in redeem function

        @return The amount of transferred tokens
    */
    function _redeem(
        uint256 _entryId,
        address _to,
        bool _emergency
    ) internal returns(uint256 totalTransfer) {
        CollateralLib.Entry storage entry = entries[_entryId];
        // Get debt status
        uint256 status = loanManager.getStatus(entry.debtId);

        if (_emergency) {
            // The state of the debt must be ERROR(4)
            require(status == 4, "Debt is not in error");
            emit EmergencyRedeemed(_entryId, _to);
        } else {
            // The state of the debt must be request(0) or paid(2)
            require(status == 0 || status == 2, "Debt not request or paid");
            emit Redeemed(_entryId);
        }

        totalTransfer = entry.amount;
        IERC20 token = entry.token;

        // Destroy ERC721 collateral token
        delete debtToEntry[entry.debtId];
        delete entries[_entryId];

        // Send the amount of ERC20 tokens to _to
        require(token.safeTransfer(_to, totalTransfer), "Error sending tokens");
    }
}
