pragma solidity ^0.4.15;

contract BytesUtils {
    function readBytes32(bytes data, uint256 index) internal constant returns (bytes32 o) {
        assembly {
            o := mload(add(data, add(32, mul(32, index))))
        }
    }
}