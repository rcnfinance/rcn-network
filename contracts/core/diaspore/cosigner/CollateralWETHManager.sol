pragma solidity ^0.5.8;

import "../utils/IWETH9.sol";
import "./Collateral.sol";

import "../../../commons/Ownable.sol";


contract CollateralWETHManager is Ownable {
    event SetWeth(IWETH9 _weth);
    event SetCollateral(Collateral _collateral);

    IWETH9 public weth;
    Collateral public collateral;
    mapping(uint256 => address) public ownerOf;

    modifier isTheOwner(uint256 _entryId) {
        require(ownerOf[_entryId] == msg.sender, "Not current owner");
        _;
    }

    constructor(IWETH9 _weth, Collateral _collateral) public {
        require(_weth != IWETH9(0), "Error loading WETH");
        weth = _weth;
        emit SetWeth(_weth);

        require(_collateral != Collateral(0), "Error loading Collateral");
        collateral = _collateral;
        emit SetCollateral(_collateral);
    }

    function setWeth(IWETH9 _weth) external onlyOwner {
        require(_weth != IWETH9(0), "Error loading WETH");

        weth = _weth;
        emit SetWeth(_weth);
    }

    function setCollateral(Collateral _collateral) external onlyOwner {
        require(_collateral != Collateral(0), "Error loading Collateral");

        collateral = _collateral;
        emit SetCollateral(_collateral);
    }

    function create(
        bytes32 _debtId,
        RateOracle _oracle,
        uint32 _liquidationRatio,
        uint32 _balanceRatio,
        uint32 _burnFee,
        uint32 _rewardFee
    ) external payable returns (uint256 entryId) {
        depositApprove();

        entryId = collateral.create(
            _debtId,
            _oracle,
            weth,
            msg.value,
            _liquidationRatio,
            _balanceRatio,
            _burnFee,
            _rewardFee
        );

        ownerOf[entryId] = msg.sender;
    }

    function deposit(
        uint256 _entryId
    ) external payable {
        depositApprove();

        collateral.deposit(_entryId, msg.value);
    }

    function depositApprove() internal {
        weth.deposit.value(msg.value)();
        weth.approve(address(collateral), msg.value);
    }

    function withdraw(
        uint256 _entryId,
        address payable _to,
        uint256 _amount,
        bytes calldata _oracleData
    ) external isTheOwner(_entryId) {
        collateral.withdraw(
            _entryId,
            address(this),
            _amount,
            _oracleData
        );

        withdrawTransfer(_to, _amount);
    }

    function redeem(
        uint256 _entryId,
        address payable _to
    ) external isTheOwner(_entryId) {
        uint256 amount = collateral.redeem(_entryId);

        withdrawTransfer(_to, amount);
    }

    function withdrawTransfer(
        address payable _to,
        uint256 _amount
    ) internal {
        weth.withdraw(_amount);
        _to.transfer(_amount);
    }

    function claim(uint256 _entryId) external isTheOwner(_entryId) {
        collateral.safeTransferFrom(address(this), msg.sender, _entryId);
        delete ownerOf[_entryId];
    }
}
