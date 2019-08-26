pragma solidity ^0.5.8;

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


contract Collateral is Ownable, Cosigner, ERC721Base {
    using SafeTokenConverter for TokenConverter;
    using DiasporeUtils for LoanManager;
    using SafeSignedMath for int256;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SafeMath for uint32;
    using SafeCast for uint256;
    using SafeCast for int256;

    uint256 private constant BASE = 10000;

    event Created(
        uint256 indexed _entryId,
        bytes32 indexed _debtId,
        RateOracle _oracle,
        IERC20 _token,
        uint256 _amount,
        uint32 _liquidationRatio,
        uint32 _balanceRatio,
        uint32 _burnFee,
        uint32 _rewardFee
    );

    event Deposited(uint256 indexed _entryId, uint256 _amount);
    event Withdrawed(uint256 indexed _entryId, address _to, uint256 _amount);

    event Started(uint256 indexed _entryId);

    event PayOffDebt(uint256 indexed _entryId, uint256 _closingObligationToken, uint256 _payTokens);
    event CancelDebt(uint256 indexed _entryId, uint256 _obligationInToken, uint256 _payTokens);
    event CollateralBalance(uint256 indexed _entryId, uint256 _tokenRequiredToTryBalance, uint256 _payTokens);
    event TakeFee(uint256 indexed _entryId, uint256 _burned, address _rewardTo, uint256 _rewarded);

    event ConvertPay(uint256 indexed _entryId, uint256 _fromAmount, uint256 _toAmount, bytes _oracleData);
    event Rebuy(uint256 indexed _entryId, uint256 _fromAmount, uint256 _toAmount);

    event Redeemed(uint256 indexed _entryId);
    event EmergencyRedeemed(uint256 indexed _entryId, address _to);

    event SetUrl(string _url);
    event SetConverter(TokenConverter _converter);

    event ReadedOracle(RateOracle _oracle, uint256 _tokens, uint256 _equivalent);

    Entry[] public entries;
    mapping(bytes32 => uint256) public debtToEntry;


    // Can change
    string private iurl;
    TokenConverter public converter;
    // Constant, set in constructor
    LoanManager public loanManager;
    IERC20 public loanManagerToken;

    struct Entry {
        RateOracle oracle;
        IERC20 token;
        bytes32 debtId;
        uint256 amount;
        uint32 liquidationRatio;
        uint32 balanceRatio;
        uint32 burnFee;
        uint32 rewardFee;
    }

    constructor(LoanManager _loanManager) public ERC721Base("RCN Collateral Cosigner", "RCC") {
        require(address(_loanManager) != address(0), "Error loading loan manager");
        loanManager = _loanManager;
        loanManagerToken = loanManager.token();
        // Invalid entry of index 0
        entries.length ++;
    }

    function getEntriesLength() external view returns (uint256) { return entries.length; }

    function setConverter(TokenConverter _converter) external onlyOwner {
        converter = _converter;
        emit SetConverter(_converter);
    }

    function create(
        bytes32 _debtId,
        RateOracle _oracle,
        IERC20 _token,
        uint256 _amount,
        uint32 _liquidationRatio,
        uint32 _balanceRatio,
        uint32 _burnFee,
        uint32 _rewardFee
    ) external returns (uint256 entryId) {
        require(_oracle != RateOracle(0), "Invalid oracle, cant be address 0");
        require(_liquidationRatio > BASE, "The liquidation ratio should be greater than BASE");
        uint256 totalMargincallFee = _burnFee.add(_rewardFee);
        require(totalMargincallFee < BASE, "Fee should be lower than BASE");
        require(totalMargincallFee < _balanceRatio - _liquidationRatio, "The fee should be less than the difference between balance ratio and liquidation ratio");
        require(_balanceRatio > _liquidationRatio, "The balance ratio should be greater than liquidation ratio");
        // Check underflow in previus require
        require(loanManager.getStatus(_debtId) == 0, "Debt request should be open");

        entryId = entries.push(
            Entry({
                oracle: _oracle,
                token: _token,
                debtId: _debtId,
                amount: _amount,
                liquidationRatio: _liquidationRatio,
                balanceRatio: _balanceRatio,
                burnFee: _burnFee,
                rewardFee: _rewardFee
            })
        ) - 1;

        require(_token.safeTransferFrom(msg.sender, address(this), _amount), "Error pulling tokens");
        _generate(entryId, msg.sender);

        emit Created(
            entryId,
            _debtId,
            _oracle,
            _token,
            _amount,
            _liquidationRatio,
            _balanceRatio,
            _burnFee,
            _rewardFee
        );
    }

    function deposit(
        uint256 _entryId,
        uint256 _amount
    ) external {
        Entry storage entry = entries[_entryId];
        require(entry.token.safeTransferFrom(msg.sender, address(this), _amount), "Error pulling tokens");

        entry.amount = entry.amount.add(_amount);

        emit Deposited(_entryId, _amount);
    }

    function withdraw(
        uint256 _entryId,
        address _to,
        uint256 _amount,
        bytes calldata _oracleData
    ) external {
        // Validate ownership of collateral
        require(_isAuthorized(msg.sender, _entryId), "Sender not authorized");

        Entry storage entry = entries[_entryId];

        if (debtToEntry[entry.debtId] != 0) {
            // Read oracle
            (uint256 debtRateTokens, uint256 debtRateEquivalent) = loanManager.readOracle(entry.debtId, _oracleData);
            require(_amount.toInt256() <= canWithdraw(_entryId, debtRateTokens, debtRateEquivalent), "Dont have collateral to withdraw");
        } else {
            require(_amount <= entry.amount, "Dont have collateral to withdraw");
        }

        require(entry.token.safeTransfer(_to, _amount), "Error sending tokens");

        entry.amount = entry.amount.sub(_amount);

        emit Withdrawed(_entryId, _to, _amount);
    }

    function redeem(
        uint256 _entryId
    ) external returns(uint256) {
        // Validate ownership of collateral
        require(_isAuthorized(msg.sender, _entryId), "Sender not authorized");

        return _redeem(_entryId, msg.sender, false);
    }

    function emergencyRedeem(
        uint256 _entryId,
        address _to
    ) external onlyOwner returns(uint256) {
        return _redeem(_entryId, _to, true);
    }

    function _redeem(
        uint256 _entryId,
        address _to,
        bool _emergency
    ) internal returns(uint256 totalTransfer) {
        Entry storage entry = entries[_entryId];

        uint256 status = loanManager.getStatus(entry.debtId);

        if (_emergency) {
            require(status == 4, "Debt is not in error");
            emit EmergencyRedeemed(_entryId, _to);
        } else {
            require(status == 0 || status == 2, "Debt not request or paid");
            emit Redeemed(_entryId);
        }

        totalTransfer = entry.amount;
        require(entry.token.safeTransfer(_to, totalTransfer), "Error sending tokens");

        // Destroy ERC721 collateral token
        delete debtToEntry[entry.debtId];
        delete entries[_entryId];
    }

    function payOffDebt(
        uint256 _entryId,
        bytes calldata _oracleData
    ) external returns(uint256 payTokens) {
        require(_isAuthorized(msg.sender, _entryId), "The sender its not authorized");
        Entry storage entry = entries[_entryId];
        bytes32 debtId = entry.debtId;
        Model model = Model(loanManager.getModel(uint256(debtId)));

        uint256 closingObligation = model.getClosingObligation(debtId);
        uint256 closingObligationToken = loanManager.amountToToken(debtId, _oracleData, closingObligation);

        payTokens = _convertPay(
            _entryId,
            entry,
            closingObligationToken,
            _oracleData,
            false
        );

        emit PayOffDebt(_entryId, closingObligationToken, payTokens);
    }

    // ///
    // Cosigner methods
    // ///

    function setUrl(string calldata _url) external onlyOwner {
        iurl = _url;
        emit SetUrl(_url);
    }

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

    function requestCosign(
        address,
        uint256 _debtId,
        bytes memory _data,
        bytes memory _oracleData
    ) public returns (bool) {
        // Load entryId and entry
        bytes32 debtId = bytes32(_debtId);
        uint256 entryId = abi.decode(_data, (uint256));
        Entry storage entry = entries[entryId];

        // Check if the entry its collateralized, the ratio collateral/debt should be greator than balanceRatio
        (uint256 debtRateTokens, uint256 debtRateEquivalent) = loanManager.readOracle(debtId, _oracleData);
        (uint256 entryRateTokens, uint256 entryRateEquivalent) = entry.oracle.readSample("");
        emit ReadedOracle(entry.oracle, entryRateTokens, entryRateEquivalent);
        uint256 debt = debtInTokens(entryId, debtRateTokens, debtRateEquivalent);

        require(
            balanceDeltaRatio(
                entryId,
                debt,
                entryRateTokens,
                entryRateEquivalent
            ) >= 0, "The entry its not collateralized"
        );


        // Validate call from loan manager
        require(entry.debtId == debtId, "Wrong debt id");
        require(address(loanManager) == msg.sender, "Not the debt manager");

        // Save entryId
        debtToEntry[debtId] = entryId;

        // Cosign
        require(loanManager.cosign(_debtId, 0), "Error performing cosign");

        emit Started(entryId);

        return true;
    }

    function claim(
        address,
        uint256 _debtId,
        bytes memory _oracleData
    ) public returns (bool change) {
        bytes32 debtId = bytes32(_debtId);
        uint256 entryId = debtToEntry[debtId];
        require(entryId != 0, "The loan dont lent");

        // Load collateral entry
        Entry storage entry = entries[entryId];

        Model model = Model(loanManager.getModel(_debtId));
        uint256 dueTime = model.getDueTime(debtId);

        if (block.timestamp >= dueTime) {
            // Run payment of debt, use collateral to buy tokens
            (uint256 obligation,) = model.getObligation(debtId, uint64(dueTime));
            uint256 obligationToken = loanManager.amountToToken(debtId, _oracleData, obligation);

            uint256 payTokens = _convertPay(
                entryId,
                entry,
                obligationToken,
                _oracleData,
                true
            );

            emit CancelDebt(entryId, obligationToken, payTokens);

            change = true;
        }

        // Read oracle
        (uint256 debtRateTokens, uint256 debtRateEquivalent) = loanManager.readOracle(debtId, _oracleData);
        uint256 tokenRequiredToTryBalance = getTokenRequiredToTryBalance(entryId, debtRateTokens, debtRateEquivalent);

        if (tokenRequiredToTryBalance > 0) {
            // Run margin call, buy required tokens
            // and substract from total collateral
            uint256 payTokens = _convertPay(
                entryId,
                entry,
                tokenRequiredToTryBalance,
                _oracleData,
                true
            );

            emit CollateralBalance(entryId, tokenRequiredToTryBalance, payTokens);

            change = true;
        }
    }

    function _takeFee(
        uint256 _entryId,
        Entry memory _entry,
        uint256 _amount // TODO to doc, this amount is in loanManagerToken
    ) internal returns(uint256 feeTaked) {
        uint256 burned = _takeFeeTo(
            _amount,
            _entry.burnFee,
            address(0)
        );

        uint256 reward = _takeFeeTo(
            _amount,
            _entry.rewardFee,
            msg.sender
        );

        feeTaked = reward.add(burned);

        if (feeTaked != 0)
            emit TakeFee(
                _entryId,
                burned,
                msg.sender,
                reward);
    }

    function _takeFeeTo(
        uint256 _amount,
        uint256 _fee,
        address _to
    ) internal returns(uint256 taked) {
        if (_fee == 0) return 0;

        taked = _fee.mult(_amount) / BASE;

        require(loanManagerToken.transfer(_to, taked), "Error sending tokens");
    }

    function _convertPay(
        uint256 _entryId,
        Entry storage _entry,
        uint256 _requiredToken, // in loanManager token
        bytes memory _oracleData,
        bool _chargeFee
    ) internal returns(uint256 paidTokens) {
        // Target buy
        uint256 targetBuy;

        if (_chargeFee) {
            targetBuy = _requiredToken.mult(
                BASE + _entry.rewardFee + _entry.burnFee
            ) / BASE;
        } else {
            targetBuy = _requiredToken;
        }

        // Use collateral to buy tokens
        (uint256 bought, uint256 sold) = converter.safeConvertToMax(
            _entry.token,         // Token to sell
            loanManagerToken,     // Token to buy
            _entry.amount,        // Amount to sell
            targetBuy             // Target buy amount in buy token
        );

        uint256 feeTaked = _chargeFee ? _takeFee(_entryId, _entry, Math.min(bought, _requiredToken)) : 0;
        uint256 tokensToPay = Math.min(bought, targetBuy).sub(feeTaked);

        // Pay debt
        (, paidTokens) = loanManager.safePayToken(
            _entry.debtId,
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
                _entry.token,
                sold,
                0
            );
            emit Rebuy(_entryId, sold, bought);
        } else {
            bought = 0;
        }

        _entry.amount = _entry.amount.sub(sold).add(bought);
    }

    // Collateral methods

    function getTokenRequiredToTryBalance(
        uint256 _entryId,
        uint256 _debtRateTokens,
        uint256 _debtRateEquivalent
    ) public returns(uint256) {
        Entry storage entry = entries[_entryId];
        uint256 debt = debtInTokens(_entryId, _debtRateTokens, _debtRateEquivalent);

        if (debt == 0) return 0;

        (uint256 entryRateTokens, uint256 entryRateEquivalent) = entry.oracle.readSample("");
        emit ReadedOracle(entry.oracle, entryRateTokens, entryRateEquivalent);

        // If the entry is collateralized should not have collateral amount to pay
        if (liquidationDeltaRatio(
            _entryId,
            debt,
            entryRateTokens,
            entryRateEquivalent
        ) >= 0) {
            return 0;
        }

        uint256 cwithdraw = canWithdraw(_entryId, debt).abs().toUint256();

        // Check underflow when create the entry
        uint256 collateralRequiredToBalance = cwithdraw.mult(BASE) / (entry.balanceRatio - BASE - entry.burnFee - entry.rewardFee);

        uint256 min = Math.min(
            // The collateral required to equilibrate the balance (the collateral should be more than the debt)
            collateralRequiredToBalance,
            // Pay all collateral amount (the collateral should be less than the debt)
            entry.amount
        );

        return collateralToTokens(
            entry.token,
            min,
            entryRateTokens,
            entryRateEquivalent
        );
    }

    function canWithdraw(
        uint256 _entryId,
        uint256 _debtRateTokens,
        uint256 _debtRateEquivalent
    ) public returns (int256) {
        uint256 debtInToken = debtInTokens(_entryId, _debtRateTokens, _debtRateEquivalent);

        return canWithdraw(_entryId, debtInToken);
    }

    function canWithdraw(
        uint256 _entryId,
        uint256 _debtInToken
    ) public returns (int256) {
        Entry storage entry = entries[_entryId];

        (uint256 entryRateTokens, uint256 entryRateEquivalent) = entry.oracle.readSample("");
        emit ReadedOracle(entry.oracle, entryRateTokens, entryRateEquivalent);

        int256 ratio = collateralRatio(
            _entryId,
            _debtInToken,
            entryRateTokens,
            entryRateEquivalent
        ).toInt256();
        int256 collateral = entry.amount.toInt256();

        if (ratio == 0) return collateral;

        int256 delta = balanceDeltaRatio(
            _entryId,
            _debtInToken,
            entryRateTokens,
            entryRateEquivalent
        );
        return collateral.muldiv(delta, ratio);
    }

    /**
        @param _entryId The index of entry, inside of entries array

        @return The collateral ratio minus the liquidation ratio
    */
    function liquidationDeltaRatio(
        uint256 _entryId,
        uint256 _debtInToken,
        uint256 _entryRateTokens,
        uint256 _entryRateEquivalent
    ) public view returns (int256) {
        return collateralRatio(
            _entryId,
            _debtInToken,
            _entryRateTokens,
            _entryRateEquivalent
        ).toInt256().sub(int256(entries[_entryId].liquidationRatio));
    }

    /**
        f The index of entry, inside of entries array

        @return The collateral ratio minus the balance ratio
    */
    function balanceDeltaRatio(
        uint256 _entryId,
        uint256 _debtInToken,
        uint256 _entryRateTokens,
        uint256 _entryRateEquivalent
    ) public view returns (int256) {
        return collateralRatio(
            _entryId,
            _debtInToken,
            _entryRateTokens,
            _entryRateEquivalent
        ).toInt256().sub(int256(entries[_entryId].balanceRatio));
    }

    /**
        @param _entryId The index of entry, inside of entries array

        @return The ratio of the collateral vs the debt
    */
    function collateralRatio(
        uint256 _entryId,
        uint256 _debtInToken,
        uint256 _entryRateTokens,
        uint256 _entryRateEquivalent
    ) public view returns (uint256) {
        if (_debtInToken == 0) return 0;

        Entry storage entry = entries[_entryId];

        uint256 collateralInTokens = collateralToTokens(
            entry.token,
            entry.amount,
            _entryRateTokens,
            _entryRateEquivalent
        );

        return collateralInTokens.multdiv(BASE, _debtInToken);
    }

    /**
        @return The _amount valuate in loanManager Token
    */
    function collateralToTokens(
        IERC20 _entryToken,
        uint256 _amount,
        uint256 _entryRateTokens,
        uint256 _entryRateEquivalent
    ) public view returns (uint256) {
        if (_entryToken == loanManagerToken) {
            return _amount;
        } else {
            return _amount.multdiv(_entryRateTokens, _entryRateEquivalent);
        }
    }

    /**
        @param _entryId The index of entry, inside of entries array

        @return The _amount of the debt valuate in loanManager Token
    */
    function debtInTokens(
        uint256 _entryId,
        uint256 _debtRateTokens,
        uint256 _debtRateEquivalent
    ) public view returns (uint256) {
        uint256 debt = loanManager.getClosingObligation(entries[_entryId].debtId);

        if (_debtRateTokens == 0 && _debtRateEquivalent == 0) {
            return debt;
        } else {
            debt = debt.multdiv(_debtRateTokens, _debtRateEquivalent);
            if (debt == 0) {
                return 1;
            } else {
                return debt;
            }
        }
    }
}
