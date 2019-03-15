pragma solidity ^0.5.0;

import "./../../../../interfaces/Token.sol";
import "./../../../../interfaces/IERC721Base.sol";


contract IPouch is IERC721Base {
    address constant internal ETH = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    event Created(uint256 _pairId, address _owner, Token _erc20, uint256 _amount);
    event Deposit(uint256 _pairId, address _sender, uint256 _amount);
    event Withdraw(uint256 _pairId, address _sender, address _to, uint256 _amount);

    function canDeposit(uint256 _id) external view returns (bool);
    function getPair(uint256 _id) external view returns(Token, uint256);

    function create(Token _token, uint256 _amount) external payable returns (uint256 pairId);
    function deposit(uint256 _pairId, uint256 _amount) external payable returns (bool);
    function withdraw(uint256 _pairId, address payable _to) external returns (bool);
    function withdrawPartial(uint256 _pairId, address payable _to, uint256 _amount) external returns (bool);
}
