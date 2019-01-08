pragma solidity ^0.5.0;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/SafeMath.sol";


contract SafeMathMock {
    using SafeMath for uint256;
    function add(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.add(b);
    }

    function sub(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.sub(b);
    }

    function mult(uint256 a, uint256 b) external returns (uint256 c) {
        c = a.mult(b);
    }
}


contract SafeMathTest {
    SafeMathMock safeMath;

    constructor() public {
        safeMath = new SafeMathMock();
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
