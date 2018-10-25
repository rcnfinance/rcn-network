pragma solidity ^0.4.24;

import "./LoanManager.sol";
import "./model/NanoLoanModel.sol";
import "./../utils/Ownable.sol";
import "./interfaces/Model.sol";
import "./DebtEngine.sol";

contract LegacyEngine is LoanManager {

    uint256 private constant C_CUOTA = 0;
    uint256 private constant C_INTEREST_RATE = 1;
    uint256 private constant C_INSTALLMENTS = 2;
    uint256 private constant C_INSTALLMENT_DURATION = 3;

    Model private model;
    uint256 public nonce;

    mapping(bytes32 => uint256) public nonces;

    constructor (
        DebtEngine _engine,
        NanoLoanModel _model
    ) LoanManager(_engine) public {
        require(_model.engine() == address(_engine), "Model engine is not the same");
        model = _model;
    }

    function createLoan(
        Oracle _oracle,
        address _borrower,
        bytes32 _currency,
        uint256 _amount,
        uint256 _interestRate,
        uint256 _interestRatePunitory,
        uint256 _duesIn,
        uint256 _cancelableAt,
        uint256 _expirationRequest,
        string _metadata
    ) public returns (uint256) {
        uint128 amount = uint128(_amount);
        uint64 cancelableAt = uint64(_cancelableAt);
        uint64 duesIn = uint64(_duesIn);
        bytes memory loanData = abi.encodePacked(
            amount,
            _interestRate,
            _interestRatePunitory,
            duesIn,
            cancelableAt
        );
        return _createLoan(
            _oracle,
            _borrower,
            bytes8(_currency),
            amount,
            _interestRate,
            _interestRatePunitory,
            duesIn,
            cancelableAt,
            uint64(_expirationRequest),
            loanData
        );
    }

    function _createLoan(
        Oracle _oracle,
        address _borrower,
        bytes32 _currency,
        uint128 _amount,
        uint256 _interestRate,
        uint256 _interestRatePunitory,
        uint64 _duesIn,
        uint256 _cancelableAt,
        uint64 _expirationRequest,
        bytes loanData
    ) internal returns (uint256) {
        bytes32 futureDebt = super._requestLoan(
            bytes8(_currency),
            _amount,
            model,
            _oracle,
            _borrower,
            nonce,
            _expirationRequest,
            loanData
        );
        nonce++;
        nonces[futureDebt] = nonce;
        return uint256(futureDebt);
    }

    function getStatus(uint256 futureDebt) public view returns (uint256) {
        return super.getStatus(futureDebt);
    }

    function getIdentifier(uint256 nonce) public view returns (bytes32) {
        uint256 internalNonce = uint256(keccak256(abi.encodePacked(msg.sender, nonces[bytes32(nonce)])));
        return debtEngine.buildId(
            address(this),
            internalNonce,
            true
        );
    }

    function ownerOf(uint256 futureDebt) public view returns (address) {
        address owner = super.getCreator(futureDebt);
    }

    function getOracle(uint256 futureDebt) public view returns (address){
        return super.getOracle(futureDebt);
    }

    function rcn() public view returns (Token) {
        return debtEngine.token();
    }

    function registerApprove(
        bytes32 futureDebt,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (bool) {
        return super.approveRequest(futureDebt);
    }

    function pay(
        uint _futureDebt,
        uint256 _amount,
        address _from,
        bytes _oracleData
    ) public returns (bool) {
        bytes32 id = keccak256(abi.encodePacked(msg.sender, nonces[bytes32(_futureDebt)], true));
        debtEngine.pay(
            id,
            _amount,
            _from,
            _oracleData
        );
        return true;
    }

    function lend(
        uint index,
        bytes oracleData,
        Cosigner cosigner,
        bytes cosignerData
    ) public returns (bool) {
        return lend(
            getIdentifier(index),
            oracleData,
            Cosigner(cosigner),
            nonce,
            cosignerData
        );
    }

    function convertRate(
        Oracle oracle,
        bytes32 currency,
        bytes data,
        uint256 amount
    ) public view returns (uint256) {
        return super.currencyToToken(
            address(oracle),
            bytes16(currency),
            amount,
            data
        );
    }

}
