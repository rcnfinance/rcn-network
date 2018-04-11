pragma solidity ^0.4.19;

import './../utils/BytesUtils.sol';
import './../utils/RpSafeMath.sol';
import './../interfaces/Oracle.sol';
import './../interfaces/Token.sol';
import './../interfaces/Engine.sol';
import './../interfaces/Cosigner.sol';
import './../utils/Ownable.sol';
import './../utils/SimpleDelegable.sol';

contract ReferenceCosigner is RpSafeMath, SimpleDelegable, Cosigner, BytesUtils {
    Token public rcn;
    
    uint256 constant internal RCN_DECIMALS = 18;
    uint256 constant internal PRECISION = 10**RCN_DECIMALS;
    
    uint private constant INDEX_COST = 0;
    uint private constant INDEX_COVERAGE = 1;
    uint private constant INDEX_REQUIRED_ARREARS = 2;
    uint private constant INDEX_EXPIRATION = 3;
    uint private constant INDEX_V = 4;
    uint private constant INDEX_R = 5;
    uint private constant INDEX_S = 6;

    mapping(address => mapping(uint256 => Liability)) public liabilities;
    string private infoUrl;

    function ReferenceCosigner(Token token) public {
        rcn = token;
    }

    function url() public view returns (string) {
        return infoUrl;
    }

    function setUrl(string _url) public onlyOwner returns (bool) {
        infoUrl = _url;
        return true;
    }

    struct Liability {
        uint256 coverage;
        uint256 requiredArrears;
        bool claimed;
    }

    /**
        @dev Retrieves the cost of using this cosigner, the cost is in RCN wei. This method does not validate the
        signature of the data.

        @param engine Address of the engine
        @param index Index of the loan
        @param data Data with the params of the insurance, including the cost.

        @return the cost of the insurance in RCN wei.
    */
    function cost(address engine, uint256 index, bytes data, bytes) public view returns (uint256) {
        return uint256(readBytes32(data, INDEX_COST));
    }

    /**
        @dev Cosigns a loan, the parameters of the insurance are in the data field, and should be signed by
        an active delegate.

        @param engine Address of the engine
        @param index Index of the loan
        @param data Data with the params of the insurance, this contains the signature that makes the params valid.

        @return true If the cosign was done
    */
    function requestCosign(Engine engine, uint256 index, bytes data, bytes) public returns (bool) {
        require(msg.sender == address(engine));
        require(expiration < block.timestamp);
        require(liabilities[engine][index].coverage == 0);

        uint256 currentCost = uint256(readBytes32(data, INDEX_COST));
        uint256 coverage = uint256(readBytes32(data, INDEX_COVERAGE));
        uint256 requiredArrears = uint256(readBytes32(data, INDEX_REQUIRED_ARREARS));
        uint256 expiration = uint256(readBytes32(data, INDEX_EXPIRATION));

        require(coverage != 0);

        bytes32 hash = keccak256(this, currentCost, engine, index, coverage, requiredArrears, expiration);
        address signer = ecrecover(keccak256("\x19Ethereum Signed Message:\n32",hash),uint8(readBytes32(data, INDEX_V)),
            readBytes32(data, INDEX_R),readBytes32(data, INDEX_S));
        require(isDelegate(signer));
        
        liabilities[engine][index] = Liability(coverage, requiredArrears, false);
        require(engine.cosign(index, currentCost));

        return true;
    }

    /**
        @dev Defines a custom logic that determines if a loan is defaulted or not.

        @param index Index of the loan

        @return true if the loan is considered defaulted
    */
    function isDefaulted(Engine engine, uint256 index) public view returns (bool) {
        Liability storage liability = liabilities[engine][index];
        return engine.getStatus(index) == Engine.Status.lent &&
            safeAdd(engine.getDueTime(index), liability.requiredArrears) <= block.timestamp;
    }

    /**
        @dev Transfers the ownership of the debt to the cosigner and the cosigner pays the benefit of the insurance
        to the current lender. The oracle is the same used by the loan.

        @param engineAddress Address of the engine
        @param index Index of the loan
        @param oracleData Data required by the oracle

        @return true if the insurance was claimed successfully
    */
    function claim(address engineAddress, uint256 index, bytes oracleData) public returns (bool) {
        Liability storage liability = liabilities[engine][index];
        Engine engine = Engine(engineAddress);

        require(!liability.claimed);
        require(msg.sender == engine.ownerOf(index));

        liability.claimed = true;

        require(isDefaulted(engine, index));
        
        uint256 premium = safeMult(engine.getPendingAmount(index), liability.coverage) / 100;
        require(engine.takeOwnership(index));

        Oracle oracle = engine.getOracle(index);
        require(rcn.transfer(msg.sender, convertRate(oracle, engine.getCurrency(index), oracleData, premium)));
        return true;
    }

    /**
        @notice Converts an amount to RCN using the loan oracle.
        
        @dev If the loan has no oracle the currency must be RCN so the rate is 1

        @return The result of the convertion
    */
    function convertRate(Oracle oracle, bytes32 currency, bytes data, uint256 amount) public returns (uint256) {
        if (oracle == address(0)) {
            return amount;
        } else {
            uint256 rate;
            uint256 decimals;
            
            (rate, decimals) = oracle.getRate(currency, data);

            require(decimals <= RCN_DECIMALS);
            return (safeMult(safeMult(amount, rate), (10**(RCN_DECIMALS-decimals)))) / PRECISION;
        }
    }

    /**
        @dev Withdraws funds from a loan

        @param index Index of the loan
        @param to Destination of the withdrawed tokens
        @param amount Amount to withdraw

        @return true if the withdraw was done successfully
    */
    function withdrawalFromLoan(Engine engine, uint256 index, address to, uint256 amount) public onlyOwner returns (bool) {
        require(to != address(0));
        return engine.withdrawal(index, to, amount);
    }

    /**
        @dev Transfers a loan to a new owner

        @param index Index of the loan

        @param index Index of the loan
        @param to New owner of the loan

        @return true if the loan was transfered
    */
    function transferLoan(Engine engine, uint256 index, address to) public onlyOwner returns (bool) {
        require(to != address(0));
        require(liabilities[engine][index].claimed || liabilities[engine][index].coverage == 0);
        return engine.transfer(to, index);
    }


    /**
        @dev Withdraws tokens from the smart contract.

        @param _token Token contract address
        @param to Destination address
        @param amount Amount to send

        @return true if the withdrawal was done successfully
    */
    function withdrawal(Token _token, address to, uint256 amount) public onlyOwner returns (bool) {
        require(to != address(0));
        require(_token.transfer(to, amount));
        return true;
    }

}