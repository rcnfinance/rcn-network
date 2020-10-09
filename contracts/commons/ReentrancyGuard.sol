pragma solidity ^0.6.6;


contract ReentrancyGuard {
    uint256 private _reentrantFlag;

    uint256 private constant FLAG_LOCKED = 1;
    uint256 private constant FLAG_UNLOCKED = 2;

    constructor() public {
        _reentrantFlag = FLAG_UNLOCKED;
    }

    modifier nonReentrant() {
        // On the first call to nonReentrant, _notEntered will be true
        require(_reentrantFlag != FLAG_LOCKED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _reentrantFlag = FLAG_LOCKED;
        _;
        _reentrantFlag = FLAG_UNLOCKED;
    }
}
