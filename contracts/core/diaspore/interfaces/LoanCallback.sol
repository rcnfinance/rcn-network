pragma solidity ^0.5.10;

import "../../../interfaces/IERC165.sol";


interface LoanCallback {
    function scheme() external view returns (string memory);

    function onLent(
        bytes32 _id,
        address _lender,
        bytes calldata _data
    ) external returns (bool);

    function acceptsLoan(
        address _engine,
        bytes32 _id,
        address _lender,
        bytes calldata _data
    ) external view returns (bool);
}
