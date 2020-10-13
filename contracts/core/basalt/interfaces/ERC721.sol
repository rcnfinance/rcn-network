pragma solidity ^0.6.6;


interface ERC721 {
    // ERC20 compatible functions
    function name() external view returns (string memory _name);
    function symbol() external view returns (string memory _symbol);
    function totalSupply() external view returns (uint256 _totalSupply);
    function balanceOf(address _owner) external view returns (uint _balance);
    // Functions that define ownership
    function ownerOf(uint256) external view returns (address owner);
    function approve(address, uint256) external returns (bool);
    function takeOwnership(uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function setApprovalForAll(address _operator, bool _approved) external returns (bool);
    function getApproved(uint256 _tokenId) external view returns (address);
    function isApprovedForAll(address _owner, address _operator) external view returns (bool);
    // Token metadata
    function tokenMetadata(uint256 _tokenId) external view returns (string memory info);
    // Events
    event Transfer(address indexed _from, address indexed _to, uint256 indexed _tokenId);
    event Approval(address indexed _owner, address indexed _approved, uint256 indexed _tokenId);
    event ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved);
}
