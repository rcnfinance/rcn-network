pragma solidity ^0.5.0;

import "./Ownable.sol";


contract SimpleDelegable is Ownable {
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
