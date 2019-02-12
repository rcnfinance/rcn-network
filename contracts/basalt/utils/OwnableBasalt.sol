pragma solidity ^0.5.0;


contract OwnableBasalt {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "The owner should be the sender");
        _;
    }

    constructor() public {
        owner = msg.sender;
    }

    /**
        @dev Transfers the ownership of the contract.

        @param _to Address of the new owner
    */
    function transferTo(address _to) public onlyOwner returns (bool) {
        require(_to != address(0), "0x0 Is not a valid owner");
        owner = _to;
        return true;
    }
}
