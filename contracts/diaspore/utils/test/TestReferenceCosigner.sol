pragma solidity ^0.4.19;

import "./../../../examples/ReferenceCosigner.sol";
import "./../../../interfaces/Token.sol";


contract TestReferenceCosigner is ReferenceCosigner {
    constructor(Token token) ReferenceCosigner(token) public {}

    function decodeCosignerData(
        bytes _data
    ) public view returns (uint128, uint16, uint64, uint64) {
        return _decodeCosignerData(_data);
    }

    function currencyToToken(
        address _oracle,
        uint256 _amount,
        bytes _oracleData
    ) public view returns (uint256) {
        return _currencyToToken(_oracle, _amount, _oracleData);
    }
}
