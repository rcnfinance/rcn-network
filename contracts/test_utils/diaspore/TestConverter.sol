pragma solidity ^0.5.6;

import "./../../interfaces/IERC20.sol";
import "./../../interfaces/TokenConverter.sol";

import "./../../utils/SafeERC20.sol";


contract TestConverter {
    using SafeERC20 for IERC20;

    uint256 public collateralRate;
    uint256 constant private WEI = 10**18;

    event ConvertFrom(uint256 _fromAmount, uint256 amount);
    event ConvertTo(uint256 _return, uint256 sold);

    function setCollateralRate(uint256 _collateralRate) external {
        collateralRate = _collateralRate;
    }

    function getReturn(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount
    ) external view returns (uint256 amount) {
        return _getReturn(_fromToken, _toToken, _fromAmount);
    }

    function _getReturn(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount
    ) internal view returns (uint256 amount) {
        return (collateralRate * _fromAmount) / WEI;
    }

    function convertFrom(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount,
        uint256 _minReturn
    ) external returns (uint256 amount) {
        amount = _getReturn(_fromToken, _toToken, _fromAmount);
        require(_fromToken.safeTransferFrom(msg.sender, address(this), _fromAmount), "Error pulling tokens");
        require(_toToken.safeTransfer(msg.sender, amount), "Error pulling tokens");
        emit ConvertFrom(_fromAmount, amount);
    }

    function convertTo(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _maxPull,
        uint256 _return
    ) external returns (uint256 sold) {
        sold =  (_return * WEI) / _getReturn(_fromToken, _toToken, WEI);
        require(_fromToken.safeTransferFrom(msg.sender, address(this), sold), "Error pulling tokens");
        require(_toToken.safeTransfer(msg.sender, _return), "Error pulling tokens");
        emit ConvertTo(_return, sold);
    }
}
