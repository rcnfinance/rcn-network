pragma solidity ^0.4.15;

import "./../../interfaces/Oracle.sol";
import "./../../utils/BytesUtils.sol";

contract TestOracle is Oracle, BytesUtils {
    bytes32 public dummyData = keccak256("test_oracle");
    bytes public dummyDataBytes = buildData(dummyData);

    function buildData(bytes32 d) internal returns (bytes o) {
        assembly {
            let size := 32
            o := mload(0x40)
            mstore(0x40, add(o, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            mstore(o, size)
            mstore(add(o, 32), d)
        }
    }

    function url() constant returns (string) {
        return "";
    }

    function getRate(bytes32 currency, bytes data) constant returns (uint256) {
        require(readBytes32(data, 0) == dummyData);
        return 6000;
    }
}