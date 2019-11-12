pragma solidity ^0.5.11;

import "../../../interfaces/IERC20.sol";
import "../../../interfaces/Cosigner.sol";
import "../../../interfaces/TokenConverter.sol";
import "../interfaces/Model.sol";
import "../interfaces/RateOracle.sol";
import "../utils/DiasporeUtils.sol";
import "../LoanManager.sol";

import "../../../commons/Ownable.sol";
import "../../../commons/ERC721Base.sol";
import "../../../utils/SafeERC20.sol";
import "../../../utils/SafeMath.sol";
import "../../../utils/SafeCast.sol";
import "../../../utils/SafeSignedMath.sol";
import "../../../utils/SafeTokenConverter.sol";
import "../../../utils/Math.sol";
import "../utils/OracleUtils.sol";


contract Collateral is Ownable, Cosigner, ERC721Base {
    using SafeTokenConverter for TokenConverter;
    using DiasporeUtils for LoanManager;
    using OracleUtils for OracleUtils.Sample;
    using OracleUtils for RateOracle;
    using SafeSignedMath for int256;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SafeMath for uint32;
    using SafeCast for uint256;
    using SafeCast for int256;

    // This reprecent a 100.00%
    uint256 private constant BASE = 10000;

    event Created(
        uint256 indexed _entryId,
        bytes32 indexed _debtId,
        RateOracle _oracle,
        IERC20 _token,
        uint256 _amount,
        uint32 _liquidationRatio,
        uint32 _balanceRatio
    );

    event Deposited(uint256 indexed _entryId, uint256 _amount);
    event Withdrawed(uint256 indexed _entryId, address _to, uint256 _amount);

    event Started(uint256 indexed _entryId);

    event PayOffDebt(uint256 indexed _entryId, uint256 _closingObligationToken, uint256 _payTokens);
    event CancelDebt(uint256 indexed _entryId, uint256 _obligationInToken, uint256 _payTokens);
    event CollateralBalance(uint256 indexed _entryId, uint256 _tokenRequiredToTryBalance, uint256 _payTokens);

    event ConvertPay(uint256 indexed _entryId, uint256 _fromAmount, uint256 _toAmount, bytes _oracleData);
    event Rebuy(uint256 indexed _entryId, uint256 _fromAmount, uint256 _toAmount);

    event Redeemed(uint256 indexed _entryId);
    event EmergencyRedeemed(uint256 indexed _entryId, address _to);

    event SetUrl(string _url);
    event SetConverter(TokenConverter _converter);
    event SetMaxSpreadRatio(address _token, uint256 _maxSpreadRatio);

    event ReadedOracle(RateOracle _oracle, uint256 _tokens, uint256 _equivalent);

    Entry[] public entries;
    // Define when cosign the debt on requestCosign function
    mapping(bytes32 => uint256) public debtToEntry;

    // Can change
    string private iurl;
    TokenConverter public converter;
    // Constant, set in constructor
    LoanManager public loanManager;
    IERC20 public loanManagerToken;

    // Set in create function
    struct Entry {
        RateOracle oracle;
        IERC20 token;
        bytes32 debtId;
        uint256 amount;
        uint32 liquidationRatio;
        uint32 balanceRatio;
    }

    constructor(LoanManager _loanManager) public ERC721Base("RCN Collateral Cosigner", "RCC") {
        require(address(_loanManager) != address(0), "Error loading loan manager");
        loanManager = _loanManager;
        loanManagerToken = loanManager.token();
        // Invalid entry of index 0
        entries.length ++;
    }

    function getEntriesLength() external view returns (uint256) { return entries.length; }

    /**
        @dev Sets the converter uses to convert from/to loanManagerToken to/from entry token

        @param _converter New converter
    */
    function setConverter(TokenConverter _converter) external onlyOwner {
        converter = _converter;
        emit SetConverter(_converter);
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
        uint32 _liquidationRatio,
        uint32 _balanceRatio
    ) external returns (uint256 entryId) {
        // Check parameters
        require(_liquidationRatio > BASE, "The liquidation ratio should be greater than BASE");
        require(_balanceRatio > _liquidationRatio, "The balance ratio should be greater than liquidation ratio");
        // Check status of loan, should be open
        require(loanManager.getStatus(_debtId) == 0, "Debt request should be open");

        IERC20 token = _oracle == RateOracle(0) ? loanManagerToken : IERC20(_oracle.token());
        // Create the entry, and push on entries array
        entryId = entries.push(
            Entry({
                oracle: _oracle,
                token: token,
                debtId: _debtId,
                amount: _amount,
                liquidationRatio: _liquidationRatio,
                balanceRatio: _balanceRatio,
            })
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
            _balanceRatio,
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
    ) external {
        Entry storage entry = entries[_entryId];
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
    ) external onlyAuthorized(_entryId) {
        Entry storage entry = entries[_entryId];
        bytes32 debtId = entry.debtId;

        uint256 entryAmount = entry.amount;

        // Check if the entry is cosigned
        // and if it's cosigned check how much collateral
        // can be withdrew
        if (debtToEntry[debtId] != 0) {
            // Check if can withdraw the requested amount
            require(
                _amount.toInt256() <= canWithdraw(
                    _entryId,                                   // ID of the collateral entry
                    debtInTokens(debtId, _oracleData),          // Value of the debt in tokens (debt oracle)
                    entry.oracle.read().toTokens(entryAmount)   // Value of the collateral in tokens (collateral oracle)
                ),
                "Dont have collateral to withdraw"
            );
        }

        // Register the withdraw of amount on the entry
        require(entryAmount >= _amount, "Don't have collateral to withdraw");
        entry.amount = entryAmount.sub(_amount);

        // Send the amount of ERC20 tokens to _to
        require(entry.token.safeTransfer(_to, _amount), "Error sending tokens");

        emit Withdrawed(_entryId, _to, _amount);
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
    ) external onlyAuthorized(_entryId) returns(uint256) {
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
    ) external onlyOwner returns(uint256) {
        return _redeem(_entryId, _to, true);
    }

    /**
        @notice Pay a debt with the entry balance, only an authorized can be use this function

        @dev Convert the necessary amount of Token of the entry in Loan Manager Token to try pay all the debt

        @param _entryId Id of the entry
        @param _oracleData Data of oracle to change the currency of debt
            to Token of debt engine

        @return The amount of paid tokens
    */
    function payOffDebt(
        uint256 _entryId,
        bytes calldata _oracleData
    ) external onlyAuthorized(_entryId) returns(uint256 payTokens) {
        Entry storage entry = entries[_entryId];
        bytes32 debtId = entry.debtId;
        Model model = Model(loanManager.getModel(uint256(debtId)));

        // Get the closing obligation
        uint256 closingObligation = model.getClosingObligation(debtId);

        // Transform the closing obligation to tokens using the rate of oracle
        uint256 closingObligationToken = loanManager
            .oracle(debtId)
            .read(_oracleData)
            .toTokens(closingObligation, true);

        // Convert the tokens of the entry to LoanManager Token and pay the debt
        payTokens = _convertPay(
            _entryId,
            closingObligationToken,
            _oracleData,
            false
        );

        emit PayOffDebt(_entryId, closingObligationToken, payTokens);
    }

    // ///
    // Cosigner methods
    // ///

    /**
        @dev Sets the url to retrieve the data for "requestCosign"

        @param _url New url
    */
    function setUrl(string calldata _url) external onlyOwner {
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
    ) public returns (bool) {
        bytes32 debtId = bytes32(_debtId);

        // Validate call from loan manager
        require(address(loanManager) == msg.sender, "Not the debt manager");

        // Load entryId and entry
        uint256 entryId = abi.decode(_data, (uint256));
        Entry storage entry = entries[entryId];
        require(entry.debtId == debtId, "Wrong debt id");

        // Validate if the collateral is enough
        // and if the loan is collateralized
        require(
            canWithdraw(
                entryId,                                   // Collateral ID
                debtInTokens(debtId, _oracleData),         // Value of debt in tokens (debt oracle)
                entry.oracle.read().toTokens(entry.amount) // Value of collateral in tokens (collateral oracle)
            ) >= 0, "The entry its not collateralized"
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
    ) public returns (bool change) {
        bytes32 debtId = bytes32(_debtId);
        uint256 entryId = debtToEntry[debtId];
        require(entryId != 0, "The loan dont lent");

        Model model = Model(loanManager.getModel(_debtId));
        uint256 dueTime = model.getDueTime(debtId);

        if (block.timestamp >= dueTime) { // Expired debt
            // Run payment of debt, use collateral to buy tokens
            (uint256 obligation,) = model.getObligation(debtId, uint64(dueTime));

            // Valuate the debt amount from debt currency to loanManagerToken
            uint256 obligationToken = loanManager
                .oracle(debtId)
                .read(_oracleData)
                .toTokens(obligation, true);

            // Convert the tokens of the entry to LoanManager Token and pay the debt
            uint256 payTokens = _convertPay(
                entryId,
                obligationToken,
                _oracleData,
                true
            );

            emit CancelDebt(entryId, obligationToken, payTokens);

            change = true;
        }

        // Get the minimum amount required to balance the collateral ratio
        uint256 tokenRequiredToTryBalance = getTokenRequiredToTryBalance(entryId, _oracleData);

        if (tokenRequiredToTryBalance > 0) {
            // Run margin call, buy required tokens
            // and substract from total collateral
            uint256 payTokens = _convertPay(
                entryId,
                tokenRequiredToTryBalance,
                _oracleData,
                true
            );

            emit CollateralBalance(entryId, tokenRequiredToTryBalance, payTokens);

            change = true;
        }
    }

    /**
        @param _entryId ID of the collateral entry
        @param _oracleData Oracle Data for debt oracle

        @return The minimum amount valuate in collateral token of:
            collateral required to balance the entry
            entry amount
    */
    function getTokenRequiredToTryBalance(
        uint256 _entryId,
        bytes memory _oracleData
    ) public returns(uint256) {
        Entry storage entry = entries[_entryId];

        // Valuate the debt amount from debt currency to loanManagerToken
        uint256 debt = debtInTokens(entry.debtId, _oracleData);

        // If the debt amount its 0 dont need balance the entry
        if (debt == 0) return 0;

        OracleUtils.Sample memory sample = entry.oracle.read();
        uint256 collateralInToken = sample.toTokens(entry.amount);

        // If the entry is collateralized should not have collateral amount to pay
        if (deltaCollateralRatio(
            entry.liquidationRatio,
            debt,
            collateralInToken
        ) >= 0) {
            return 0;
        }

        uint256 cwithdraw = canWithdraw(_entryId, debt, collateralInToken).abs().toUint256();

        // Check underflow when create the entry
        uint256 collateralRequiredToBalance = cwithdraw.mult(BASE) / (entry.balanceRatio - BASE);

        uint256 min = Math.min(
            // The collateral required to equilibrate the balance (the collateral should be more than the debt)
            collateralRequiredToBalance,
            // Pay all collateral amount (the collateral should be less than the debt)
            entry.amount
        );

        return sample.toTokens(min);
    }

    /**
        @param _entryId The index of entry, inside of entries array
        @param _debtInToken The total amount of the debt valuate in loanManagerToken
        @param _collateralInToken The total balance of the entry valuate in loanManagerToken

        @return The amount that can be withdraw of the collateral, valuate in collateral Token.
            If the return its negative, the entry should be below of the balance ratio
    */
    function canWithdraw(
        uint256 _entryId,
        uint256 _debtInToken,
        uint256 _collateralInToken
    ) public view returns (int256) {
        Entry storage entry = entries[_entryId];

        int256 ratio = collateralRatio(_debtInToken, _collateralInToken).toInt256();
        int256 collateral = entry.amount.toInt256();

        // if the collateralRatio its 0 can withdraw all the collateral, because the debt amount its 0
        if (ratio == 0) return collateral;

        int256 delta = deltaCollateralRatio(
            entry.balanceRatio,
            _debtInToken,
            _collateralInToken
        );

        return collateral.muldiv(delta, ratio);
    }

    /**
        @param _ratio Ratio to substract collateralRatio
        @param _debtInToken The total amount of the debt valuate in loanManagerToken
        @param _collateralInToken The total balance of the entry valuate in loanManagerToken

        @return The collateral ratio minus the ratio
    */
    function deltaCollateralRatio(
        uint256 _ratio,
        uint256 _debtInToken,
        uint256 _collateralInToken
    ) public pure returns (int256) {
        return collateralRatio(_debtInToken, _collateralInToken).toInt256().sub(int256(_ratio));
    }

    /**
        @param _debtInToken The total amount of the debt valuate in loanManagerToken
        @param _collateralInToken The total balance of the entry valuate in loanManagerToken

        @return The ratio of the collateral vs the debt
    */
    function collateralRatio(
        uint256 _debtInToken,
        uint256 _collateralInToken
    ) public pure returns (uint256) {
        // if the debt amount its 0 the collateral ratio its 0
        if (_debtInToken == 0) return 0;

        return _collateralInToken.multdiv(BASE, _debtInToken);
    }

    /**

    */
    function debtInTokens(
        bytes32 debtId,
        bytes memory _data
    ) public returns (uint256) {
        LoanManager _loanManager = loanManager;
        return _loanManager
            .oracle(debtId)
            .read(_data)
            .toTokens(_loanManager.getClosingObligation(debtId));
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
        Entry storage entry = entries[_entryId];
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

    /**
        @param _entryId The index of entry, inside of entries array
        @param _requiredToken The required amount to pay in loanManager token
        @param _oracleData Data of oracle to change the currency of debt
            to Token of debt engine

        @return The minimum amount valuate in collateral token of:
            collateral required to balance the entry
            entry amount
    */
    function _convertPay(
        uint256 _entryId,
        uint256 _requiredToken,
        bytes memory _oracleData
    ) internal returns(uint256 paidTokens) {
        Entry storage entry = entries[_entryId];
        // Target buy
        uint256 targetBuy = _requiredToken;

        // Load entry token
        IERC20 token = entry.token;

        // Use collateral to buy tokens
        (uint256 bought, uint256 sold) = converter.safeConvertToMax(
            token,            // Token to sell
            loanManagerToken, // Token to buy
            targetBuy,        // Target buy amount in buy token
            entry.amount      // Max amount to sell in sell token
        );

        uint256 tokensToPay = Math.min(bought, targetBuy);

        // Pay debt
        (, paidTokens) = loanManager.safePayToken(
            entry.debtId,
            tokensToPay,
            address(this),
            _oracleData
        );

        emit ConvertPay(
            _entryId,
            sold,
            bought,
            _oracleData
        );

        if (paidTokens < tokensToPay) {
            // Buy back extra collateral
            sold = tokensToPay - paidTokens;
            bought = converter.safeConvertFrom(
                loanManagerToken,
                token,
                sold,
                0
            );
            emit Rebuy(_entryId, sold, bought);
        } else {
            bought = 0;
        }

        entry.amount = entry.amount.sub(sold).add(bought);
    }
}
