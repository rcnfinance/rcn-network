pragma solidity ^0.5.0;

import "../../../interfaces/IERC20.sol";
import "../../../interfaces/Cosigner.sol";
import "../LoanManager.sol";

import "../../../commons/Ownable.sol";
import "../../../commons/ERC721Base.sol";
import "../../../utils/SafeERC20.sol";


contract Collateral is Ownable, Cosigner, ERC721Base {
    using SafeERC20 for IERC20;

    event Created(uint256 indexed _id, address indexed _manager, bytes32 indexed _loanId, address _token, uint256 _amount);
    event Started(uint256 indexed _id);
    event Redeemed(uint256 indexed _id);

    Entry[] public entries;
    mapping(address => mapping(bytes32 => uint256)) public liabilities;

    string private iurl;

    enum Status {
        Pending,
        Started
    }

    struct Entry {
        Status status;
        LoanManager loanManager;
        IERC20 token;
        bytes32 loanId;
        uint256 amount;
    }

    function create(
        LoanManager _loanManager,
        bytes32 _loanId,
        IERC20 _token,
        uint256 _amount
    ) external returns (uint256 id) {
        require(_loanManager.getStatus(_loanId) == 0, "Loan request should be open");

        id = entries.push(
            Entry(
                Status.Pending,
                _loanManager,
                _token,
                _loanId,
                _amount
            )
        ) - 1;

        require(_token.safeTransferFrom(msg.sender, address(this), _amount), "Error pulling tokens");
        _generate(id, msg.sender);

        emit Created(
            id,
            address(_loanManager),
            _loanId,
            address(_token),
            _amount
        );
    }

    function redeem(
        uint256 _id
    ) external {
        // Validate ownership of collateral
        require(_isAuthorized(msg.sender, _id), "Sender not authorized");

        // Validate if the collateral can be redemed
        Entry storage entry = entries[_id];
        uint256 status = entry.loanManager.getStatus(entry.loanId);

        // TODO Status ERROR
        require(status == 0 || status == 2, "Loan not request or paid");
        require(entry.token.safeTransfer(msg.sender, entry.amount), "Error sending tokens");

        // Destroy ERC721 collateral token
        delete entries[_id]; // TODO: Find best way to delete

        emit Redeemed(_id);
    }

    // ///
    // Cosigner methods
    // ///

    function setUrl(string calldata _url) external onlyOwner {
        iurl = _url;
    }

    function cost(
        address,
        bytes32,
        bytes calldata,
        bytes calldata
    ) external view returns (uint256) {
        return 0;
    }

    function url() public view returns (string memory) {
        return iurl;
    }

    function requestCosign(
        address,
        bytes32 _loanId,
        bytes calldata _data,
        bytes calldata
    ) external returns (bool) {
        // Load id and entry
        uint256 id = abi.decode(_data, (uint256));
        Entry storage entry = entries[id];

        // Validate call from loan manager
        LoanManager loanManager = entry.loanManager;
        require(entry.loanId == _loanId, "Wrong loan id");
        require(address(loanManager) == msg.sender, "Not the loan manager");

        // Save liability ID
        liabilities[address(loanManager)][_loanId] = id; 

        // Cosign
        require(loanManager.cosign(uint256(_loanId), 0), "Error performing cosign");

        emit Started(id);
    }

    function claim(
        address _loanManager,
        bytes32 _loanId,
        bytes calldata _oracleData
    ) external returns (bool) {
        uint256 id = liabilities[_loanManager][_loanId];
        Entry storage entry = entries[id];


        revert("Not implemented");
    }
}
