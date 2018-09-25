pragma solidity ^0.4.24;

import "./../interfaces/Token.sol";
import "./../interfaces/Oracle.sol";
import "./../interfaces/Cosigner.sol";
import "./../utils/ERC721Base.sol";
import "./interfaces/DebtModel.sol";
import "./interfaces/LoanRequester.sol";

contract DebtEngine is ERC721Base {
    Token public token;

    mapping(bytes32 => Debt) public debts;
    mapping(address => uint256) public nonces;

    struct Debt {
        bytes16 currency;
        uint128 balance;
        DebtModel model;
        address creator;
        address oracle;
    }

    function name() external pure returns (string _name) {
        _name = "RCN Debt Record";
    }

    function symbol() external pure returns (string _symbol) {
        _symbol = "RDR";
    }

    function create(
        DebtModel model,
        address owner,
        address oracle,
        bytes16 currency,
        bytes32[] loanData
    ) external returns (bytes32 id) {
        return _create(model, owner, oracle, currency, nonces[msg.sender]++, loanData);
    }

    function create2(
        DebtModel model,
        address owner,
        address oracle,
        bytes16 currency,
        uint256 nonce,
        bytes32[] loanData
    ) external returns (bytes32 id) {
        return _create(model, owner, oracle, currency, nonce, loanData);
    }

    function _create(
      DebtModel model,
      address owner,
      address oracle,
      bytes16 currency,
      uint256 nonce,
      bytes32[] loanData
    ) internal returns (bytes32 id) {
        id = _buildId(msg.sender, nonce, false);

        debts[id] = Debt({
            currency: currency,
            balance: 0,
            creator: msg.sender,
            model: model,
            oracle: oracle
        });

        _generate(uint256(id), owner);
        require(model.create(id, loanData), "Error creating debt in model");
    }

    function buildId(
        address creator,
        uint256 nonce,
        bool method2
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(creator, nonce, method2));
    }

    function _buildId(
        address creator,
        uint256 nonce,
        bool method2
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(creator, nonce, method2));
    }

    function pay(bytes32 id, uint256 amount, bytes oracleData) external returns (uint256 paid) {
        Debt storage debt = debts[id];

        // Paid only required amount
        paid = debt.model.addPaid(id, amount);

        // TODO: Convert from currency to tokens

        // Pull tokens from payer
        require(token.transferFrom(msg.sender, address(this), paid), "Error pulling payment tokens");
        debt.balance += uint128(paid);
    }

    function withdrawal(bytes32 id, address to) external returns (uint256 amount) {
        require(_isAuthorized(msg.sender, uint256(id)), "Sender not authorized");
        Debt storage debt = debts[id];
        amount = debt.balance;
        debt.balance = 0;
        require(token.transfer(to, amount), "Error sending tokens");
    }

    function withdrawalList(bytes32[] ids, address to) external returns (uint256 amount) {
        bytes32 target;
        for (uint256 i = 0; i < ids.length; i++) {
            target = ids[i];
            if(_isAuthorized(msg.sender, uint256(target))) {
                amount += debts[target].balance;
                debts[target].balance = 0;
            }
        }
        require(token.transfer(to, amount), "Error sending tokens");
    }
}
