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
        uint32 _liquidationRatio
    );

    event Deposited(uint256 indexed _id, uint256 _amount);
    event Withdrawed(uint256 indexed _id, address _to, uint256 _amount);

    event Started(uint256 indexed _id);

    event CancelDebt(uint256 indexed _id, uint256 _obligationInToken);
    event CollateralBalance(uint256 indexed _id, uint256 _tokenPayRequired);
    event ConvertPay(uint256 _fromAmount, uint256 _toAmount, bytes _oracleData);
    event Rebuy(uint256 _fromAmount, uint256 _toAmount);

    event Redeemed(uint256 indexed _id);
    event EmergencyRedeemed(uint256 indexed _id, address _to);

    event SetUrl(string _url);

    Entry[] public entries;
    mapping(address => mapping(bytes32 => uint256)) public liabilities;

    string private iurl;

    struct Entry {
        uint32 liquidationRatio;
        LoanManager loanManager;
        TokenConverter converter;
        IERC20 token;
        bytes32 debtId;
        uint256 amount;
    }

    constructor() public ERC721Base("RCN Collateral Cosigner", "RCC") { }

    function getEntriesLength() external view returns (uint256) { return entries.length; }

    function create(
        LoanManager _loanManager,
        bytes32 _debtId,
        IERC20 _token,
        uint256 _amount,
        TokenConverter _converter,
        uint32 _liquidationRatio
    ) external returns (uint256 id) {
        require(_liquidationRatio > BASE, "The liquidation ratio should be greater than BASE");
        require(_loanManager.getStatus(_debtId) == 0, "Debt request should be open");

        id = entries.push(
            Entry(
                _liquidationRatio,
                _loanManager,
                _converter,
                _token,
                _debtId,
                _amount
            )
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
            _liquidationRatio
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

        Model model = Model(loanManager.getModel(_debtId));
        uint256 dueTime = model.getDueTime(debtId);
        if (block.timestamp >= dueTime) {
            // Run payment of debt, use collateral to buy tokens
            (uint256 obligation,) = model.getObligation(debtId, uint64(dueTime));
            uint256 obligationToken = loanManager.amountToToken(debtId, _oracleData, obligation);

            _convertPay(
                id,
                loanManager,
                debtId,
                obligationToken,
                _oracleData
            );

            emit CancelDebt(id, obligationToken);

            change = true;
        }

        // Read oracle
        (uint256 rateTokens, uint256 rateEquivalent) = loanManager.readOracle(debtId, _oracleData);
        // Pay tokens
        uint256 tokenPayRequired = tokensToPay(id, rateTokens, rateEquivalent);

        if (tokenPayRequired > 0) {
            // Run margin call, buy required tokens
            // and substract from total collateral
            _convertPay(
                id,
                loanManager,
                debtId,
                tokenPayRequired,
                _oracleData
            );

            emit CollateralBalance(id, tokenPayRequired);

            change = true;
        }
    }

    function _convertPay(
        uint256 _id,
        LoanManager _loanManager,
        bytes32 _debtId,
        uint256 _tokenPayRequired,
        bytes memory _oracleData
    ) internal {
        // Load collateral entry
        Entry storage entry = entries[_id];

        // Load debt token
        IERC20 token = _loanManager.token();

        // Use collateral to buy tokens
        (uint256 bought, uint256 sold) = entry.converter.safeConverterToMax(
            entry.token,
            token,
            entry.amount,
            _tokenPayRequired
        );

        uint256 tokensToPay = Math.min(bought, _tokenPayRequired);

        entry.amount = entry.amount.sub(sold);

        // Pay debt
        (, uint256 paidTokens) = _loanManager.safePayToken(
            _debtId,
            tokensToPay,
            address(this),
            _oracleData
        );

        emit ConvertPay(sold, bought, _oracleData);

        if (paidTokens < tokensToPay) {
            // Buy back extra collateral
            sold = tokensToPay - paidTokens;
            bought = entry.converter.safeConvertFrom(
                token,
                entry.token,
                sold,
                0
            );
            entry.amount = entry.amount.add(bought);
            emit Rebuy(sold, bought);
        }
    }

    // Collateral methods

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

        @return The _amount of the entry valuate in collateral Token
    */
    function collateralInTokens(
        uint256 _id
    ) public view returns (uint256) {
        return valueCollateralToTokens(_id, entries[_id].amount);
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
            return _rateTokens.multdivceil(debt, _rateEquivalent);
        }
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

        return collateralInTokens(_id).mult(BASE).div(debt);
    }

    /**
        @param _id The index of entry, inside of entries array

        @return The collateral ratio minus the liquidation ratio
    */
    function deltaRatio(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (int256) {
        return collateralRatio(_id, _rateTokens, _rateEquivalent).toInt256().sub(uint256(entries[_id].liquidationRatio).toInt256());
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
        int256 delta = deltaRatio(_id, _rateTokens, _rateEquivalent);
        return collateral.muldivceil(delta, ratio);
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

        return Math.min(
            _collateralRequiredToBalance(cwithdraw, entry.liquidationRatio),
            entry.amount,
            valueTokensToCollateral(_id, debt)//todo venta
        );
    }

    function _collateralRequiredToBalance(
        int256 _cwithdraw,
        uint256 _ratio
    ) internal view returns(uint256) {
        return _cwithdraw.abs().toUint256().multdivceil(BASE, _ratio - BASE);
    }

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
}
