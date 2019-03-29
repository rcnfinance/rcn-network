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
            bytes32(_loanId),
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
        uint256 id = liabilities[_loanManager][bytes32(_loanId)];
        LoanManager loanManager = LoanManager(_loanManager);

        _runDuePayment(
            id,
            loanManager,
            bytes32(_loanId),
            _oracleData
        );

        _runMarginCall(
            id,
            loanManager,
            bytes32(_loanId),
            _oracleData
        );
    }

    function _runDuePayment(
        uint256 _id,
        LoanManager _loanManager,
        bytes32 _loanId,
        bytes memory _oracleData
    ) internal {
        Model model = _loanManager.getModel(_loanId);
        uint256 dueTime = model.getDueTime(_loanId);
        if (block.timestamp >= dueTime) {
            (uint256 obligation,) = model.getObligation(_loanId, uint64(dueTime));
            uint256 obligationToken = _loanManager.amountToToken(_loanId, _oracleData, obligation);

            // Load collateral entry
            Entry storage entry = entries[_id];

            // Load loan token
            IERC20 token = _loanManager.token();

            // Use collateral to buy tokens
            // TODO: Handle not enought collateral
            entry.amount = entry.amount.sub(
                entry.converter.safeConvertTo(
                    entry.token,
                    token,
                    entry.amount,
                    obligation
                )
            );

            // Pay loan
            (, uint256 paidTokens) = _loanManager.safePayToken(
                _loanId,
                obligationToken,
                address(this),
                _oracleData
            );

            if (paidTokens < obligationToken) {
                // Buy back extra collateral
                entry.amount = entry.amount.add(
                    entry.converter.safeConvertFrom(
                        token,
                        entry.token,
                        obligationToken - paidTokens,
                        0
                    )
                );
            }
        }
    }

    function _runMarginCall(
        uint256 _id,
        LoanManager _loanManager,
        bytes32 _loanId,
        bytes memory _oracleData
    ) internal {
        // Read oracle
        (uint256 rateTokens, uint256 rateEquivalent) = _loanManager.readOracle(bytes32(_loanId), _oracleData);

        // Pay tokens
        uint256 tokenPayRequired = tokensToPay(_id, rateTokens, rateEquivalent);

        if (tokenPayRequired > 0) {
            // Load collateral entry
            Entry storage entry = entries[_id];

            // Load loan token
            IERC20 token = _loanManager.token();

            // Buy required tokens
            // and substract from total collateral
            // TODO: Handle not enought collateral
            entry.amount = entry.amount.sub(
                entry.converter.safeConvertTo(
                    entry.token,
                    token,
                    entry.amount,
                    tokenPayRequired
                )
            );

            // Pay loan
            (, uint256 paidTokens) = _loanManager.safePayToken(
                bytes32(_loanId),
                tokenPayRequired,
                address(this),
                _oracleData
            );

            if (paidTokens < tokenPayRequired) {
                // Buy back extra collateral
                entry.amount = entry.amount.add(
                    entry.converter.safeConvertFrom(
                        token,
                        entry.token,
                        tokenPayRequired - paidTokens,
                        0
                    )
                );
            }
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
            cwithdraw.abs().toUint256().mult(2),
            Math.min(
                entry.amount,
                valueTokensToCollateral(
                    _id,
                    debt
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
