pragma solidity ^0.5.10;

import "./RpSafeMath.sol";
import "./OwnableBasalt.sol";
import "../../../interfaces/IERC20.sol";


contract TokenLockable is RpSafeMath, OwnableBasalt {
    mapping(address => uint256) public lockedTokens;

    /**
        @dev Withdraws tokens from the contract.

        @param token Token to withdraw
        @param to Destination of the tokens
        @param amount Amount to withdraw
    */
    function withdrawTokens(IERC20 token, address to, uint256 amount) public onlyOwner returns (bool) {
        require(safeSubtract(token.balanceOf(address(this)), lockedTokens[address(token)]) >= amount);
        require(to != address(0));
        return token.transfer(to, amount);
    }

    /**
        @dev Locked tokens cannot be withdrawn using the withdrawTokens function.
    */
    function lockTokens(address token, uint256 amount) internal {
        lockedTokens[token] = safeAdd(lockedTokens[token], amount);
    }

    /**
        @dev Unlocks previusly locked tokens.
    */
    function unlockTokens(address token, uint256 amount) internal {
        lockedTokens[token] = safeSubtract(lockedTokens[token], amount);
    }
}
