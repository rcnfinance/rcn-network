pragma solidity ^0.5.8;

import "../utils/IWETH9.sol";
import "./Collateral.sol";

import "../../../commons/Ownable.sol";


contract CollateralWETHManager is Ownable {
    event SetWeth(IWETH9 _weth);
    event SetCollateral(Collateral _collateral);

    event Created(uint256 indexed _entryId, address _sender, uint256 _amount);
    event Deposited(uint256 indexed _entryId, address _sender, uint256 _amount);

    event Redeemed(uint256 _entryId, address _to, uint256 _amount);
    event Withdrawed(uint256 _entryId, address _to, uint256 _amount);

    IWETH9 public weth;
    Collateral public collateral;

    /**
        @dev Check if the sender is the owner of the collateral
    */
    modifier isTheOwner(uint256 _entryId) {
        require(collateral.ownerOf(_entryId) == msg.sender, "The sender is not current owner");
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

    /**
        @dev Set WETH contract

        @param _weth New WETH
    */
    function setWeth(IWETH9 _weth) external onlyOwner {
        require(_weth != IWETH9(0), "Error loading WETH");

        weth = _weth;
        emit SetWeth(_weth);
    }

    /**
        @dev Set collateral contract

        @param _collateral New collateral
    */
    function setCollateral(Collateral _collateral) external onlyOwner {
        require(_collateral != Collateral(0), "Error loading Collateral");

        collateral = _collateral;
        emit SetCollateral(_collateral);
    }

    /**
        @dev Convert the msg.value to WETH, approve collateral to use the WETH
            and create an entry

        @param _debtId Id of the debt
        @param _oracle The oracle to get the rate between loanManagerToken and entry token

        @param _liquidationRatio Ratio, when collateral ratio is lower enables the execution of the margin call
        @param _balanceRatio Ratio, expected collateral ratio after margin call execution

        @param _burnFee Ratio, The burn fee of execute a margin call or pay expired debt, this is sent to the address 0
        @param _rewardFee Ratio, The reward fee of execute a margin call or pay expired debt, this is sent to the sender of the transactiond
    */
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

        collateral.safeTransferFrom(address(this), msg.sender, entryId);

        emit Created(entryId, msg.sender, msg.value);
    }

    /**
        @dev Convert the msg.value to WETH, approve collateral to use the WETH
            and deposit to an entry

        @param _entryId The index of the entry
    */
    function deposit(
        uint256 _entryId
    ) external payable {
        depositApprove();

        collateral.deposit(_entryId, msg.value);

        emit Deposited(_entryId, msg.sender, msg.value);
    }

    /**
        @dev Convert the ETH to WETH and approve collateral to use the WETH
    */
    function depositApprove() internal {
        weth.deposit.value(msg.value)();
        weth.approve(address(collateral), msg.value);
    }

    /**
        @dev Withdraw an amount of an entry, withdraw the WETH and transfer the ETH

        @param _entryId The index of the entry
        @param _to The beneficiary of the ETH
        @param _amount The amount of WETH to be withdraw in ETH
        @param _oracleData Data of oracle to change the currency of debt
            to Token of debt engine
    */
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

        emit Withdrawed(_entryId, _to, _amount);
    }

    /**
        @dev Redeem an entry, withdraw the WETH and transfer the ETH

        @param _entryId The index of the entry
        @param _to The beneficiary of the ETH
    */
    function redeem(
        uint256 _entryId,
        address payable _to
    ) external isTheOwner(_entryId) {
        uint256 amount = collateral.redeem(_entryId);

        withdrawTransfer(_to, amount);

        emit Redeemed(_entryId, _to, amount);
    }

    /**
        @dev Convert the WETH to ETH and transfer the ETH

        @param _to The beneficiary of the ETH
        @param _amount The amount of ETH to be transfer
    */
    function withdrawTransfer(
        address payable _to,
        uint256 _amount
    ) internal {
        weth.withdraw(_amount);
        _to.transfer(_amount);
    }

    /**
        @dev Use to receive ETH
    */
    function () external payable { }
}
