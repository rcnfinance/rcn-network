pragma solidity ^0.5.8;

import "../../../interfaces/IERC165.sol";


interface LoanCallback {
    function onLent(
        bytes32 _id,
        bytes calldata _data
    ) external returns (bool);

    function acceptsLoan(
        address _engine,
        bytes32 _id,
        bytes calldata _data
    ) external view returns (bool);
}
