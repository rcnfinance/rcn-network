pragma solidity ^0.4.15;

import './../utils/RpSafeMath.sol';
import './../utils/Delegable.sol';
import './../utils/Ownable.sol';
import './../utils/TokenLockable.sol';

contract BasicScoreProvider is Ownable, Delegable, TokenLockable {
    event ScoreRequested(address _requester, uint256 _index);
    event ScoreDelivered(uint256 _index, uint256 _score);
    event CanceledRequest(uint256 _index);
    event RateChanged(uint256 _newRate);

    Token public rcn;
    uint256 public rate;

    Request[] public requests;

    enum Status { Initial, Pending, Canceled, Delivered }

    struct Request {
        address target;
        address requester;
        Status status;
        uint256 deposit;
        uint256 score;
        uint256 timestamp;
    }

    function BasicScoreProvider(Token _token) {
        rcn = _token;
    }

    /**
        @dev Sets the cost of requesting a score on-chain.

        @param _rate The new cost per request.
    */
    function setRate(uint256 _rate) public onlyOwner returns (bool) {
        rate = _rate;
        RateChanged(_rate);
        return true;
    }

    /**
        @dev Validates an off-chain score, it must be signed by a valid provider at the timestamp variable. 

        @param target Address being scored.
        @param score Score asigned by the provider
        @param timestamp Timestamp of the scoring
        @param v r s Signature provided
    */
    function validateScore(address target, uint256 score, uint256 timestamp, uint8 v, bytes32 r, bytes32 s) constant returns (bool) {
        bytes32 hash = keccak256(this, target, score, timestamp);
        address signer = ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash),v,r,s);
        return wasDelegate(signer, timestamp);
    }

    /**
        @dev Requests an on-chain scoring, the msg.sender must approve a transfer of tokens enough to pay the 
        cost defined on the contract.

        @param target Address to score
        @return The index of the request
    */
    function requestScore(address target) public returns (uint256 index) {
        require(rcn.transferFrom(msg.sender, this, rate));
        lockTokens(rcn, rate);
        index = requests.push(Request(target, msg.sender, Status.Pending, rate, 0, 0)) - 1;
        ScoreRequested(msg.sender, index);
    }

    /**
        @dev Cancels a scoring request, if the score wasn't delivered the deposited amount is returned to the msg.sender.

        @param index Index of the request to cancel
    */
    function cancelRequest(uint256 index) public returns (bool) {
        var request = requests[index];
        require(msg.sender == request.requester);
        require(request.status == Status.Pending);
        request.status = Status.Canceled;
        unlockTokens(rcn, request.deposit);
        require(rcn.transfer(msg.sender, request.deposit));
        CanceledRequest(index);
        return true;
    }

    /**
        @dev Fills a pending scoring request, called by a current valid provider.

        @param index Index of the request to fill
        @param score Score designated by the provider
    */
    function deliverScore(uint256 index, uint256 score) public onlyDelegate returns (bool) {
        var request = requests[index];
        require(request.status == Status.Pending);
        require(score > 0 && score <= 1000);
        request.status = Status.Delivered;
        request.score = score;
        request.timestamp = block.timestamp;
        unlockTokens(rcn, request.deposit);
        ScoreDelivered(index, score);
        return true;
    }
}