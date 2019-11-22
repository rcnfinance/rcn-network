pragma solidity ^0.5.11;


interface CollateralHandler {
    function handle(
        uint256 _entryId,
        uint256 _amount,
        bytes calldata _data
    ) external;
}
