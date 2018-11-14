pragma solidity ^0.4.19;

import "./../interfaces/Cosigner.sol";


contract ReferenceCosigner is Cosigner {
    string private infoUrl;

    function url() public view returns (string) {
        return infoUrl;
    }

    /**
        @dev Sets the url to retrieve the data for "TODO"

        @param _url New url
    */
    function setUrl(string _url) public returns (bool) {
        infoUrl = _url;
        return true;
    }

    function cost(address engine, uint256 index, bytes data, bytes) public view returns (uint256) {
        return 0;
    }

    function requestCosign(Engine engine, uint256 index, bytes data, bytes) public returns (bool) {
        return false;
    }

    function claim(address engineAddress, uint256 index, bytes oracleData) public returns (bool) {
        return false;
    }
}
