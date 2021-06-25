pragma solidity ^0.8.0;


contract TestAccountMock {
    function send(
        address _to,
        bytes memory _data
    ) public returns (bytes32) {
        (bool success, bytes32 result) = _safeGasCall(
            _to,
            _data
        );

        require(success, "Tx reverted");

        return result;
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract),
     * relaxing the requirement on the return value
     *
     * @param _contract The contract that receives the call
     * @param _data The call data
     *
     * @return success True if the call not reverts
     * @return result the result of the call
     */
    function _safeGasCall(
        address _contract,
        bytes memory _data
    ) internal returns (bool success, bytes32 result) {
        bytes memory returnData;
        uint256 _gas = (block.gaslimit * 80) / 100;

        (success, returnData) = _contract.call{ gas: gasleft() < _gas ? gasleft() : _gas }(_data);

        if (returnData.length > 0)
            result = abi.decode(returnData, (bytes32));
    }
}
