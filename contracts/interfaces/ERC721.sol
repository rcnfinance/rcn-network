pragma solidity ^0.4.15;

contract ERC721 {
   // ERC20 compatible functions
   function name() constant returns (string _name);
   function symbol() constant returns (string _symbol);
   function totalSupply() constant returns (uint256 _totalSupply);
   function balanceOf(address _owner) constant returns (uint _balance);
   // Functions that define ownership
   function ownerOf(uint256) constant returns (address owner);
   function approve(address, uint256) public returns (bool);
   function takeOwnership(uint256) public returns (bool);
   function transfer(address, uint256) public returns (bool);
   function allowance(address, uint256) constant public returns (bool);
   // Events
   event Transfer(address indexed _from, address indexed _to, uint256 _tokenId);
   event Approval(address indexed _owner, address indexed _approved, uint256 _tokenId);
}