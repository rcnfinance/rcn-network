pragma solidity ^0.4.15;

import './../utils/RpSafeMath.sol';

contract Token {
	function totalSupply() public constant returns (uint);
	function balanceOf(address tokenOwner) public constant returns (uint balance);
	function allowance(address tokenOwner, address spender) public constant returns (uint remaining);
	function transfer(address to, uint tokens) public returns (bool success);
	function approve(address spender, uint tokens) public returns (bool success);
	function transferFrom(address from, address to, uint tokens) public returns (bool success);

	event Transfer(address indexed from, address indexed to, uint tokens);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
}

contract BasicScoreProvider is RpSafeMath {
    event ScoreRequested(address _requester, uint256 _index);
    event ScoreDelivered(uint256 _index, uint256 _score);
    event AddedProvider(address _provider);
    event RemovedProvider(address _provider);
    event CanceledRequest(uint256 _index);
    event RateChanged(uint256 _newRate);

    Token public rcn;
    address public owner;
    
    uint256 public rate;
    uint256 public lockedTokens;

    Request[] public requests;
    mapping(address => Provider) public providers;

    enum Status { Initial, Pending, Canceled, Delivered }

    struct Provider {
        uint256 started;
        uint256 ended;
    }

    struct Request {
        address target;
        address requester;
        Status status;
        uint256 deposit;
        uint256 score;
        uint256 timestamp;
    }

    function BasicScoreProvider(Token _token) {
        owner = msg.sender;
        rcn = _token;
    }

    /**
        @dev Sets the cost of requesting a score on-chain.

        @param _rate The new cost per request.
    */
    function setRate(uint256 _rate) returns (bool) {
        require(msg.sender == owner);
        rate = _rate;
        RateChanged(_rate);
        return true;
    }

    /**
        @dev Adds a new provider, they can deliver both on-chain and off-chain scores.

        @param provider Address of the provider
    */
    function setProvider(address provider) returns (bool) {
        require(msg.sender == owner);
        require(providers[provider].started == 0);
        providers[provider] = Provider(block.timestamp, 0);
        AddedProvider(provider);
        return true;
    }

    /**
        @dev Removes an existing provider, the previous signed and delivered scores are still valid, a removed provider 
        cannot be added back.

        @param provider Address of the provider
    */
    function removeProvider(address provider) returns (bool) {
        require(msg.sender == owner);
        require(providers[provider].started != 0 && providers[provider].ended == 0);
        providers[provider].ended = block.timestamp;
        RemovedProvider(provider);
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
        return providers[signer].started != 0 && providers[signer].started <= timestamp && (providers[signer].ended == 0 || providers[signer].ended > timestamp);
    }

    /**
        @dev Requests an on-chain scoring, the msg.sender must approve a transfer of tokens enough to pay the 
        cost defined on the contract.

        @param target Address to score
        @return The index of the request
    */
    function requestScore(address target) returns (uint256 index) {
        require(rcn.transferFrom(msg.sender, this, rate));
        lockedTokens = safeAdd(lockedTokens, rate);
        index = requests.push(Request(target, msg.sender, Status.Pending, rate, 0, 0)) - 1;
        ScoreRequested(msg.sender, index);
    }

    /**
        @dev Cancels a scoring request, if the score wasn't delivered the deposited amount is returned to the msg.sender.

        @param index Index of the request to cancel
    */
    function cancelRequest(uint256 index) returns (bool) {
        var request = requests[index];
        require(msg.sender == request.requester);
        require(request.status == Status.Pending);
        request.status = Status.Canceled;
        lockedTokens = safeSubtract(lockedTokens, request.deposit);
        require(rcn.transfer(msg.sender, request.deposit));
        CanceledRequest(index);
        return true;
    }

    /**
        @dev Fills a pending scoring request, called by a current valid provider.

        @param index Index of the request to fill
        @param score Score designated by the provider
    */
    function deliverScore(uint256 index, uint256 score) returns (bool) {
        var request = requests[index];
        require(msg.sender == owner || (providers[msg.sender].started != 0 && providers[msg.sender].ended == 0));
        require(request.status == Status.Pending);
        require(score > 0 && score <= 1000);
        request.status = Status.Delivered;
        request.score = score;
        request.timestamp = block.timestamp;
        lockedTokens = safeSubtract(lockedTokens, request.deposit);
        ScoreDelivered(index, score);
        return true;
    }

    /**
        @dev Withdraws tokens from the contract.

        @param token Token to withdraw
        @param to Destination of the tokens
        @param amount Amount to withdraw 
    */
    function withdrawTokens(Token token, address to, uint256 amount) returns (bool) {
        require(msg.sender == owner);
        require(token != rcn || safeSubtract(rcn.balanceOf(this), lockedTokens) >= amount);
        return token.transfer(to, amount);
    }
}