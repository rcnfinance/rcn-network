pragma solidity ^0.5.0;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/RpSafeMath.sol";


contract RpSafeMathMock is RpSafeMath {
    function add(uint256 a, uint256 b) external returns (uint256 c) {
        c = safeAdd(a, b);
    }

    function sub(uint256 a, uint256 b) external returns (uint256 c) {
        c = safeSubtract(a, b);
    }

    function mult(uint256 a, uint256 b) external returns (uint256 c) {
        c = safeMult(a, b);
    }

    function _min(uint256 a, uint256 b) external returns (uint256 c) {
        c = min(a, b);
    }

    function _max(uint256 a, uint256 b) external returns (uint256 c) {
        c = max(a, b);
    }
}


contract RpSafeMathTest {
    RpSafeMathMock safeMath;

    constructor() public {
        safeMath = new RpSafeMathMock();
    }

    function testCatchAddOverflow() external {
        (uint256 success, bytes32 result) = _safeCall(
            address(safeMath),
            abi.encodeWithSelector(
                safeMath.add.selector,
                uint256(2) ** uint256(255),
                uint256(2) ** uint256(255)
            )
        );

        Assert.equal(success, 0, "Call should fail");
    }

    function testCatchSubUnderflow() external {
        (uint256 success, bytes32 result) = _safeCall(
            address(safeMath),
            abi.encodeWithSelector(
                safeMath.sub.selector,
                uint256(2),
                uint256(3)
            )
        );

        Assert.equal(success, 0, "Call should fail");
    }

    function testCatchMultOverflow() external {
        (uint256 success, bytes32 result) = _safeCall(
            address(safeMath),
            abi.encodeWithSelector(
                safeMath.mult.selector,
                uint256(2) ** uint256(255),
                uint256(2)
            )
        );

        Assert.equal(success, 0, "Call should fail");
    }

    function testMin() external {
        Assert.equal(safeMath._min(50, 3), 3, "Test min");
        Assert.equal(safeMath._min(2, 3), 2, "Test min");
        Assert.equal(safeMath._min(40, 40), 40, "Test min");
    }

    function testMax() external {
        Assert.equal(safeMath._max(50, 3), 50, "Test max");
        Assert.equal(safeMath._max(2, 3), 3, "Test max");
        Assert.equal(safeMath._max(40, 40), 40, "Test max");
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
