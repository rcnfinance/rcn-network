pragma solidity ^0.4.19;

import "./Ownable.sol";

contract SimpleDelegable is Ownable {
    mapping(address => bool) delegates;

    modifier onlyDelegate() {
        require(delegates[msg.sender]);
        _;
    }

    function isDelegate(address _delegate) public view returns (bool) {
        return delegates[_delegate];
    }

    function addDelegate(address _delegate) public onlyOwner returns (bool) {
        delegates[_delegate] = true;
        return true;
    }

    function removeDelegate(address _delegate) public onlyOwner returns (bool) {
        delegates[_delegate] = false;
        return true;
    }
}