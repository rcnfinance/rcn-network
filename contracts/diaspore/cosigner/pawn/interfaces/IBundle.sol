pragma solidity ^0.5.0;

import "./../../../../interfaces/IERC721Base.sol";


contract IBundle is IERC721Base {
    event Created(address _owner, uint256 _packageId);
    event Deposit(address _sender, uint256 _packageId, IERC721Base _erc721, uint256 _erc721Id);
    event Withdraw(address _retriever, address _beneficiary, uint256 _packageId, IERC721Base _erc721, uint256 _erc721Id);

    function canDeposit(uint256 _packageId) external view returns (bool);
    function content(uint256 _packageId) external view returns (IERC721Base[] memory erc721s, uint256[] memory erc721Ids);
    function aContent(uint256 _packageId, uint256 _order) external view returns (IERC721Base, uint256);

    function create() public returns (uint256 packageId);
    function deposit(uint256 _packageId, IERC721Base _erc721, uint256 _erc721Id) external returns (bool);
    function depositBatch(uint256 _packageId, IERC721Base[] calldata _erc721s, uint256[] calldata _erc721Ids) external returns (bool);
    function depositApprove(uint256 _packageId, IERC721Base _erc721, uint256 _erc721Id) external returns (bool success);
    function withdraw(uint256 _packageId, IERC721Base _erc721, uint256 _erc721Id, address _to) external returns (bool);
    function withdrawBatch(uint256 _packageId, IERC721Base[] calldata _erc721s, uint256[] calldata _erc721Ids, address _to) external returns (bool);
    function withdrawAll(uint256 _packageId, address _to) external returns (bool);
}
