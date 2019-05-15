pragma solidity ^0.5.6;

import "./../../interfaces/IERC20.sol";
import "./../../interfaces/TokenConverter.sol";

import "./../../utils/SafeERC20.sol";


contract TestConverter is TokenConverter {
    using SafeERC20 for IERC20;

    uint256 public collateralRate;
    mapping(address => mapping(address => uint256)) public fromToRate;
    uint256 constant private WEI = 10**18;

    event ConvertFrom(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount, uint256 _toAmount, uint256 _rate);
    event ConvertTo(IERC20 _fromToken, IERC20 _toToken, uint256 _fromAmount, uint256 _toAmount, uint256 _rate);
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
    ) internal view returns (uint256 toAmount, uint256 rate) {
        rate = fromToRate[address(_fromToken)][address(_toToken)];
        require(rate != 0, "The rate should not be 0");
        toAmount = rate * _fromAmount / WEI;
    }

    function convertFrom(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount,
        uint256
    ) external returns (uint256) {
        (uint256 toAmount, uint256 rate) = _getReturn(_fromToken, _toToken, _fromAmount);
        require(_fromToken.safeTransferFrom(msg.sender, address(this), _fromAmount), "Error pulling tokens");
        require(_toToken.safeTransfer(msg.sender, toAmount), "Error pulling tokens");
        emit ConvertFrom(_fromToken, _toToken, _fromAmount, toAmount, rate);
        return toAmount;
    }

    function convertTo(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256,
        uint256 _toAmount
    ) external returns (uint256) {
        uint256 rate = fromToRate[address(_fromToken)][address(_toToken)];
        uint256 fromAmount = divceil(_toAmount * WEI, rate);

        require(_fromToken.safeTransferFrom(msg.sender, address(this), fromAmount), "Error pulling tokens");
        require(_toToken.safeTransfer(msg.sender, _toAmount), "Error pulling tokens");
        emit ConvertTo(_fromToken, _toToken, fromAmount, _toAmount, rate);
        return fromAmount;
    }

    function divceil(uint256 x, uint256 y) internal pure returns(uint256 z) {
        z = x / y;
        z = x % y == 0 ? z : z + 1;
    }
}
