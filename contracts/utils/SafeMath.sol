pragma solidity ^0.5.8;


library SafeMath {
    using SafeMath for uint256;

    function add(uint256 x, uint256 y) internal pure returns (uint256) {
        uint256 z = x + y;
        require(z >= x, "Add overflow");
        return z;
    }

    function sub(uint256 x, uint256 y) internal pure returns (uint256) {
        require(x >= y, "Sub underflow");
        return x - y;
    }

    function mult(uint256 x, uint256 y) internal pure returns (uint256) {
        if (x == 0) {
            return 0;
        }

        uint256 z = x * y;
        require(z/x == y, "Mult overflow");
        return z;
    }

    function div(uint256 x, uint256 y) internal pure returns (uint256) {
        require(y != 0, "Div by zero");
        return x / y;
    }

    function divceil(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require(y != 0, "Div by zero");
        z = x / y;
        if (x % y != 0) {
            return z + 1;
        }
    }

    function multdivceil(uint256 x, uint256 y, uint256 z) internal pure returns (uint256) {
        return x.mult(y).divceil(z);
    }
}
