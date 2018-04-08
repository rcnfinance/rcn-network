pragma solidity ^0.4.19;

import "./../../interfaces/Oracle.sol";
import "./../../utils/BytesUtils.sol";

contract TestOracle is Oracle, BytesUtils {
    bytes32 public dummyData1 = keccak256("test_oracle_1");
    bytes32 public dummyData2 = keccak256("test_oracle_2");
    
    bytes public dummyDataBytes1 = buildData(dummyData1);
    bytes public dummyDataBytes2 = buildData(dummyData2);

    function buildData(bytes32 d) internal pure returns (bytes o) {
        assembly {
            let size := 32
            o := mload(0x40)
            mstore(0x40, add(o, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            mstore(o, size)
            mstore(add(o, 32), d)
        }
    }

    function url() public view returns (string) {
        return "";
    }

    function getRate(bytes32, bytes data) public returns (uint256 rate, uint256 decimals) {
        bytes32 sentData = readBytes32(data, 0);
        require(sentData == dummyData1 || sentData == dummyData2);
        if (sentData == dummyData1) {
            // 1 ETH WEI = 6000 RCN WEI
            return (6000, 0);
        } else if (sentData == dummyData2) {
            // 1 ETH WEI = 0.5 RCN WEI
            return (5, 1);
        }
    }
}