pragma solidity ^0.5.0;


contract TestURIProvider2 {
    string public uri = "TestURIProvider2";

    function tokenURI(uint256 _tokenId) external view returns (string memory){
        return uri;
    }
}
