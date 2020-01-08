pragma solidity ^0.5.11;

import "../../../core/diaspore/cosigner/interfaces/CollateralHandler.sol";
import "../../../interfaces/IERC20.sol";


contract TestCollateralHandler is CollateralHandler {

    function encode(
        IERC20 _token,
        uint256 surplus
    ) external pure returns (bytes memory) {
        return abi.encode(_token, surplus);
    }

    function handle(
        uint256,
        uint256,
        bytes calldata _data
    ) external returns (uint256) {
        (IERC20 token, uint256 surplus) = abi.decode(_data, (IERC20, uint256));

        token.approve(msg.sender, surplus);

        // Keep the collateral and return 0 surplus
        return surplus;
    }
}
