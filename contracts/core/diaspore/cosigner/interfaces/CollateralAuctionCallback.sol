pragma solidity ^0.5.11;


interface CollateralAuctionCallback {
    function auctionClosed(
        uint256 _id,
        uint256 _leftover,
        uint256 _received,
        bytes calldata _data
    ) external;
}