pragma solidity ^0.5.11;


contract Auth {

    mapping (address => uint) public authorized;

    /**
     * @dev Initializes the contract setting the deployer as authorized.
     */
    constructor() internal {
        authorized[msg.sender] = 1;
    }

    /**
     * @dev Authorized a new user. Can only be called by an authorized user.
     */
    function rely(address usr) external auth {
        authorized[usr] = 1;
    }

    /**
     * @dev Revoke a user. Can only be called by an authorized user.
     */
    function deny(address usr) external auth {
        authorized[usr] = 0;
    }

    /**
     * @dev Throws if called by any account that is not authorized.
     */
    modifier auth {
        require(authorized[msg.sender] == 1, "Auth/not-authorized");
        _;
    }
}
