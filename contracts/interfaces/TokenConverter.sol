pragma solidity ^0.4.19;

import "./interfaces/IERC721.sol";


interface TokenConverter {
    function getReturn(
        IERC721 _fromToken,
        IERC721 _toToken,
        uint256 _fromAmount
    ) external view returns (uint256 amount);

    function convertFrom(
        IERC721 _fromToken,
        IERC721 _toToken,
        uint256 _fromAmount,
        uint256 _minReturn
    ) external returns (uint256 amount);

    function convertTo(
        IERC721 _fromToken,
        IERC721 _toToken,
        uint256 _maxPull,
        uint256 _return
    ) external returns (uint256 sold);
}
