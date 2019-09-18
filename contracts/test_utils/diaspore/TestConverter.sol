pragma solidity ^0.5.8;

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

    function convertFrom(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount,
        uint256 // _minReceive
    ) external payable returns (uint256 received) {
        uint256 rate;
        (received, rate) = _getPriceConvertFrom(_fromToken, _toToken, _fromAmount);
        require(_fromToken.safeTransferFrom(msg.sender, address(this), _fromAmount), "Error pulling tokens");
        require(_toToken.safeTransfer(msg.sender, received), "Error pulling tokens");

        emit ConvertFrom(_fromToken, _toToken, _fromAmount, received, rate);
    }

    function convertTo(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _toAmount,
        uint256 // _maxSpend
    ) external payable returns (uint256 spend) {
        uint256 rate;
        (spend, rate) = _getPriceConvertTo(_fromToken, _toToken, _toAmount);
        require(_fromToken.safeTransferFrom(msg.sender, address(this), spend), "Error pulling tokens");
        require(_toToken.safeTransfer(msg.sender, _toAmount), "Error pulling tokens");

        emit ConvertTo(_fromToken, _toToken, spend, _toAmount, rate);
    }

    function getPriceConvertFrom(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount
    ) external view returns (uint256 receive) {
        (receive,) = _getPriceConvertFrom(_fromToken, _toToken, _fromAmount);
    }

    function _getPriceConvertFrom(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount
    ) internal view returns (uint256 receive, uint256 rate) {
        rate = fromToRate[address(_fromToken)][address(_toToken)];
        require(rate != 0, "The rate should not be 0");
        receive = (rate * _fromAmount) / WEI;
    }

    function getPriceConvertTo(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _toAmount
    ) external view returns (uint256 spend) {
        (spend,) = _getPriceConvertFrom(_fromToken, _toToken, _toAmount);
    }

    function _getPriceConvertTo(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _toAmount
    ) internal view returns (uint256 spend, uint256 rate) {
        rate = fromToRate[address(_toToken)][address(_fromToken)];
        require(rate != 0, "The rate should not be 0");
        spend = divceil(rate * _toAmount, WEI);
    }

    function divceil(uint256 x, uint256 y) internal pure returns(uint256 z) {
        z = x / y;
        z = x % y == 0 ? z : z + 1;
    }
}
