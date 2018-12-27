pragma solidity ^0.5.0;

import "./../../../../interfaces/IERC721Base.sol";


interface IBundle {
    event Created(address _owner, uint256 _id);
    event Deposit(address _sender, uint256 _bundle, IERC721Base _token, uint256 _id);
    event Withdraw(address _retriever, uint256 _bundle, IERC721Base _token, uint256 _id);

    function canDeposit(uint256 _packageId) external view returns (bool);
    function content(uint256 _id) external view returns (address[] memory tokens, uint256[] memory ids);

    function create() external returns (uint256 id);
    function deposit(uint256 _packageId, IERC721Base _token, uint256 _tokenId) external returns (bool);
    function depositBatch(uint256 _packageId, IERC721Base[] calldata _tokens, uint256[] calldata _ids) external returns (bool);
    function withdraw(uint256 _packageId, IERC721Base _token, uint256 _tokenId, address _to) external returns (bool);
    function withdrawBatch(uint256 _packageId, IERC721Base[] calldata _tokens, uint256[] calldata _ids, address _to) external returns (bool);
    function withdrawAll(uint256 _packageId, address _to) external returns (bool);
}
