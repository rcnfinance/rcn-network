pragma solidity ^0.4.15;

import './../utils/BytesUtils.sol';
import './../utils/RpSafeMath.sol';
import './../interfaces/Oracle.sol';
import './../interfaces/Token.sol';
import './../interfaces/Engine.sol';
import './../interfaces/Cosigner.sol';
import './../utils/Ownable.sol';
import './../utils/SimpleDelegable.sol';

contract ReferenceCosigner is RpSafeMath, SimpleDelegable, Cosigner, BytesUtils {
    Token public rcn = Token(0x2f45b6Fb2F28A73f110400386da31044b2e953D4);
    
    uint private constant INDEX_COST = 0;
    uint private constant INDEX_COVERAGE = 1;
    uint private constant INDEX_REQUIRED_ARREARS = 2;
    uint private constant INDEX_EXPIRATION = 3;
    uint private constant INDEX_V = 4;
    uint private constant INDEX_R = 5;
    uint private constant INDEX_S = 6;

    mapping(address => mapping(uint256 => Liability)) public liabilities;
    string private infoUrl;

    function url() constant public returns (string) {
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

    function getCost(address engine, uint256 index, bytes data) constant public returns (uint256) {
        return uint256(readBytes32(data, INDEX_COST));
    }

    function cosign(address engine, uint256 index, bytes data) public returns (bool) {
        require(msg.sender == engine);
        require(expiration < block.timestamp);

        uint256 cost = uint256(readBytes32(data, INDEX_COST));
        uint256 coverage = uint256(readBytes32(data, INDEX_COVERAGE));
        uint256 requiredArrears = uint256(readBytes32(data, INDEX_REQUIRED_ARREARS));
        uint256 expiration = uint256(readBytes32(data, INDEX_EXPIRATION));

        bytes32 hash = keccak256(this, cost, engine, index, coverage, requiredArrears, expiration);
        address signer = ecrecover(keccak256("\x19Ethereum Signed Message:\n32",hash),uint8(readBytes32(data, INDEX_V)),
            readBytes32(data, INDEX_R),readBytes32(data, INDEX_S));
        require(isDelegate(signer));
        
        require(rcn.transferFrom(engine, this, cost));
        liabilities[engine][index] = Liability(coverage, requiredArrears, false);
        return true;
    }

    /**
        @dev Defines a custom logic that determines if a loan is defaulted or not.

        @param index Index of the loan

        @return true if the loan is considered defaulted
    */
    function isDefaulted(Engine engine, uint256 index) constant returns (bool) {
        Liability storage liability = liabilities[engine][index];
        return engine.getStatus(index) == Engine.Status.lent &&
            safeAdd(engine.getDueTime(index), liability.requiredArrears) <= block.timestamp;
    }


    function claim(Engine engine, uint256 index, bytes oracleData) public returns (bool) {
        Liability storage liability = liabilities[engine][index];

        require(!liability.claimed);
        require(msg.sender == engine.ownerOf(index));

        liability.claimed = true;

        require(isDefaulted(engine, index));
        
        uint256 premium = safeMult(engine.getPendingAmount(index), liability.coverage) / 100;
        require(engine.takeOwnership(index));

        Oracle oracle = engine.getOracle(index);
        uint256 rate = 1;

        if (oracle != address(0)) {
            rate = oracle.getRate(engine.getCurrency(index), oracleData);
        }

        require(rcn.transfer(msg.sender, safeMult(rate, premium)));
        return true;
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