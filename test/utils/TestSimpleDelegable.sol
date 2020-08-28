pragma solidity ^0.6.6;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/core/basalt/utils/SimpleDelegable.sol";

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
        (bool success,) = _safeCall(
            address(delegable),
            abi.encodeWithSelector(delegable.ping.selector)
        );
        Assert.isFalse(success, "Call should fail");
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
        delegable.transferTo(address(account2));
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
        delegable.transferTo(address(account2));
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
        (bool success,) = _safeCall(_contract, _data);
        Assert.isFalse(success, "Should revert");
    }

    function _safeCall(
        address _contract,
        bytes memory _data
    ) internal returns (bool success, bytes32 result) {
        bytes memory returnData;
        uint256 _gas = (block.gaslimit * 80) / 100;

        (success, returnData) = _contract.call{ gas: gasleft() < _gas ? gasleft() : _gas }(_data);

        if (returnData.length > 0)
            result = abi.decode(returnData, (bytes32));
    }
}
