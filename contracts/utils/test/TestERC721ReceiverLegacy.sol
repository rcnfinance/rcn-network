pragma solidity ^0.5.0;

contract IERC721ReceiverLegacy {
    function onERC721Received(
        address _from,
        uint256 _tokenId,
        bytes memory _userData
    ) public returns (bytes4);
}

contract TestERC721ReceiverLegacy is IERC721ReceiverLegacy {
    address public lastFrom;
    uint256 public lastTokenId;
    bytes public lastData;

    event CalledFallback();

    function onERC721Received(
        address _from,
        uint256 _tokenId,
        bytes memory _userData
    ) public returns (bytes4) {
        lastFrom = _from;
        lastTokenId = _tokenId;
        lastData = _userData;
        return bytes4(0xf0b9e5ba);
    }

    function() external {
        emit CalledFallback();
        // STUB!
    }
}
