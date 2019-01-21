pragma solidity ^0.5.0;

import "./../ERC721Base.sol";


contract TestURIProvider is ERC721Base {
    string public uri = "https://ripioCreditNetwork/debtId";
    uint256 public assetId;

    constructor() public ERC721Base("Test ERC721", "TST") {}

    function generate(
        uint256 id,
        address dest
    ) external returns (bool) {
        _generate(id, dest);
        assetId = id;
        return true;
    }

    function tokenURI(uint256 _tokenId) external view returns (string memory){
        return uri;
    }

    function setURIProvider(URIProvider _provider) external  {
        _setURIProvider(_provider);
    }

}
