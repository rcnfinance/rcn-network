pragma solidity ^0.8.12;


interface CollateralHandler {
    function handle(
        uint256 _entryId,
        uint256 _amount,
        bytes calldata _data
    ) external returns (uint256 surplus);
}
