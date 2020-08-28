pragma solidity ^0.6.6;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

import "../../contracts/core/basalt/utils/RpSafeMath.sol";


contract TestRpSafeMathMock is RpSafeMath {
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


contract TestRpSafeMath {
    TestRpSafeMathMock private safeMath;

    constructor() public {
        safeMath = new TestRpSafeMathMock();
    }

    function testCatchAddOverflow() external {
        (bool success,) = _safeCall(
            address(safeMath),
            abi.encodeWithSelector(
                safeMath.add.selector,
                uint256(2) ** uint256(255),
                uint256(2) ** uint256(255)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testCatchSubUnderflow() external {
        (bool success,) = _safeCall(
            address(safeMath),
            abi.encodeWithSelector(
                safeMath.sub.selector,
                uint256(2),
                uint256(3)
            )
        );

        Assert.isFalse(success, "Call should fail");
    }

    function testCatchMultOverflow() external {
        (bool success,) = _safeCall(
            address(safeMath),
            abi.encodeWithSelector(
                safeMath.mult.selector,
                uint256(2) ** uint256(255),
                uint256(2)
            )
        );

        Assert.isFalse(success, "Call should fail");
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
    ) internal returns (bool success, bytes32 result) {
        bytes memory returnData;
        uint256 _gas = (block.gaslimit * 80) / 100;

        (success, returnData) = _contract.call{ gas: gasleft() < _gas ? gasleft() : _gas }(_data);

        if (returnData.length > 0)
            result = abi.decode(returnData, (bytes32));
    }
}
