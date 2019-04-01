pragma solidity ^0.5.6;

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
        uint256 _minReturn
    ) internal returns (uint256 amount) {
        require(_fromToken.approve(address(_converter), _fromAmount));
        uint256 prevToBalance = _toToken.balanceOf(address(this));

        amount = _converter.convertFrom(
            _fromToken,
            _toToken,
            _fromAmount,
            _minReturn
        );

        require(_fromToken.clearApprove(address(_converter)));
        require(amount >= _minReturn);
        require(amount <= _toToken.balanceOf(address(this)).sub(prevToBalance));
    }

    function safeConvertTo(
        TokenConverter _converter,
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _maxPull,
        uint256 _return
    ) internal returns (uint256 sold) {
        require(_fromToken.approve(address(_converter), _maxPull));

        uint256 prevFromBalance = _fromToken.balanceOf(address(this));
        uint256 prevToBalance = _toToken.balanceOf(address(this));

        sold = _converter.convertTo(
            _fromToken,
            _toToken,
            _maxPull,
            _return
        );

        require(_fromToken.clearApprove(address(_converter)));
        require(_maxPull >= sold);
        require(_return <= _toToken.balanceOf(address(this)).sub(prevToBalance));
        require(sold == prevFromBalance.sub(_fromToken.balanceOf(address(this))));
    }

    function safeConverterToMax(
        TokenConverter _converter,
        IERC20 _fromToken,
        IERC20 _toToken,
        uint256 _maxPull,
        uint256 _return
    ) internal returns (uint256 bought, uint256 sold) {
        uint256 maxReturn = _converter.getReturn(_fromToken, _toToken, _maxPull);

        if (maxReturn < _return) {
            sold = _maxPull;
            bought = _converter.safeConvertFrom(
                _fromToken,
                _toToken,
                _maxPull,
                0
            );

            if (bought > _return) {
                // Ups... how could this happen
                uint256 diff = bought - _return;
                bought = bought.sub(diff);
                sold = sold.sub(
                    _converter.safeConvertFrom(
                        _toToken,
                        _fromToken,
                        diff,
                        0
                    )
                );
            }

            require(_maxPull >= sold);
        } else {
            sold = _converter.safeConvertTo(
                _fromToken,
                _toToken,
                _maxPull,
                _return
            );

            bought = _return;
        }
    }
}
