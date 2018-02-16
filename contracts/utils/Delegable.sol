pragma solidity ^0.4.15;

import "./Ownable.sol";

contract Delegable is Ownable {
    mapping(address => DelegateLog) public delegates;

    struct DelegateLog {
        uint256 started;
        uint256 ended;
    }

    /**
        @dev Only allows current delegates.
    */
    modifier onlyDelegate() {
        DelegateLog memory delegateLog = delegates[msg.sender];
        require(delegateLog.started != 0 && delegateLog.ended == 0);
        _;
    }
    
    /**
        @dev Checks if a delegate existed at the timestamp.

        @param _address Address of the delegate
        @param timestamp Moment to check

        @return true if at the timestamp the delegate existed
    */
    function wasDelegate(address _address, uint256 timestamp) public constant returns (bool) {
        DelegateLog memory delegateLog = delegates[_address];
        return timestamp >= delegateLog.started && delegateLog.started != 0 && (delegateLog.ended == 0 || timestamp < delegateLog.ended);
    }

    /**
        @dev Checks if a delegate is active

        @param _address Address of the delegate
        
        @return true if the delegate is active
    */
    function isDelegate(address _address) public constant returns (bool) {
        DelegateLog memory delegateLog = delegates[_address];
        return delegateLog.started != 0 && delegateLog.ended == 0;
    }

    /**
        @dev Adds a new worker.

        @param _address Address of the worker
    */
    function addDelegate(address _address) public onlyOwner returns (bool) {
        DelegateLog storage delegateLog = delegates[_address];
        require(delegateLog.started == 0);
        delegateLog.started = block.timestamp;
        return true;
    }

    /**
        @dev Removes an existing worker, removed workers can't be added back.

        @param _address Address of the worker to remove
    */
    function removeDelegate(address _address) public onlyOwner returns (bool) {
        DelegateLog storage delegateLog = delegates[_address];
        require(delegateLog.started != 0 && delegateLog.ended == 0);
        delegateLog.ended = block.timestamp;
        return true;
    }
}