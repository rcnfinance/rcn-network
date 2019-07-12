/* solium-disable */
pragma solidity ^0.5.10;

import "../../contracts/interfaces/Cosigner.sol";
import "../../contracts/utils/BytesUtils.sol";
import "../../contracts/core/basalt/interfaces/Engine.sol";
import "../../contracts/interfaces/IERC20.sol";


contract TestCosigner is Cosigner, BytesUtils {
    bytes32 public dummyCost = bytes32(uint256(1 * 10**18));
    bytes public data = buildData(keccak256("test_oracle"), dummyCost);
    bytes public noCosignData = buildData(keccak256("return_true_no_cosign"), 0);
    bytes public badData = buildData(keccak256("bad_data"), 0);

    bytes32 public customId;
    uint256 public customCost;
    bytes32 public customData = keccak256("custom_data");

    IERC20 public token;

    constructor(IERC20 _token) public {
        token = _token;
    }

    function setCustomData(bytes32 _customId, uint256 _customCost) external {
        customId = _customId;
        customCost = _customCost;
    }

    function getDummyCost() public view returns(uint256) {
        return uint256(dummyCost);
    }

    function buildData(bytes32 a, bytes32 b) internal returns (bytes memory o) {
        assembly {
            let size := 64
            o := mload(0x40)
            mstore(0x40, add(o, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            mstore(o, size)
            mstore(add(o, 32), a)
            mstore(add(o, 64), b)
        }
    }

    function cost(
        address,
        uint256,
        bytes memory data,
        bytes memory
    ) public view returns (uint256) {
        return uint256(readBytes32(data, 1));
    }

    function requestCosign(
        address engine,
        uint256 index,
        bytes memory data,
        bytes memory
    ) public returns (bool) {
        if (readBytes32(data, 0) == keccak256("custom_data")) {
            require(Engine(engine).cosign(uint256(customId), customCost));
            customId = 0x0;
            customCost = 0;
            return true;
        }

        if (readBytes32(data, 0) == keccak256("test_oracle")) {
            require(Engine(engine).cosign(index, uint256(readBytes32(data, 1))));
            return true;
        }

        if (readBytes32(data, 0) == keccak256("return_true_no_cosign")) {
            return true;
        }
    }

    function url() public view returns (string memory) {
        return "";
    }

    function claim(address, uint256, bytes memory) public returns (bool) {
        return false;
    }
}
