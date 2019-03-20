/* solium-disable */
pragma solidity ^0.5.0;


interface IERC721Receiver {
    function onERC721Received(
        address _operator,
        address _from,
        uint256 _tokenId,
        bytes calldata _userData
    )
        external returns (bytes4);
}
