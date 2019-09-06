/* solium-disable */
pragma solidity ^0.5.11;

import "./IERC721Receiver.sol";


contract TestERC721Receiver is IERC721Receiver {
    address public lastOperator;
    address public lastFrom;
    uint256 public lastTokenId;
    bytes public lastData;

    event Received(address _operator, address _from, uint256 _id, bytes _data);

    function onERC721Received(
        address _operator,
        address _from,
        uint256 _tokenId,
        bytes calldata _userData
    ) external returns (bytes4) {
        emit Received(
            _operator,
            _from,
            _tokenId,
            _userData
        );
        lastOperator = _operator;
        lastFrom = _from;
        lastTokenId = _tokenId;
        lastData = _userData;
        return bytes4(0x150b7a02);
    }
}
