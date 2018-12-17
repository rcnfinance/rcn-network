pragma solidity ^0.4.24;

import "./../../../../utils/ERC721Base.sol";


interface IBundle {
    function canDeposit(uint256 packageId) public view returns (bool);
    function content(uint256 id) external view returns (address[] tokens, uint256[] ids);

    function create() public returns (uint256 id);
    function deposit(uint256 _packageId, ERC721Base token, uint256 tokenId) external returns (bool);
    function depositBatch(uint256 _packageId, ERC721Base[] tokens, uint256[] ids) external returns (bool);
    function withdraw(uint256 packageId, ERC721Base token, uint256 tokenId, address to) external returns (bool);
    function withdrawBatch(uint256 packageId, ERC721Base[] tokens, uint256[] ids, address to) external returns (bool);
    function withdrawAll(uint256 packageId, address to) external returns (bool);
}
