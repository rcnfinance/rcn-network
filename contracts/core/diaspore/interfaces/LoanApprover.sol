pragma solidity ^0.5.10;

import "../../../interfaces/IERC165.sol";


/**
    A contract implementing LoanApprover is able to approve loan requests using callbacks,
    to approve a loan the contract should respond the callbacks the result of
    one designated value XOR keccak256("approve-loan-request")

    keccak256("approve-loan-request"): 0xdfcb15a077f54a681c23131eacdfd6e12b5e099685b492d382c3fd8bfc1e9a2a

    To receive calls on the callbacks, the contract should also implement the following ERC165 interfaces:

    approveRequest: 0x76ba6009
    settleApproveRequest: 0xcd40239e
    LoanApprover: 0xbbfa4397
*/
contract LoanApprover is IERC165 {
    /**
        Request the approve of a loan created using requestLoan, if the borrower is this contract,
        to approve the request the contract should return:

        _futureDebt XOR 0xdfcb15a077f54a681c23131eacdfd6e12b5e099685b492d382c3fd8bfc1e9a2a

        @param _futureDebt ID of the loan to approve

        @return _futureDebt XOR keccak256("approve-loan-request"), if the approve is accepted
    */
    function approveRequest(bytes32 _futureDebt) external returns (bytes32);

    /**
        Request the approve of a loan being settled, the contract can be called as borrower or creator.
        To approve the request the contract should return:

        _id XOR 0xdfcb15a077f54a681c23131eacdfd6e12b5e099685b492d382c3fd8bfc1e9a2a

        @param _requestData All the parameters of the loan request
        @param _loanData Data to feed to the Model
        @param _isBorrower True if this contract is the borrower, False if the contract is the creator
        @param _id loanManager.requestSignature(_requestDatam _loanData)

        @return _id XOR keccak256("approve-loan-request"), if the approve is accepted
    */
    function settleApproveRequest(
        bytes calldata _requestData,
        bytes calldata _loanData,
        bool _isBorrower,
        uint256 _id
    )
        external returns (bytes32);
}
