pragma solidity ^0.8.12;

import "../../cosigner/CollateralAuction.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract TestAuctionCallback {
    bool public callbackCalled;
    bool public tryReentrancy;

    IERC20 public requireToken;
    uint256 public requireBalance;

    IERC20 public requireToken2;
    uint256 public requireBalance2;

    function setTryReentrancy(bool _flag) external {
        tryReentrancy = _flag;
    }

    function onTake(address, uint256, uint256) external {
        callbackCalled = true;

        require(requireToken.balanceOf(address(this)) == requireBalance);
        require(requireToken2.balanceOf(address(this)) == requireBalance2);

        if (tryReentrancy) {
            (bool result, bytes memory data) = msg.sender.call(
                abi.encodeWithSignature(
                    "take(uint256,bytes,bool)",
                    0,
                    new bytes(0),
                    false
                )
            );

            require(result, string(data));
        }
    }

    function take(
        CollateralAuction _auction,
        uint256 _id,
        bytes calldata _data
    ) external {
        IERC20 token = _auction.baseToken();

        (uint256 selling, uint256 requesting) = _auction.offer(_id);
        token.approve(address(_auction), requesting);

        (IERC20 buyingToken,,,,,) = _auction.auctions(_id);
        requireToken = buyingToken;
        requireBalance = selling;

        requireToken2 = _auction.baseToken();
        requireBalance2 = requireToken2.balanceOf(address(this));

        _auction.take(
            _id,
            _data,
            true
        );
    }
}
