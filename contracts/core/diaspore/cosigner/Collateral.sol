pragma solidity ^0.5.0;

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
        uint256 indexed _id,
        address indexed _manager,
        bytes32 indexed _debtId,
        address _token,
        uint256 _amount,
        address _converter,
        uint32 _liquidationRatio,
        uint32 _balanceRatio,
        uint32 _payDebtBurnFee,
        uint32 _payDebtRewardFee,
        uint32 _margincallBurnFee,
        uint32 _margincallRewardFee
    );

    event Deposited(uint256 indexed _id, uint256 _amount);
    event Withdrawed(uint256 indexed _id, address _to, uint256 _amount);

    event Started(uint256 indexed _id);

    event PayOffDebt(uint256 indexed _id, uint256 _closingObligationToken);
    event CancelDebt(uint256 indexed _id, uint256 _obligationInToken);
    event TakeDebtFee(uint256 _burned, uint256 _rewarded);
    event CollateralBalance(uint256 indexed _id, uint256 _tokenPayRequired);
    event TakeMargincallFee(uint256 _burned, uint256 _rewarded);

    event ConvertPay(uint256 _fromAmount, uint256 _toAmount, bytes _oracleData);
    event Rebuy(uint256 _fromAmount, uint256 _toAmount);

    event Redeemed(uint256 indexed _id);
    event EmergencyRedeemed(uint256 indexed _id, address _to);

    event SetUrl(string _url);

    Entry[] public entries;
    mapping(address => mapping(bytes32 => uint256)) public liabilities;

    string private iurl;

    struct Entry {
        LoanManager loanManager;
        TokenConverter converter;
        IERC20 token;
        bytes32 debtId;
        uint256 amount;
        uint32 liquidationRatio;
        uint32 balanceRatio;
        uint32 payDebtBurnFee;
        uint32 payDebtRewardFee;
        uint32 margincallBurnFee;
        uint32 margincallRewardFee;
    }

    constructor() public ERC721Base("RCN Collateral Cosigner", "RCC") { }

    function getEntriesLength() external view returns (uint256) { return entries.length; }

    function create(
        LoanManager _loanManager,
        bytes32 _debtId,
        IERC20 _token,
        uint256 _amount,
        TokenConverter _converter,
        uint32 _liquidationRatio,
        uint32 _balanceRatio,
        uint32 _payDebtBurnFee,
        uint32 _payDebtRewardFee,
        uint32 _margincallBurnFee,
        uint32 _margincallRewardFee
    ) external returns (uint256 id) {
        require(_liquidationRatio > BASE, "The liquidation ratio should be greater than BASE");
        require(_balanceRatio > _liquidationRatio, "The balance ratio should be greater than liquidation ratio");
        require(_payDebtBurnFee.add(_payDebtRewardFee) < BASE, "PayDebtFee should be less than BASE");
        require(_margincallBurnFee.add(_margincallRewardFee) < BASE, "MargincallFee should be less than BASE");

        require(_loanManager.getStatus(_debtId) == 0, "Debt request should be open");

        id = entries.push(
            Entry({
                loanManager: _loanManager,
                converter: _converter,
                token: _token,
                debtId: _debtId,
                amount: _amount,
                liquidationRatio: _liquidationRatio,
                balanceRatio: _balanceRatio,
                payDebtBurnFee: _payDebtBurnFee,
                payDebtRewardFee: _payDebtRewardFee,
                margincallBurnFee: _margincallBurnFee,
                margincallRewardFee: _margincallRewardFee
            })
        ) - 1;

        require(_token.safeTransferFrom(msg.sender, address(this), _amount), "Error pulling tokens");
        _generate(id, msg.sender);

        emit Created(
            id,
            address(_loanManager),
            _debtId,
            address(_token),
            _amount,
            address(_converter),
            _liquidationRatio,
            _balanceRatio,
            _payDebtBurnFee,
            _payDebtRewardFee,
            _margincallBurnFee,
            _margincallRewardFee
        );
    }

    function deposit(
        uint256 _id,
        uint256 _amount
    ) external {
        Entry storage entry = entries[_id];
        require(entry.token.safeTransferFrom(msg.sender, address(this), _amount), "Error pulling tokens");

        entry.amount = entry.amount.add(_amount);

        emit Deposited(_id, _amount);
    }

    function withdraw(
        uint256 _id,
        address _to,
        uint256 _amount,
        bytes calldata   _oracleData
    ) external {
        // Validate ownership of collateral
        require(_isAuthorized(msg.sender, _id), "Sender not authorized");

        Entry storage entry = entries[_id];

        // Read oracle
        (uint256 rateTokens, uint256 rateEquivalent) = entry.loanManager.readOracle(entry.debtId, _oracleData);

        require(_amount.toInt256() <= canWithdraw(_id, rateTokens, rateEquivalent), "Dont have collateral to withdraw");

        require(entry.token.safeTransfer(_to, _amount), "Error sending tokens");

        entry.amount = entry.amount.sub(_amount);

        emit Withdrawed(_id, _to, _amount);
    }

    function redeem(
        uint256 _id
    ) external {
        // Validate ownership of collateral
        require(_isAuthorized(msg.sender, _id), "Sender not authorized");

        // Validate if the collateral can be redemed
        Entry storage entry = entries[_id];
        uint256 status = entry.loanManager.getStatus(entry.debtId);

        require(status == 0 || status == 2, "Debt not request or paid");
        require(entry.token.safeTransfer(msg.sender, entry.amount), "Error sending tokens");

        // Destroy ERC721 collateral token
        delete liabilities[address(entry.loanManager)][entry.debtId];
        delete entries[_id]; // TODO: Find best way to delete

        emit Redeemed(_id);
    }

    function emergencyRedeem(
        uint256 _id,
        address _to
    ) external onlyOwner {
        // Validate if the collateral can be redemed
        Entry storage entry = entries[_id];
        uint256 status = entry.loanManager.getStatus(entry.debtId);

        require(status == 4, "Debt is not in error");
        require(entry.token.safeTransfer(_to, entry.amount), "Error sending tokens");

        // Destroy ERC721 collateral token
        delete liabilities[address(entry.loanManager)][entry.debtId];
        delete entries[_id]; // TODO: Find best way to delete

        emit EmergencyRedeemed(_id, _to);
    }

    function payOffDebt(
        uint256 _id,
        bytes calldata _oracleData
    ) external {
        require(_isAuthorized(msg.sender, _id), "The sender its not authorized");
        Entry storage entry = entries[_id];
        bytes32 debtId = entry.debtId;
        LoanManager loanManager = entry.loanManager;
        Model model = Model(loanManager.getModel(uint256(debtId)));

        uint256 closingObligation = model.getClosingObligation(debtId);
        uint256 closingObligationToken = loanManager.amountToToken(debtId, _oracleData, closingObligation);

        _convertPay(
            entry,
            closingObligationToken,
            0,
            _oracleData
        );

        emit PayOffDebt(_id, closingObligationToken);
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
        bytes memory
    ) public returns (bool) {
        // Load id and entry
        uint256 id = abi.decode(_data, (uint256));
        Entry storage entry = entries[id];

        // Validate call from loan manager
        LoanManager loanManager = entry.loanManager;
        require(entry.debtId == bytes32(_debtId), "Wrong debt id");
        require(address(loanManager) == msg.sender, "Not the debt manager");

        // Save liability ID
        liabilities[address(loanManager)][bytes32(_debtId)] = id;

        // Cosign
        require(loanManager.cosign(_debtId, 0), "Error performing cosign");

        emit Started(id);

        return true;
    }

    function claim(
        address _loanManager,
        uint256 _debtId,
        bytes memory _oracleData
    ) public returns (bool change) {
        bytes32 debtId = bytes32(_debtId);
        uint256 id = liabilities[_loanManager][debtId];
        LoanManager loanManager = LoanManager(_loanManager);

        // Load collateral entry
        Entry storage entry = entries[id];

        Model model = Model(loanManager.getModel(_debtId));
        uint256 dueTime = model.getDueTime(debtId);
        if (block.timestamp >= dueTime) {
            // Run payment of debt, use collateral to buy tokens
            (uint256 obligation,) = model.getObligation(debtId, uint64(dueTime));
            uint256 obligationToken = loanManager.amountToToken(debtId, _oracleData, obligation);

            _convertPay(
                entry,
                obligationToken,
                _takeDebtFee(entry, loanManager, obligationToken),
                _oracleData
            );

            emit CancelDebt(id, obligationToken);

            change = true;
        }

        uint256 tokenPayRequired = getTokenPayRequired(id, loanManager, debtId, _oracleData);

        if (tokenPayRequired > 0) {
            // Run margin call, buy required tokens
            // and substract from total collateral
            _convertPay(
                entry,
                tokenPayRequired,
                _takeMargincallFee(entry, loanManager, tokenPayRequired),
                _oracleData
            );

            emit CollateralBalance(id, tokenPayRequired);

            change = true;
        }
    }

    function getTokenPayRequired(
        uint256 _id,
        LoanManager _loanManager,
        bytes32 _debtId,
        bytes memory _oracleData
    ) internal returns(uint256) {
        // Read oracle
        (uint256 rateTokens, uint256 rateEquivalent) = _loanManager.readOracle(_debtId, _oracleData);
        // Pay tokens
        return tokensToPay(_id, rateTokens, rateEquivalent);
    }

    function _takeMargincallFee(
        Entry storage _entry,
        LoanManager _loanManager,
        uint256 _grossTokenPayRequired
    ) internal returns(uint256) {
        if ( _entry.margincallBurnFee != 0 || _entry.margincallRewardFee != 0 ) {
            IERC20 debtToken = _loanManager.token();

            uint256 burned = _takeFee(_entry, debtToken, _grossTokenPayRequired, _entry.margincallBurnFee, address(debtToken));
            uint256 rewarded = _takeFee(_entry, debtToken, _grossTokenPayRequired, _entry.margincallRewardFee, msg.sender);

            emit TakeMargincallFee(burned, rewarded);

            return burned + rewarded;
        }
    }

    function _takeDebtFee(
        Entry storage _entry,
        LoanManager _loanManager,
        uint256 _grossTokenObligation
    ) internal returns(uint256) {
        if ( _entry.payDebtBurnFee != 0 || _entry.payDebtRewardFee != 0 ) {
            IERC20 debtToken = _loanManager.token();

            uint256 burned = _takeFee(_entry, debtToken, _grossTokenObligation, _entry.payDebtBurnFee, address(debtToken));
            uint256 rewarded = _takeFee(_entry, debtToken, _grossTokenObligation, _entry.payDebtRewardFee, msg.sender);

            emit TakeDebtFee(burned, rewarded);

            return burned + rewarded;
        }
    }

    function _takeFee(
        Entry storage _entry,
        IERC20 _debtToken,
        uint256 _grossTokenObligation,
        uint256 _fee,
        address _to
    ) internal returns(uint256 takeFeeInColl) {
        if (_fee == 0) {
            return 0;
        }

        uint256 takeFee = _fee.mult(_grossTokenObligation) / BASE;
        takeFeeInColl = _entry.converter.getReturn(_debtToken, _entry.token, takeFee);

        require(_entry.token.safeTransfer(_to, takeFeeInColl), "Error sending tokens");
    }

    function _convertPay(
        Entry storage _entry,
        uint256 _tokenPayRequired,
        uint256 _feeAmount,
        bytes memory _oracleData
    ) internal {
        // Load debt token
        IERC20 token = _entry.loanManager.token();

        // Use collateral to buy tokens
        (uint256 bought, uint256 sold) = _entry.converter.safeConverterToMax(
            _entry.token,
            token,
            _entry.amount.sub(_feeAmount),
            _tokenPayRequired
        );

        uint256 tokensToPay = Math.min(bought, _tokenPayRequired);

        // Pay debt
        (, uint256 paidTokens) = _entry.loanManager.safePayToken(
            _entry.debtId,
            tokensToPay,
            address(this),
            _oracleData
        );

        emit ConvertPay(sold, bought, _oracleData);

        if (paidTokens < tokensToPay) {
            // Buy back extra collateral
            sold = tokensToPay - paidTokens;
            bought = _entry.converter.safeConvertFrom(
                token,
                _entry.token,
                sold,
                0
            );
            emit Rebuy(sold, bought);
        } else {
            bought = 0;
        }

        _entry.amount = _entry.amount.sub(sold.add(_feeAmount)).add(bought);
    }

    // Collateral methods

    function tokensToPay(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (uint256) {
        return valueCollateralToTokens(
            _id,
            collateralToPay(
                _id,
                _rateTokens,
                _rateEquivalent
            )
        );
    }

    function collateralToPay(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (uint256) {
        int256 cwithdraw = canWithdraw(_id, _rateTokens, _rateEquivalent);
        if (cwithdraw >= 0) {
            return 0;
        }

        Entry storage entry = entries[_id];
        uint256 debt = debtInTokens(_id, _rateTokens, _rateEquivalent);
        uint256 fee = uint256(entry.margincallBurnFee + entry.margincallRewardFee);
        return Math.min(
            // The collateral required to equilibrate the balance (the collateral should be more than the debt)
            _collateralRequiredToBalance(cwithdraw, entry.balanceRatio).mult(BASE + fee) / BASE,
            // Pay all collateral amount (the collateral should be less than the debt)
            entry.amount.mult(BASE - fee) / BASE,
            // Pay all debt amount (the collateral and the debt should be equal)
            valueTokensToCollateral(_id, debt).mult(BASE - fee) / BASE
        );
    }

    function _collateralRequiredToBalance(
        int256 _cwithdraw,
        uint256 _ratio
    ) internal pure returns(uint256) {
        return _cwithdraw.abs().toUint256().mult(BASE) / (_ratio - BASE);
    }

    function canWithdraw(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (int256) {
        int256 ratio = collateralRatio(_id, _rateTokens, _rateEquivalent).toInt256();
        int256 collateral = entries[_id].amount.toInt256();
        if (ratio == 0) {
            return collateral;
        }

        int256 delta = balanceDeltaRatio(_id, _rateTokens, _rateEquivalent);
        return collateral.muldiv(delta, ratio);
    }

    /**
        @param _id The index of entry, inside of entries array

        @return The collateral ratio minus the liquidation ratio
    */
    function liquidationDeltaRatio(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (int256) {
        return collateralRatio(_id, _rateTokens, _rateEquivalent).toInt256().sub(uint256(entries[_id].liquidationRatio).toInt256());
    }

    /**
        @param _id The index of entry, inside of entries array

        @return The collateral ratio minus the balance ratio
    */
    function balanceDeltaRatio(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (int256) {
        return collateralRatio(_id, _rateTokens, _rateEquivalent).toInt256().sub(uint256(entries[_id].balanceRatio).toInt256());
    }

    /**
        @param _id The index of entry, inside of entries array

        @return The ratio of the collateral vs the debt
    */
    function collateralRatio(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (uint256) {
        uint256 debt = debtInTokens(_id, _rateTokens, _rateEquivalent);
        if (debt == 0) {
            return 0;
        }

        return collateralInTokens(_id).multdiv(BASE, debt);
    }

    /**
        @param _id The index of entry, inside of entries array

        @return The _amount of the entry valuate in collateral Token
    */
    function collateralInTokens(
        uint256 _id
    ) public view returns (uint256) {
        return valueCollateralToTokens(_id, entries[_id].amount);
    }

    /**
        @param _id The index of entry, inside of entries array
        @param _amount The amount in collateral Token

        @return The _amount valuate in loanManager Token
    */
    function valueCollateralToTokens(
        uint256 _id,
        uint256 _amount
    ) public view returns (uint256) {
        if (_amount == 0) {
            return 0;
        }

        Entry storage entry = entries[_id];

        IERC20 loanToken = entry.loanManager.token();
        IERC20 collateralToken = entry.token;

        if (collateralToken == loanToken) {
            return _amount;
        } else {
            return entry.converter.getReturn(
                collateralToken,
                loanToken,
                _amount
            );
        }
    }

    /**
        @param _id The index of entry, inside of entries array
        @param _amount The amount in loanManager Token

        @return The _amount valuate in collateral Token
    */
    function valueTokensToCollateral(
        uint256 _id,
        uint256 _amount
    ) public view returns (uint256) {
        if (_amount == 0) {
            return 0;
        }

        Entry storage entry = entries[_id];

        IERC20 loanToken = entry.loanManager.token();
        IERC20 collateralToken = entry.token;

        if (collateralToken == loanToken) {
            return _amount;
        } else {
            return entry.converter.getReturn(
                loanToken,
                collateralToken,
                _amount
            );
        }
    }

    /**
        @param _id The index of entry, inside of entries array

        @return The _amount of the debt valuate in loanManager Token
    */
    function debtInTokens(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (uint256) {
        Entry storage entry = entries[_id];
        LoanManager manager = entry.loanManager;

        uint256 debt = manager.getClosingObligation(entry.debtId);

        if (_rateTokens == 0 && _rateEquivalent == 0) {
            return debt;
        } else {
            return debt.multdiv(_rateTokens, _rateEquivalent);
        }
    }
}
