pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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
    ) internal returns (uint256 paid, uint256 paidToken, uint256 burnToken) {
        IERC20 token = IERC20(_manager.token());
        DebtEngine engine = DebtEngine(_manager.debtEngine());
        token.safeApprove(address(engine), _amount);

        uint256 prevBalance = token.balanceOf(address(this));

        (paid, paidToken, burnToken) = engine.payToken(
            _id,
            _amount - engine.toFee(_id, _amount),
            _sender,
            _oracleData
        );

        token.safeApprove(address(engine), 0);
        require(prevBalance.sub(token.balanceOf(address(this))) <= paidToken.add(burnToken), "Debt engine pulled too many tokens");
    }
}