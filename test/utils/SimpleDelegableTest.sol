pragma solidity ^0.4.24;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/utils/SimpleDelegable.sol";

contract SimpleDelegableMock is SimpleDelegable {
    function ping() external onlyDelegate returns (bytes32) {
        return bytes32(2);
    }
}

contract SimpleDelegableTest {
    function testCallAsDelegate() external {
        SimpleDelegableMock delegable = new SimpleDelegableMock();
        delegable.addDelegate(this);
        Assert.equal(delegable.ping(), bytes32(2), "Call should success");
    }

    function testFailNonDelegate() external {
        SimpleDelegableMock delegable = new SimpleDelegableMock();
        (uint256 success, bytes32 result) = _safeCall(
            delegable,
            abi.encodeWithSelector(delegable.ping.selector)
        );
        Assert.equal(success, uint256(0), "Call should fail");
    }

    function _safeCall(
        address _contract,
        bytes _data
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
