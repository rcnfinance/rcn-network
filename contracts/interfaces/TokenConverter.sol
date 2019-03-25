pragma solidity ^0.5.6;

import "./IERC20.sol";


interface TokenConverter {
    function getReturn(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount
    ) external view returns (uint256 amount);

    function convertFrom(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount,
        uint256 _minReturn
    ) external returns (uint256 amount);

    function convertTo(
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _maxPull,
        uint256 _return
    ) external returns (uint256 sold);
}
