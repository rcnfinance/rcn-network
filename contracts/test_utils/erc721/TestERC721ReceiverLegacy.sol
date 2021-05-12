/* solium-disable */
pragma solidity ^0.8.4;

import "./IERC721ReceiverLegacy.sol";


contract TestERC721ReceiverLegacy is IERC721ReceiverLegacy {
    address public lastFrom;
    uint256 public lastTokenId;
    bytes public lastData;

    event CalledFallback();

    function onERC721Received(
        address _from,
        uint256 _tokenId,
        bytes calldata _userData
    ) external override returns (bytes4) {
        lastFrom = _from;
        lastTokenId = _tokenId;
        lastData = _userData;
        return bytes4(0xf0b9e5ba);
    }

    fallback() external {
        emit CalledFallback();
        // STUB!
    }
}
