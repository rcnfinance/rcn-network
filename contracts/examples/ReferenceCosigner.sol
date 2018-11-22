pragma solidity ^0.4.19;

import "./../interfaces/Token.sol";
import "./../diaspore/interfaces/Cosigner.sol";
import "./../diaspore/interfaces/RateOracle.sol";
import "./../diaspore/interfaces/Model.sol";

import "./../utils/BytesUtils.sol";
import "./../utils/SafeMath.sol";
import "./../utils/SimpleDelegable.sol";


contract ILoanManager {
    function debtEngine() external view returns (address);
    function getStatus(uint256 _id) external view returns (uint256);
    function getDueTime(uint256 _id) external view returns (uint256);
    function ownerOf(uint256 _id) external view returns (address);
    function getOracle(uint256 _id) external view returns (address);
    function getClosingObligation(uint256 _id) external view returns (uint256);

    function cosign(uint256 _id, uint256 _cost) external returns (bool);
    function safeTransferFrom(address _from, address _to, uint256 _assetId) external;
}


contract IDebtEngine {
    function withdraw(bytes32 _id, address _to) external returns (uint256 amount);
    function withdrawPartial(bytes32 _id, address _to, uint256 _amount) external returns (bool success);
}


contract Helper is BytesUtils {
    uint256 public constant STATUS_PAID = 2;

    uint256 public constant L_COSIGNER_DATA =
        16 + // cost
        2  + // coverage
        8  + // required arrears
        8;   // expiration

    uint256 constant internal O_V = L_COSIGNER_DATA;
    uint256 constant internal L_V = 1;
    uint256 constant internal O_R = O_V + L_V;
    uint256 constant internal L_R = 32;
    uint256 constant internal O_S = O_R + L_R;
    uint256 constant internal L_S = 32;

    uint256 public constant L_DATA = L_COSIGNER_DATA + L_V + L_R + L_S;
    /**
        @notice Decode bytes array and returns the parameters of the insurance, including the cost.

        @dev The length of data should be L_DATA (the sum of the length of the insurance parameters in bytes)

        @param _data from-to bytes
            0  - 16 : amount
            16 - 18 : coverage
            18 - 26 : required arrears
            34 - 42 : expiration

        @return cost The cosigner cost
        @return coverage The percentage of the pending amount that will be transferred to the owner when claiming a liability
            This porcentage its not a real, will divide for 10000 instead of 100, in example: 1 its equal to 0.01%
        @return requiredArrears Delta time, the time required to the loan be in default
        @return expiration The timeStamp in which the signature will be valid
    */
    function _decodeCosignerData(
        bytes _data
    ) internal pure returns (uint128, uint16, uint64, uint64) {
        require(_data.length == L_DATA, "Invalid data length");
        (bytes32 cost, bytes32 coverage, bytes32 requiredArrears, bytes32 expiration) = decode(_data, 16, 2, 8, 8);

        return (uint128(cost), uint16(coverage), uint64(requiredArrears), uint64(expiration));
    }
}

contract Events {
    event ReadedOracle(
        address _oracle,
        uint256 _tokens,
        uint256 _equivalent
    );
}

contract ReferenceCosigner is SimpleDelegable, Cosigner, Helper, Events {
    using SafeMath for uint256;

    string private infoUrl;
    Token public rcn;

    struct Liability {
        uint16 coverage;
        uint64 requiredArrears;
    }
    // loanManager to loan index to liability
    mapping(address => mapping(uint256 => Liability)) public liabilities;

    constructor(Token _rcn) public {
        rcn = _rcn;
    }

    /**
        @dev Defines a custom logic that determines if a loan is defaulted or not.

        @param _index Index of the loan

        @return true if the loan is considered defaulted
    */
    function isDefaulted(
        ILoanManager _loanManager,
        uint256 _index
    ) external view returns (bool) {
        return _loanManager.getStatus(_index) != STATUS_PAID &&
            ((uint256(liabilities[_loanManager][_index].requiredArrears)).add(_loanManager.getDueTime(_index)) <= now);
    }

    function url() external view returns (string) {
        return infoUrl;
    }

    /**
        @dev Sets the url to retrieve the data for "requestCosign"

        @param _url New url
    */
    function setUrl(string _url) external onlyOwner returns (bool) {
        infoUrl = _url;
        emit SetUrl(_url);

        return true;
    }

    /**
        @dev Retrieves the cost of using this cosigner, the cost is in RCN wei. This method does not validate the
            signature of the data.

        @param _data Data with the params of the insurance, including the cost.

        @return the cost of the insurance in RCN wei.
    */
    function cost(
        address,
        uint256,
        bytes _data,
        bytes
    ) external view returns (uint256) {
        ( uint128 currentCost,,,, ) = _decodeCosignerData(_data);
        return currentCost;
    }

    /**
        @dev Cosigns a loan, the parameters of the insurance are in the data field, and should be signed by
            an active delegate.

        @param _index Index of the loan
        @param _data Data with the params of the insurance, this contains the signature that makes the params valid.

        @return true If the cosign was done
    */
    function requestCosign(
        address _loanManager,
        uint256 _index,
        bytes _data,
        bytes
    ) external returns (bool) {
        require(msg.sender == address(_loanManager), "The msg.sender should be the loanManager");
        require(liabilities[_loanManager][_index].coverage == 0, "The liability exist");

        (
            uint128 currentCost,
            uint16 coverage,
            uint64 requiredArrears,
            uint64 expiration,
        ) = _decodeCosignerData(_data);

        require(expiration >= now, "The data of requestCosign its expired");
        require(coverage != 0, "The coverage should not be 0");

        address signer = ecrecover(
            keccak256(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    address(this),
                    currentCost,
                    _loanManager,
                    _index,
                    coverage,
                    requiredArrears,
                    expiration
                )
            ),

            uint8(read(_data, O_V, L_V)),
            read(_data, O_R, L_R),
            read(_data, O_S, L_S)
        );

        require(isDelegate(signer), "The signer its not a delegate");

        liabilities[_loanManager][_index] = Liability({
            coverage: coverage,
            requiredArrears: requiredArrears
        });

        require(ILoanManager(_loanManager).cosign(_index, currentCost), "Fail loanManager cosign");

        emit Cosign(
            _loanManager,
            bytes32(_index),
            signer,
            _data,
            ""
        );

        return true;
    }

    /**
        @dev Transfers the ownership of the debt to the cosigner and the cosigner pays the benefit of the insurance
            to the current lender. The oracle is the same used by the loan.

        @param _index Index of the loan
        @param _oracleData Data required by the oracle

        @return true if the insurance was claimed successfully
    */
    function claim(
        address _loanManager,
        uint256 _index,
        bytes _oracleData
    ) external returns (bool) {
        Liability storage liability = liabilities[_loanManager][_index];
        ILoanManager loanManager = ILoanManager(_loanManager);

        require(liability.coverage != 0, "The liability not exists");
        require(msg.sender == loanManager.ownerOf(_index), "The msg.sender should be the owner of the loan");

        require(
            loanManager.getStatus(_index) != STATUS_PAID &&
                ((uint256(liability.requiredArrears)).add(loanManager.getDueTime(_index)) <= now),
            "The liability is not defaulted"
        );

        loanManager.safeTransferFrom(msg.sender, address(this), _index);

        uint256 claimAmount = _currencyToToken(
            loanManager.getOracle(_index),
            (uint256(liability.coverage)).mult(loanManager.getClosingObligation(_index)) / 10000,
            _oracleData
        );

        require(rcn.transfer(msg.sender, claimAmount), "Error paying the cosigner");

        emit Claim(
            _loanManager,
            bytes32(_index),
            msg.sender,
            claimAmount,
            _oracleData
        );

        delete liability.coverage;

        return true;
    }

    function _currencyToToken(
        address _oracle,
        uint256 _amount,
        bytes _oracleData
    ) internal returns (uint256) {
        if (_oracle == address(0)) return _amount;
        (uint256 tokens, uint256 equivalent) = RateOracle(_oracle).readSample(_oracleData);

        emit ReadedOracle(_oracle, tokens, equivalent);

        return tokens.mult(_amount) / equivalent;
    }

    /**
        @dev Withdraws all funds from a loan

        @param _index Index of the loan
        @param _to Destination of the withdrawed tokens

        @return the amount of withdraw
    */
    function withdrawFromLoan(
        ILoanManager _loanManager,
        bytes32 _index,
        address _to
    ) external onlyOwner returns (uint256) {
        require(_to != address(0), "Invalid _to address");

        return IDebtEngine(_loanManager.debtEngine()).withdraw(_index, _to);
    }

    /**
        @dev Withdraws partial funds from a loan

        @param _index Index of the loan
        @param _to Destination of the withdrawed tokens
        @param _amount Amount to withdraw

        @return true if the withdraw was done successfully
    */
    function withdrawPartialFromLoan(
        ILoanManager _loanManager,
        bytes32 _index,
        address _to,
        uint256 _amount
     ) external onlyOwner returns (bool) {
        require(_to != address(0), "Invalid _to address");

        return IDebtEngine(_loanManager.debtEngine()).withdrawPartial(_index, _to, _amount);
    }

    /**
        @dev Transfers a loan to a new owner

        @param _index Index of the loan
        @param _to New owner of the loan

        @return true if the loan was transfered
    */
    function transferLoan(
        ILoanManager _loanManager,
        uint256 _index,
        address _to
    ) external onlyOwner returns (bool) {
        require(_to != address(0), "Invalid _to address");
        require(liabilities[_loanManager][_index].coverage == 0, "The liability is not claimed");

        _loanManager.safeTransferFrom(address(this), _to, _index);

        return true;
    }

    /**
        @dev Withdraws tokens from the smart contract.

        @param _token Token contract address
        @param _to Destination address
        @param _amount Amount to send

        @return true if the withdrawal was done successfully
    */
    function withdrawal(
        Token _token,
        address _to,
        uint256 _amount
    ) external onlyOwner returns (bool) {
        require(_to != address(0), "Invalid _to address");
        require(_token.transfer(_to, _amount), "Error transfer tokens in withdrawal");

        return true;
    }
}
