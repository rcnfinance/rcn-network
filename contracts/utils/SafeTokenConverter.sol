pragma solidity ^0.5.11;

import "../interfaces/TokenConverter.sol";
import "../interfaces/IERC20.sol";
import "./SafeERC20.sol";
import "./SafeMath.sol";


library SafeTokenConverter {
    using SafeTokenConverter for TokenConverter;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    function safeConvertFrom(
        TokenConverter _converter,
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _fromAmount,
        uint256 _minReceive
    ) internal returns (uint256 received) {
        if (address(_fromToken) == address(_toToken)) {
            received = _fromAmount;
        } else {
            require(_fromToken.safeApprove(address(_converter), _fromAmount), "error approving converter");
            uint256 prevToBalance = _toToken.balanceOf(address(this));

            _converter.convertFrom(
                _fromToken,
                _toToken,
                _fromAmount,
                _minReceive
            );

            require(_fromToken.clearApprove(address(_converter)), "error clearing approve");
            received = _toToken.balanceOf(address(this)).sub(prevToBalance);
        }

        require(received >= _minReceive, "_minReceived not reached");
    }

    function safeConvertTo(
        TokenConverter _converter,
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _toAmount,
        uint256 _maxSpend
    ) internal returns (uint256 spend) {
        if (address(_fromToken) == address(_toToken)) {
            spend = _toAmount;
        } else {
            require(_fromToken.safeApprove(address(_converter), _maxSpend), "error approving converter");

            uint256 prevFromBalance = _fromToken.balanceOf(address(this));
            uint256 prevToBalance = _toToken.balanceOf(address(this));

            _converter.convertTo(
                _fromToken,
                _toToken,
                _toAmount,
                _maxSpend
            );

            require(_fromToken.clearApprove(address(_converter)), "error clearing approve");
            spend = prevFromBalance.sub(_fromToken.balanceOf(address(this)));
            require(_toToken.balanceOf(address(this)).sub(prevToBalance) >= _toAmount, "_toAmount not received");
        }

        require(spend <= _maxSpend, "_maxSpend exceeded");
    }

    function safeConvertToMax(
        TokenConverter _converter,
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _toAmount,
        uint256 _maxSpend
    ) internal returns (uint256 received, uint256 spend) {
        if (address(_fromToken) == address(_toToken)) {
            uint256 min = _maxSpend < _toAmount ? _maxSpend : _toAmount;
            return (min, min);
        }

        uint256 maxReceive = _converter.getPriceConvertFrom(_fromToken, _toToken, _maxSpend);

        if (maxReceive < _toAmount) {
            spend = _maxSpend;
            received = _converter.safeConvertFrom(
                _fromToken,
                _toToken,
                _maxSpend,
                maxReceive
            );

            if (received > _toAmount) {
                // Ups... how could this happen
                uint256 diff = received - _toAmount;
                received = received.sub(diff);
                spend = spend.sub(
                    _converter.safeConvertFrom(
                        _toToken,
                        _fromToken,
                        diff,
                        0
                    )
                );

                require(_maxSpend >= spend, "Should not pull more than the _maxSpend");
            }
        } else {
            spend = _converter.safeConvertTo(
                _fromToken,
                _toToken,
                _toAmount,
                _maxSpend
            );

            received = _toAmount;
        }
    }
}
