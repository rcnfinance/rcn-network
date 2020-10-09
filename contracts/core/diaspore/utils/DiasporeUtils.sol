pragma solidity ^0.6.6;

import "../../../utils/SafeERC20.sol";
import "../../../utils/SafeMath.sol";
import "../../../interfaces/IERC20.sol";
import "../interfaces/RateOracle.sol";
import "../interfaces/Model.sol";
import "../LoanManager.sol";
import "../DebtEngine.sol";


library DiasporeUtils {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    function oracle(
        LoanManager _manager,
        bytes32 _id
    ) internal view returns (RateOracle) {
        return RateOracle(_manager.getOracle(_id));
    }

    function safePayToken(
        LoanManager _manager,
        bytes32 _id,
        uint256 _amount,
        address _sender,
        bytes memory _oracleData
    ) internal returns (uint256 paid, uint256 tokens) {
        IERC20 token = IERC20(_manager.token());
        DebtEngine engine = DebtEngine(_manager.debtEngine());
        require(token.safeApprove(address(engine), _amount), "Error approve debt engine");

        uint256 prevBalance = token.balanceOf(address(this));

        (paid, tokens) = engine.payToken(
            _id,
            _amount,
            _sender,
            _oracleData
        );

        require(token.clearApprove(address(engine)), "Error clear approve");
        require(prevBalance.sub(token.balanceOf(address(this))) <= tokens, "Debt engine pulled too many tokens");
    }
}
