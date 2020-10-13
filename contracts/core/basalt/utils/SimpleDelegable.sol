pragma solidity ^0.6.6;

import "./OwnableBasalt.sol";


contract SimpleDelegable is OwnableBasalt {
    mapping(address => bool) delegates;

    modifier onlyDelegate() {
        require(delegates[msg.sender], "Only delegable");
        _;
    }

    function addDelegate(address _delegate) external onlyOwner returns (bool) {
        delegates[_delegate] = true;
        return true;
    }

    function removeDelegate(address _delegate) external onlyOwner returns (bool) {
        delegates[_delegate] = false;
        return true;
    }

    function isDelegate(address _delegate) public view returns (bool) {
        return delegates[_delegate];
    }
}
