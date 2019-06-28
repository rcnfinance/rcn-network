pragma solidity ^0.5.10;


contract TestAccountMock {
    function send(
        address _to,
        bytes memory _data
    ) public returns (bytes32) {
        (uint256 success, bytes32 result) = _safeCall(_to, _data);
        require(success == 1, "Tx reverted");
        return result;
    }

    function _safeCall(
        address _contract,
        bytes memory _data
    ) internal returns (uint256 success, bytes32 result) {
        assembly {
            let x := mload(0x40)
            success := call(
                            gas,                 // Send almost all gas
                            _contract,            // To addr
                            0,                    // Send ETH
                            add(0x20, _data),     // Input is data past the first 32 bytes
                            mload(_data),         // Input size is the lenght of data
                            x,                    // Store the ouput on x
                            0x20                  // Output is a single bytes32, has 32 bytes
                        )

            result := mload(x)
        }
    }
}
