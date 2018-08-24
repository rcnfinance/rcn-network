pragma solidity ^0.4.24;

import './../utils/Delegable.sol';
import './../interfaces/Token.sol';
import './../utils/TokenLockable.sol';
import './../utils/BytesUtils.sol';
import './../interfaces/Oracle.sol';

contract ReferenceOracle is Oracle, Delegable, BytesUtils {
    event DelegatedCall(address requester, address to);
    event CacheHit(address requester, bytes32 currency, uint256 requestTimestamp, uint256 deliverTimestamp, uint256 rate, uint256 decimals);
    event DeliveredRate(address requester, bytes32 currency, address signer, uint256 requestTimestamp, uint256 rate, uint256 decimals);

    uint256 public expiration = 15 minutes;

    uint constant private INDEX_TIMESTAMP = 0;
    uint constant private INDEX_RATE = 1;
    uint constant private INDEX_DECIMALS = 2;
    uint constant private INDEX_V = 3;
    uint constant private INDEX_R = 4;
    uint constant private INDEX_S = 5;

    string private infoUrl;

    Oracle public fallback;
    mapping(bytes32 => RateCache) public cache;

    struct RateCache {
        uint256 timestamp;
        uint256 rate;
        uint256 decimals;
    }

    function url() public view returns (string) {
        return infoUrl;
    }

    /**
        @dev Sets the time window of the validity of the rates signed.

        @param time Duration of the window

        @return true is the time was set correctly
    */
    function setExpirationTime(uint256 time) public onlyOwner returns (bool) {
        expiration = time;
        return true;
    }

    /**
        @dev Sets the url to retrieve the data for 'getRate'

        @param _url New url
    */
    function setUrl(string _url) public onlyOwner returns (bool) {
        infoUrl = _url;
        return true;
    }

    /**
        @dev Sets another oracle as the replacement to this oracle
        All 'getRate' calls will be forwarded to this new oracle

        @param _fallback New oracle
    */
    function setFallback(Oracle _fallback) public onlyOwner returns (bool) {
        fallback = _fallback;
        return true;
    }

    /**
        @dev Invalidates the cache of a given currency

        @param currency Currency to invalidate the cache
    */
    function invalidateCache(bytes32 currency) public onlyOwner returns (bool) {
        delete cache[currency].timestamp;
        return true;
    }

    function isExpired(uint256 timestamp) internal view returns (bool) {
        return timestamp <= now - expiration;
    }

    /**
        @dev Retrieves the convertion rate of a given currency, the information of the rate is carried over the 
        data field. If there is a newer rate on the cache, that rate is delivered and the data field is ignored.

        If the data contains a more recent rate than the cache, the cache is updated.

        @param currency Hash of the currency
        @param data Data with the rate signed by a delegate

        @return the rate and decimals of the currency convertion
    */
    function getRate(bytes32 currency, bytes data) public returns (uint256, uint256) {
        if (fallback != address(0)) {
            emit DelegatedCall(msg.sender, fallback);
            return fallback.getRate(currency, data);
        }

        uint256 timestamp = uint256(readBytes32(data, INDEX_TIMESTAMP));
        RateCache memory rateCache = cache[currency];
        if (rateCache.timestamp >= timestamp && !isExpired(rateCache.timestamp)) {
            emit CacheHit(msg.sender, currency, timestamp, rateCache.timestamp, rateCache.rate, rateCache.decimals);
            return (rateCache.rate, rateCache.decimals);
        } else {
            require(!isExpired(timestamp), "The rate provided is expired");
            uint256 rate = uint256(readBytes32(data, INDEX_RATE));
            uint256 decimals = uint256(readBytes32(data, INDEX_DECIMALS));
            uint8 v = uint8(readBytes32(data, INDEX_V));
            bytes32 r = readBytes32(data, INDEX_R);
            bytes32 s = readBytes32(data, INDEX_S);
            
            bytes32 _hash = keccak256(this, currency, rate, decimals, timestamp);
            address signer = ecrecover(keccak256("\x19Ethereum Signed Message:\n32", _hash),v,r,s);

            require(isDelegate(signer), "Signature is not valid");

            cache[currency] = RateCache(timestamp, rate, decimals);

            emit DeliveredRate(msg.sender, currency, signer, timestamp, rate, decimals);
            return (rate, decimals);
        }
    }
}   