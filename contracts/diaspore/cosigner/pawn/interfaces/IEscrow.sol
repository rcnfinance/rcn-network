pragma solidity ^0.5.0;


contract IEscrow {
    function validate(bytes calldata _data) external returns(bool);

    function request(uint256 _pawnId, bytes32 _loanId, bytes calldata _data) external returns(bool);

    function create(
        uint256 _pawnId,
        bytes32 _loanId,
        address _loanManager,
        bytes calldata _data,
        bytes calldata _oracleData
    ) external returns(bool);

    function addBalance(uint256 _pawnId, uint256 _packageId, uint256 _order, uint256 _amount) external;
    function takeBalance(uint256 _pawnId, uint256 _packageId, uint256 _order, uint256 _amount, address _to) external;

    function buyBalance() external;
    function sellBalance() external;
}
