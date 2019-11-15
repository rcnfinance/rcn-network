pragma solidity ^0.5.11;


interface CollateralHandler {
    function handle(
        uint256 _entryId,
        bytes calldata _data
    ) external;
}
