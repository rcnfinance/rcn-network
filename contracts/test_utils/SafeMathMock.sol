pragma solidity ^0.5.6;

import "../utils/SafeMath.sol";

contract SafeMathMock {
    using SafeMath for uint256;

    function add(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.add(b);
    }

    function sub(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.sub(b);
    }

    function mult(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.mult(b);
    }

    function div(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.div(b);
    }

    function divceil(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.divceil(b);
    }

    function multdivceil(uint256 a, uint256 b, uint256 c) external returns (uint256 d) {
        d = a.multdivceil(b, c);
    }
}
