pragma solidity ^0.5.8;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/commons/SimpleDelegable.sol";

import "../../contracts/test_utils/TestAccountMock.sol";


contract TestSimpleDelegableMock is SimpleDelegable {
    function ping() external onlyDelegate returns (bytes32) {
        return bytes32(uint256(2));
    }
}


contract TestSimpleDelegable {
    function testCallAsDelegate() external {
        TestSimpleDelegableMock delegable = new TestSimpleDelegableMock();
        delegable.addDelegate(address(this));
        Assert.equal(delegable.ping(), bytes32(uint256(2)), "Call should success");
    }

    function testFailNonDelegate() external {
        TestSimpleDelegableMock delegable = new TestSimpleDelegableMock();
        (uint256 success, bytes32 result) = _safeCall(
            address(delegable),
            abi.encodeWithSelector(delegable.ping.selector)
        );
        Assert.equal(success, uint256(0), "Call should fail");
    }

    function testAddDelegate() external {
        TestSimpleDelegableMock delegable = new TestSimpleDelegableMock();
        TestAccountMock account1 = new TestAccountMock();
        TestAccountMock account2 = new TestAccountMock();
        delegable.addDelegate(address(account1));
        delegable.addDelegate(address(account2));
        Assert.equal(delegable.isDelegate(address(account1)), true, "account1 be delegate");
        Assert.equal(delegable.isDelegate(address(account2)), true, "account2 be delegate");
    }

    function testRemoveDelegate() external {
        TestSimpleDelegableMock delegable = new TestSimpleDelegableMock();
        TestAccountMock account1 = new TestAccountMock();
        TestAccountMock account2 = new TestAccountMock();
        delegable.addDelegate(address(account1));
        delegable.addDelegate(address(account2));
        delegable.removeDelegate(address(account2));
        Assert.equal(delegable.isDelegate(address(account1)), true, "account1 be delegate");
        Assert.equal(delegable.isDelegate(address(account2)), false, "account2 be delegate");
    }

    function testOnlyOwnerShouldAddDelegate() external {
        TestSimpleDelegableMock delegable = new TestSimpleDelegableMock();
        TestAccountMock account1 = new TestAccountMock();
        TestAccountMock account2 = new TestAccountMock();
        delegable.transferOwnership(address(account2));
        assertRevert(
            address(delegable),
            abi.encodeWithSelector(
                delegable.addDelegate.selector,
                address(this)
            )
        );
        assertRevert(
            address(delegable),
            abi.encodeWithSelector(
                delegable.addDelegate.selector,
                account2
            )
        );
        assertRevert(
            address(delegable),
            abi.encodeWithSelector(
                delegable.addDelegate.selector,
                account1
            )
        );
        Assert.equal(delegable.isDelegate(address(this)), false, "");
        Assert.equal(delegable.isDelegate(address(account1)), false, "");
        Assert.equal(delegable.isDelegate(address(account2)), false, "");
    }

    function testOnlyOwnerShouldRemoveDelegate() external {
        TestSimpleDelegableMock delegable = new TestSimpleDelegableMock();
        TestAccountMock account1 = new TestAccountMock();
        TestAccountMock account2 = new TestAccountMock();
        delegable.addDelegate(address(account1));
        delegable.transferOwnership(address(account2));
        assertRevert(
            address(delegable),
            abi.encodeWithSelector(
                delegable.removeDelegate.selector,
                account2
            )
        );
        assertRevert(
            address(delegable),
            abi.encodeWithSelector(
                delegable.removeDelegate.selector,
                account1
            )
        );
        Assert.equal(delegable.isDelegate(address(account1)), true, "");
        Assert.equal(delegable.isDelegate(address(account2)), false, "");
    }

    function assertRevert(
        address _contract,
        bytes memory _data
    ) internal {
        (uint256 success,) = _safeCall(_contract, _data);
        Assert.equal(success, 0, "Should revert");
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
