pragma solidity ^0.5.8;

import "../../../interfaces/TokenConverter.sol";

import "../../../commons/Ownable.sol";
import "../../../utils/SafeERC20.sol";
import "../../../utils/SafeTokenConverter.sol";


contract RcnBurner is Ownable {
    using SafeTokenConverter for TokenConverter;
    using SafeERC20 for IERC20;

    event SetConverter(TokenConverter _converter);
    event SetToken(IERC20 _token);

    event BuyToken(uint256 _sold, uint256 _bought);
    event Burn(uint256 _amount);

    TokenConverter public converter;
    IERC20 public token;

    function setConverter(TokenConverter _converter) external onlyOwner {
        converter = _converter;
        emit SetConverter(_converter);
    }

    function setToken(IERC20 _token) external onlyOwner {
        token = _token;
        emit SetToken(_token);
    }

    function batchBurn(IERC20[] calldata _tokens) external {
        uint256 i;
        uint256 tokenLength = _tokens.length;

        for (; i < tokenLength; i++)
            _convert(_tokens[i]);

        _burn();
    }

    function burn(IERC20 _token) external {
        _convert(_token);
        _burn();
    }

    function _convert(IERC20 _token) internal {
        if(_token == token)
            return;

        uint256 balance = _token.balanceOf(address(this));
        uint256 bought = converter.safeConvertFrom(
            _token,
            token,
            balance,
            0
        );
        emit BuyToken(balance, bought);
    }

    function _burn() internal {
        uint256 balance = token.balanceOf(address(this));
        require(token.safeTransfer(address(0), balance), "Error sending tokens");
        emit Burn(balance);
    }
}
