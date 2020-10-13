/* solium-disable */
pragma solidity ^0.6.6;


interface IERC721ReceiverLegacy {
    function onERC721Received(
        address _from,
        uint256 _tokenId,
        bytes calldata _userData
    )
        external returns (bytes4);
}
