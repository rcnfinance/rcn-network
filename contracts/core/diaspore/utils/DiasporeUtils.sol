pragma solidity ^0.5.6;

import "../interfaces/RateOracle.sol";
import "../LoanManager.sol";


library DiasporeUtils {
    function amountToToken(
        LoanManager _manager,
        bytes32 _id,
        bytes memory _oracleData,
        uint256 _amount
    ) internal returns (uint256) {
        RateOracle oracle = RateOracle(_manager.getOracle(_id));
        uint256 amount = _manager.getAmount(_id);

        if (address(oracle) == address(0)) {
            return amount;
        } else {
            (uint256 tokens, uint256 equivalent) = oracle.readSample(_oracleData);
            return (tokens * amount) / equivalent;
        }
    }
}
