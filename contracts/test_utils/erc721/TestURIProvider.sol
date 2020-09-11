pragma solidity ^0.6.6;

import "../../utils/ERC721Base.sol";


contract TestTokenURI {
    function tokenURI(uint256) external view returns (string memory) {
        return "https://ripioCreditNetwork/debtId";
    }
}

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

    function setURIProvider(URIProvider _provider) external  {
        _setURIProvider(_provider);
    }
}
