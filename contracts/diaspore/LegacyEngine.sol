pragma solidity ^0.4.24;

import "./LoanCreator.sol";
import './../interfaces/Oracle.sol';
import './../utils/Ownable.sol';
import "./interfaces/Model.sol";
import "./DebtEngine.sol";

contract LegacyEngine is LoanCreator {

    uint256 private constant C_CUOTA = 0;
    uint256 private constant C_INTEREST_RATE = 1;
    uint256 private constant C_INSTALLMENTS = 2;
    uint256 private constant C_INSTALLMENT_DURATION = 3;

    Model private model;
    uint256 public nonce;

    mapping(bytes32 => uint256) public nonces;

    constructor (
        Model _model
    ) LoanCreator(DebtEngine(_model.engine())) public {
        require(_model != address(0), "Error loading diaspore model.");
        model = _model;
        nonce = 0;
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
        return _createLoan(
            bytes8(_currency),
            uint128(_amount),
            model,
            address(_oracle),
            _borrower,
            uint64(_expirationRequest),
            bytes32(_duesIn),
            bytes32(1),
            bytes32(_interestRate)
        );
    }

    function _createLoan(
        bytes8 _currency,
        uint128 _amount,
        Model _model,
        address _oracle,
        address _borrower,
        uint64 _expirationRequest,
        bytes32 _duesIn,
        bytes32 _installment,
        bytes32 _interestRate
     ) private returns (uint256) {
        bytes32[] storage loanData;
        loanData[C_CUOTA] = _duesIn;
        loanData[C_INSTALLMENTS] = _installment;
        loanData[C_INTEREST_RATE] = _interestRate;
        loanData[C_INSTALLMENT_DURATION] = bytes32(_expirationRequest);

        bytes32 futureDebt = super.requestLoan(
            _currency,
            _amount,
            _model,
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

    function getIdentifier(uint256 futureDebt) public view returns (bytes32) {
        uint256 internalNonce = uint256(keccak256(abi.encodePacked(msg.sender, nonces[bytes32(futureDebt)])));
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
