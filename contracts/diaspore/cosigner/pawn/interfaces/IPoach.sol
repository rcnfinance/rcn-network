pragma solidity ^0.5.0;

import "./../../../../interfaces/Token.sol";
import "./../../../../interfaces/IERC721Base.sol";


contract IPoach is IERC721Base {
    address constant internal ETH = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    event Created(uint256 _pairId, address _owner, Token _erc20, uint256 _amount);
    event Deposit(uint256 _pairId, address _sender, uint256 _amount);
    event Destroy(uint256 _pairId, address _sender, address _to, uint256 _balance);

    function getPair(uint256 _id) external view returns(Token, uint256);

    function create(Token _token, uint256 _amount) external payable returns (uint256 id);
    function deposit(uint256 _id, uint256 _amount) external payable returns (bool);
    function destroy(uint256 _id, address payable _to) external returns (bool);
}
