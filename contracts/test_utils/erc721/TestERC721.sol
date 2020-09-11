pragma solidity ^0.6.6;

import "../../utils/ERC721Base.sol";


contract TestERC721 is ERC721Base {
    constructor() public ERC721Base("Test ERC721", "TST") {}

    function generate(
        uint256 id,
        address dest
    ) external returns (bool) {
        _generate(id, dest);
        return true;
    }
}
