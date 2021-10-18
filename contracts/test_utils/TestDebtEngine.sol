pragma solidity ^0.8.0;


contract TestDebtEngine {
    address public token;

    constructor (address _token ) {
        token = _token;
    }

    function buildId2(
        address _creator,
        address _model,
        address _oracle,
        uint256 _salt,
        bytes calldata _data
    ) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                uint8(2),
                address(this),
                _creator,
                _model,
                _oracle,
                _salt,
                _data
            )
        );
    }

    function create2(
        address,
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes32) {
        return 0x0;
    }
}
