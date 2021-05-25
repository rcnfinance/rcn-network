pragma solidity ^0.8.4;

import "../interfaces/IWETH9.sol";
import "./Collateral.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";


contract CollateralWETHManager is Ownable, IERC721Receiver {
    event SetWeth(IWETH9 _weth);
    event SetCollateral(Collateral _collateral);

    IWETH9 public weth;
    Collateral public collateral;

    constructor(IWETH9 _weth, Collateral _collateral) {
        weth = _weth;
        emit SetWeth(_weth);

        collateral = _collateral;
        emit SetCollateral(_collateral);
    }

    /**
        @dev Set WETH contract

        @param _weth New WETH
    */
    function setWeth(IWETH9 _weth) external onlyOwner {
        weth = _weth;
        emit SetWeth(_weth);
    }

    /**
        @dev Set collateral contract

        @param _collateral New collateral
    */
    function setCollateral(Collateral _collateral) external onlyOwner {
        collateral = _collateral;
        emit SetCollateral(_collateral);
    }

    /**
        @dev Convert the msg.value to WETH, approve collateral to use the WETH
            and create an entry

        @param _debtId Id of the RCN debt
        @param _oracle The oracle that provides the rate between `loanManagerToken` and entry `token`
            If the oracle its the address 0 the entry token it's `loanManagerToken`
            otherwise the token it's provided by `oracle.token()`
        @param _liquidationRatio collateral/debt ratio that triggers the execution of the margin call, encoded as Fixed64x32
        @param _balanceRatio Target collateral/debt ratio expected after a margin call execution, encoded as Fixed64x32

        @return entryId The id of the new collateral entry and ERC721 token
    */
    function create(
        bytes32 _debtId,
        RateOracle _oracle,
        uint96 _liquidationRatio,
        uint96 _balanceRatio
    ) external payable returns (uint256 entryId) {
        _depositApprove();

        entryId = collateral.create(
            address(this),
            _debtId,
            _oracle,
            msg.value,
            _liquidationRatio,
            _balanceRatio
        );

        collateral.safeTransferFrom(address(this), msg.sender, entryId);
    }

    /**
        @dev Convert the msg.value to WETH, approve collateral to use the WETH
            and deposit to an entry

        @param _entryId The index of the entry
    */
    function deposit(
        uint256 _entryId
    ) external payable {
        _depositApprove();

        collateral.deposit(_entryId, msg.value);
    }

    /**
        @dev Convert the ETH to WETH and approve collateral to use the WETH
    */
    function _depositApprove() internal {
        weth.deposit{ value: msg.value }();
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
    ) external {
        require(collateral.isApprovedOrOwner(msg.sender, _entryId), "CollateralWETHManager: Sender not authorized");
        collateral.withdraw(
            _entryId,
            address(this),
            _amount,
            _oracleData
        );

        _withdrawTransfer(_to, _amount);
    }

    /**
        @dev Convert the WETH to ETH and transfer the ETH

        @param _to The beneficiary of the ETH
        @param _amount The amount of ETH to be transfer
    */
    function _withdrawTransfer(
        address payable _to,
        uint256 _amount
    ) internal {
        weth.withdraw(_amount);
        _to.transfer(_amount);
    }

    /**
        @dev Use to receive ETH
    */
    fallback() external payable { }
    receive() external payable { }

    /**
        @dev Use to receive ERC721 token
    */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
