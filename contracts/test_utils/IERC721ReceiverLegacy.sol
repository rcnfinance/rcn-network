/* solium-disable */
pragma solidity ^0.5.0;


interface IERC721ReceiverLegacy {
    function onERC721Received(
        address _from,
        uint256 _tokenId,
        bytes calldata _userData
    )
        external returns (bytes4);
}
