pragma solidity ^0.5.0;


contract IMechanism {
    function addBalance(uint256 _pawnId, uint256 _packageId, uint256 _order, uint256 _amount) external;
    function takeBalance(uint256 _pawnId, uint256 _packageId, uint256 _order, uint256 _amount, address _to) external;

    function buyBalance() external;
    function sellBalance() external;
}
