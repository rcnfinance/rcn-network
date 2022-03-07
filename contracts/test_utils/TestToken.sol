pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


contract TestToken is ERC20("Test Token", "TEST") {
    function mint(address to, uint256 value) external {
        _mint(to, value);
    }

    function burn(address account, uint256 value) external {
        _burn(account, value);
    }

    function setBalance(address account, uint256 value) external {
        uint256 balance = balanceOf(account);

        if (balance == value) {
            return;
        }

        if (value > balance) {
            _mint(account, value - balance);
        } else {
            _burn(account, balance - value);
        }
    }
}