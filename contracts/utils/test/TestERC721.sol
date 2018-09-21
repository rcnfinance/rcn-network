pragma solidity ^0.4.24;

import "./../ERC721Base.sol";

contract TestERC721 is ERC721Base {
    function generate(
        uint256 id,
        address dest
    ) external returns (bool) {
        _generate(id, dest);
        return true;
    }
}