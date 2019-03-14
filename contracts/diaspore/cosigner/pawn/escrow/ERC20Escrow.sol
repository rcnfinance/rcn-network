pragma solidity ^0.5.0;

import "./../../../../interfaces/Token.sol";
import "./../../../../interfaces/IERC721Base.sol";
import "./../../../interfaces/RateOracle.sol";
import "./../../../interfaces/ILoanManager.sol";
import "./../interfaces/IEscrow.sol";
import "./../interfaces/IPawnManager.sol";
import "./../interfaces/IBundle.sol";
import "./../interfaces/IPoach.sol";

import "./../../../../utils/BytesUtils.sol";
import "./../../../../utils/SafeMath.sol";


contract ERC20Escrow is IEscrow, BytesUtils {
    using SafeMath for uint256;

    uint256 public constant L_DATA = 20 + 32; // oracle + liquidationRatio

    IPawnManager pawnManager;
    IBundle public bundle;
    IPoach public poach;

    mapping(uint256 => Config) public configs; // pawnId to config of escrow

    struct Config {
        RateOracle oracle; // Convert the currency of loan to currency of poach and vice versa
        uint256 liquidationRatio; // Ratio at which a the escrow can liquidate the asset
    }

    modifier onlyPawnManager {
        require(msg.sender == address(pawnManager), "Only the PawnManager is allowed");
        _;
    }

    function validate(bytes calldata _oracleData, bytes calldata _data) external returns (bool) {
        (address oracle, uint256 liquidationRatio) = _decodeData(_data);
        require(oracle != address(0), "The oracle should not be 0");

        return true;
    }

    function request(uint256 _pawnId, bytes32 _loanId, bytes calldata _data) external onlyPawnManager returns(bool) {
        (address oracle, uint256 liquidationRatio) = _decodeData(_data);
        require(oracle != address(0), "The oracle should not be 0");

        configs[_pawnId] = Config({
            oracle: RateOracle(oracle),
            liquidationRatio: liquidationRatio
        });
    }

    function create(
        uint256 _pawnId,
        bytes32 _loanId,
        address _loanManager,
        bytes calldata _data,
        bytes calldata _oracleData
    ) external onlyPawnManager returns(bool) {
        Config storage config = configs[_pawnId];

        ( , , , , uint256 _packageId) = pawnManager.getPawn(_pawnId);

        (IERC721Base erc721, uint256 pairId) = bundle.aContent(_packageId, 0);
        require(IPoach(address(erc721)) == poach, "The ERC721 its not the IPoach");
        ( , uint256 pairBalance) = poach.getPair(pairId);

        uint256 closingObligation = ILoanManager(_loanManager).getClosingObligation(_loanId);
        uint256 needAmount = _tokenNeedToLiquidation(closingObligation, config.liquidationRatio, config.oracle, _oracleData);
        require(pairBalance >= needAmount, "");
    }

    function _tokenNeedToLiquidation(
        uint256 _amount,
        uint256 _liquidationRatio,
        RateOracle _oracle,
        bytes memory _oracleData
    ) internal returns (uint256 result) {
        (uint256 tokens, uint256 equivalent) = _oracle.readSample(_oracleData);
        // emit ReadedOracle(id, tokens, equivalent);
        require(tokens != 0, "Oracle provided invalid rate");
        uint256 aux = tokens.mult(_amount);
        result = aux / equivalent;
        if (aux % equivalent > 0)
            result = result.add(1);

        return (100000 + _liquidationRatio).mult(result) / 100000;
    }

    function _decodeData(
        bytes memory _data
    ) internal pure returns (address, uint256) {
        require(_data.length == L_DATA, "Invalid data length");
        (
            bytes32 oracle,
            bytes32 liquidationRatio
        ) = decode(_data, 20, 32);
        return (address(uint160(uint256(oracle))), uint256(liquidationRatio));
    }
}
