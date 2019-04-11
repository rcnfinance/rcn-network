pragma solidity ^0.5.6;

import "./../../interfaces/IERC20.sol";
import "./../../interfaces/TokenConverter.sol";

import "./../../utils/SafeERC20.sol";


contract TestConverter is TokenConverter {
    using SafeERC20 for IERC20;

    uint256 public collateralRate;
    mapping(address => mapping(address => uint256)) public fromToRate;
    uint256 constant private WEI = 10**18;

    event ConvertFrom(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount, uint256 _amount, uint256 _rate);
    event ConvertTo(IERC20 _fromToken, IERC20 _toToken, uint256 _return, uint256 _sold, uint256 _rate);
    event SetRate(address _fromToken, address _toToken, uint256 _rate);

    function setRate(
        address _fromToken,
        address _toToken,
        uint256 _rate
    ) external {
        fromToRate[_fromToken][_toToken] = _rate;
        emit SetRate(_fromToken, _toToken, _rate);
    }

    function getReturn(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount
    ) external view returns (uint256 amount) {
        (amount,) = _getReturn(_fromToken, _toToken, _fromAmount);
    }

    function _getReturn(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount
    ) internal view returns (uint256 amount, uint256 rate) {
        rate = fromToRate[address(_fromToken)][address(_toToken)];
        amount = (rate * _fromAmount) / WEI;
    }

    function convertFrom(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount,
        uint256 _minReturn
    ) external returns (uint256) {
        (uint256 amount, uint256 rate) = _getReturn(_fromToken, _toToken, _fromAmount);
        require(_fromToken.safeTransferFrom(msg.sender, address(this), _fromAmount), "Error pulling tokens");
        require(_toToken.safeTransfer(msg.sender, amount), "Error pulling tokens");
        emit ConvertFrom(_fromToken, _toToken, _fromAmount, amount, rate);
        return amount;
    }

    function convertTo(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _maxPull,
        uint256 _return
    ) external returns (uint256) {
        (uint256 sold, uint256 rate) = _getReturn(_toToken, _fromToken, _return);
        //sold = (_return * WEI) / amount;
        require(_fromToken.safeTransferFrom(msg.sender, address(this), sold), "Error pulling tokens");
        require(_toToken.safeTransfer(msg.sender, _return), "Error pulling tokens");
        emit ConvertTo(_fromToken, _toToken, _return, sold, rate);
        return sold;
    }
}
