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
        bytes32 indexed _loanId,
        address _token,
        uint256 _amount,
        address _converter,
        uint32 _liquidationRatio
    );

    event Started(uint256 indexed _id);
    event Redeemed(uint256 indexed _id);

    Entry[] public entries;
    mapping(address => mapping(bytes32 => uint256)) public liabilities;

    string private iurl;

    struct Entry {
        uint32 liquidationRatio;
        LoanManager loanManager;
        TokenConverter converter;
        IERC20 token;
        bytes32 loanId;
        uint256 amount;
    }

    constructor() public ERC721Base("RCN Collateral Cosigner", "RCC") { }

    function getEntriesLength() external view returns (uint256) { return entries.length; }

    function create(
        LoanManager _loanManager,
        bytes32 _loanId,
        IERC20 _token,
        uint256 _amount,
        TokenConverter _converter,
        uint32 _liquidationRatio
    ) external returns (uint256 id) {
        require(_loanManager.getStatus(_loanId) == 0, "Loan request should be open");

        id = entries.push(
            Entry(
                _liquidationRatio,
                _loanManager,
                _converter,
                _token,
                _loanId,
                _amount
            )
        ) - 1;

        require(_token.safeTransferFrom(msg.sender, address(this), _amount), "Error pulling tokens");
        _generate(id, msg.sender);

        emit Created(
            id,
            address(_loanManager),
            _loanId,
            address(_token),
            _amount,
            address(_converter),
            _liquidationRatio
        );
    }

    function redeem(
        uint256 _id
    ) external {
        // Validate ownership of collateral
        require(_isAuthorized(msg.sender, _id), "Sender not authorized");

        // Validate if the collateral can be redemed
        Entry storage entry = entries[_id];
        uint256 status = entry.loanManager.getStatus(entry.loanId);

        // TODO Status ERROR
        require(status == 0 || status == 2, "Loan not request or paid");
        require(entry.token.safeTransfer(msg.sender, entry.amount), "Error sending tokens");

        // Destroy ERC721 collateral token
        delete entries[_id]; // TODO: Find best way to delete

        emit Redeemed(_id);
    }

    // ///
    // Cosigner methods
    // ///

    function setUrl(string calldata _url) external onlyOwner {
        iurl = _url;
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
        uint256 _loanId,
        bytes memory _data,
        bytes memory
    ) public returns (bool) {
        // Load id and entry
        uint256 id = abi.decode(_data, (uint256));
        Entry storage entry = entries[id];

        // Validate call from loan manager
        LoanManager loanManager = entry.loanManager;
        require(entry.loanId == bytes32(_loanId), "Wrong loan id");
        require(address(loanManager) == msg.sender, "Not the loan manager");

        // Save liability ID
        liabilities[address(loanManager)][bytes32(_loanId)] = id;

        // Cosign
        require(loanManager.cosign(_loanId, 0), "Error performing cosign");

        emit Started(id);
    }

    function claim(
        address _loanManager,
        uint256 _loanId,
        bytes memory _oracleData
    ) public returns (bool) {
        bytes32 loanId = bytes32(_loanId);
        uint256 id = liabilities[_loanManager][loanId];
        LoanManager loanManager = LoanManager(_loanManager);

        Model model = Model(loanManager.getModel(_loanId));
        uint256 dueTime = model.getDueTime(loanId);
        if (block.timestamp >= dueTime) {
            // Run payment of loan, use collateral to buy tokens
            (uint256 obligation,) = model.getObligation(loanId, uint64(dueTime));
            uint256 obligationToken = loanManager.amountToToken(loanId, _oracleData, obligation);
            _convertPay(
                id,
                loanManager,
                loanId,
                obligation,
                obligationToken,
                _oracleData
            );
        }

        // Read oracle
        (uint256 rateTokens, uint256 rateEquivalent) = loanManager.readOracle(loanId, _oracleData);
        // Pay tokens
        uint256 tokenPayRequired = tokensToPay(id, rateTokens, rateEquivalent);

        if (tokenPayRequired > 0) {
            // Run margin call, buy required tokens
            // and substract from total collateral
            _convertPay(
                id,
                loanManager,
                loanId,
                tokenPayRequired,
                tokenPayRequired,
                _oracleData
            );
        }
    }

    function _convertPay(
        uint256 _id,
        LoanManager _loanManager,
        bytes32 _loanId,
        uint256 _collateralReturn,
        uint256 _tokenReturn,
        bytes memory _oracleData
    ) internal {
        // Load collateral entry
        Entry storage entry = entries[_id];

        // Load loan token
        IERC20 token = _loanManager.token();

        // Use collateral to buy tokens
        (uint256 bought, uint256 sold) = entry.converter.safeConverterToMax(
            entry.token,
            token,
            entry.amount,
            _collateralReturn
        );

        uint256 tokensToPay = Math.min(bought, _tokenReturn);

        entry.amount = entry.amount.sub(sold);

        // Pay loan
        (, uint256 paidTokens) = _loanManager.safePayToken(
            _loanId,
            tokensToPay,
            address(this),
            _oracleData
        );

        if (paidTokens < tokensToPay) {
            // Buy back extra collateral
            entry.amount = entry.amount.add(
                entry.converter.safeConvertFrom(
                    token,
                    entry.token,
                    tokensToPay - paidTokens,
                    0
                )
            );
        }
    }

    // Collateral methods
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

    function callateralInTokens(
        uint256 _id
    ) public view returns (uint256) {
        return valueCollateralToTokens(_id, entries[_id].amount);
    }

    function debtInTokens(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (uint256) {
        Entry storage entry = entries[_id];
        LoanManager manager = entry.loanManager;

        uint256 debt = manager.getClosingObligation(entry.loanId);

        if (_rateTokens == 0 && _rateEquivalent == 0) {
            return debt;
        } else {
            return _rateTokens.mult(debt).div(_rateEquivalent);
        }
    }

    function collateralRatio(
        uint256 _id,
        uint256 _rateTokens,
        uint256 _rateEquivalent
    ) public view returns (uint256) {
        return callateralInTokens(_id).mult(BASE).div(debtInTokens(_id, _rateTokens, _rateEquivalent));
    }

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
        int256 delta = deltaRatio(_id, _rateTokens, _rateEquivalent);
        int256 ratio = collateralRatio(_id, _rateTokens, _rateEquivalent).toInt256();
        return entries[_id].amount.toInt256().muldiv(delta, ratio);
    }

    // 2 for callateralInTokens, 3 for collateralRatio, 3 for deltaRatio
    uint256 private constant ROUND_OFF_ERROR = 8;

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
            cwithdraw < 0 ? cwithdraw.abs().toUint256().add(ROUND_OFF_ERROR).mult(BASE).div(entry.liquidationRatio-BASE) : 0,
            Math.min(
                entry.amount,
                debt.mult(10**18).div(
                    entry.converter.getReturn(
                        entry.loanManager.token(),
                        entry.token,
                        10 ** 18
                    )
                )
            )
        );
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
