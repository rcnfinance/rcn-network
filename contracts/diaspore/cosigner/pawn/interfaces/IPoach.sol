pragma solidity ^0.5.0;

import "./../../../../interfaces/Token.sol";


interface IPoach {
    function getPair(uint poachId) external view returns(address, uint, bool);

    function create(Token token, uint256 amount) external payable returns (uint256 id);
    function deposit(uint256 id, uint256 amount) external payable returns (bool);
    function destroy(uint256 id) external returns (bool);
}
