pragma solidity ^0.5.10;

import "../../core/diaspore/interfaces/LoanCallback.sol";


contract TestLoanCallback is LoanCallback {
    bytes32 public requireId;
    address public requireLender;
    bytes public requireData;

    uint256 public burnGas;
    bytes32 public stub;
    bool public returnValue = true;

    address public caller;

    // ///
    // Admin
    // ///

    function setRequireId(bytes32 _id) external {
        requireId = _id;
    }

    function setRequireLender(address _lender) external {
        requireLender = _lender;
    }

    function setRequireData(bytes calldata _data) external {
        requireData = _data;
    }

    function setBurnGas(uint256 _gas) external {
        burnGas = _gas;
    }

    function setReturn(bool _value) external {
        returnValue = _value;
    }

    // ///
    // Loan Callback
    // ///

    function scheme() external view returns (string memory) {
        return "";
    }

    function onLent(
        bytes32 _id,
        address _lender,
        bytes calldata _data
    ) external returns (bool) {
        uint256 initGas = gasleft();
        uint256 targetGas = burnGas;

        while (initGas - gasleft() < targetGas) {
            stub = keccak256(abi.encodePacked(stub));
        }

        require(_id == requireId, "callback: wrong id");
        require(_lender == requireLender, "callback: wrong lender");
        require(keccak256(abi.encodePacked(_data)) == keccak256(abi.encodePacked(requireData)), "callback: wrong data");

        caller = msg.sender;

        return returnValue;
    }

    function acceptsLoan(
        address _engine,
        bytes32 _id,
        address _lender,
        bytes calldata _data
    ) external view returns (bool) {
        return returnValue;
    }
}
