pragma solidity ^0.8.12;

import "../../cosigner/interfaces/CollateralAuctionCallback.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract MockCollateralAuctionCallback is CollateralAuctionCallback {
    uint256 public lastId;
    uint256 public lastLeftover;
    uint256 public lastReceived;
    bytes public lastData;

    function auctionClosed(
        uint256 _id,
        uint256 _leftover,
        uint256 _received,
        bytes calldata _data
    ) external override {
        lastId = _id;
        lastLeftover = _leftover;
        lastReceived = _received;
        lastData = _data;
    }

    function takeOwnership(Ownable _own) external {
        _own.transferOwnership(msg.sender);
    }
}
