/* solium-disable */
pragma solidity ^0.5.6;

import "../core/basalt/interfaces/CosignerBasalt.sol";
import "../utils/BytesUtils.sol";
import "../core/basalt/interfaces/Engine.sol";
import "../interfaces/IERC20.sol";
import "../core/diaspore/LoanManager.sol";


contract TestCosigner is CosignerBasalt, BytesUtils {
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

    function url() public view returns (string memory) {
        return "";
    }

    // Basalt Cosigner
    function cost(
        address,
        uint256,
        bytes memory _data,
        bytes memory
    ) public view returns (uint256) {
        return uint256(readBytes32(_data, 1));
    }

    function requestCosign(
        address _engine,
        uint256 _index,
        bytes memory _data,
        bytes memory
    ) public returns (bool) {
        if (readBytes32(_data, 0) == keccak256("custom_data")) {
            require(Engine(_engine).cosign(uint256(customId), customCost));
            customId = 0x0;
            customCost = 0;
            return true;
        }

        if (readBytes32(_data, 0) == keccak256("test_oracle")) {
            require(Engine(_engine).cosign(_index, uint256(readBytes32(_data, 1))));
            return true;
        }

        if (readBytes32(_data, 0) == keccak256("return_true_no_cosign")) {
            return true;
        }
    }

    function claim(address, uint256, bytes memory) public returns (bool) {
        return false;
    }

    // Diaspore Cosigner
    function cost(
        address,
        bytes32,
        bytes calldata _data,
        bytes calldata
    ) external view returns (uint256) {
        return uint256(readBytes32(_data, 1));
    }

    function requestCosign(
        address _engine,
        bytes32 _index,
        bytes calldata _data,
        bytes calldata
    ) external returns (bool) {
        if (readBytes32(_data, 0) == keccak256("custom_data")) {
            require(LoanManager(_engine).cosign(customId, customCost));
            customId = 0x0;
            customCost = 0;
            return true;
        }

        if (readBytes32(_data, 0) == keccak256("test_oracle")) {
            require(LoanManager(_engine).cosign(_index, uint256(readBytes32(_data, 1))));
            return true;
        }

        if (readBytes32(_data, 0) == keccak256("return_true_no_cosign")) {
            return true;
        }
    }

    function claim(address, bytes32, bytes calldata) external returns (bool) {
        return false;
    }
}
