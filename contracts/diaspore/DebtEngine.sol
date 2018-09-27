pragma solidity ^0.4.24;

import "./../interfaces/Token.sol";
import "./../interfaces/Cosigner.sol";
import "./../utils/ERC721Base.sol";
import "./interfaces/Model.sol";

interface IOracle {
    function getRate(bytes32 symbol, bytes data) external returns (uint256 rate, uint256 decimals);
}

contract DebtEngine is ERC721Base {
    uint256 constant internal TOKEN_DECIMALS = 18;
    uint256 constant internal PRECISION = 10 ** TOKEN_DECIMALS;

    Token public token;

    mapping(bytes32 => Debt) public debts;
    mapping(address => uint256) public nonces;

    struct Debt {
        bytes16 currency;
        uint128 balance;
        Model model;
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
        Model model,
        address owner,
        address oracle,
        bytes16 currency,
        bytes32[] data
    ) external returns (bytes32 id) {
        uint256 nonce = nonces[msg.sender]++;
        id = _buildId(msg.sender, nonce, false);

        debts[id] = Debt({
            currency: currency,
            balance: 0,
            creator: msg.sender,
            model: model,
            oracle: oracle
        });

        _generate(uint256(id), owner);
        require(model.create(id, data), "Error creating debt in model");
    }

    function create2(
        Model model,
        address owner,
        address oracle,
        bytes16 currency,
        uint256 nonce,
        bytes32[] data
    ) external returns (bytes32 id) {
        id = _buildId(msg.sender, nonce, true);

        debts[id] = Debt({
            currency: currency,
            balance: 0,
            creator: msg.sender,
            model: model,
            oracle: oracle
        });

        _generate(uint256(id), owner);
        require(model.create(id, data), "Error creating debt in model");
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

    function pay(
        bytes32 id,
        uint256 amount,
        address origin,
        bytes oracleData
    ) external returns (uint256 paid, uint256 paidToken) {
        Debt storage debt = debts[id];

        // Paid only required amount
        paid = debt.model.addPaid(id, amount);
        require(paid <= amount, "Paid can't be more than requested");

        IOracle oracle = IOracle(debt.oracle);
        if (oracle != address(0)) {
            // Convert
            (uint256 rate, uint256 decimals) = oracle.getRate(debt.currency, oracleData);
            paidToken = toToken(paid, rate, decimals);
        } else {
            paidToken = paid;
        }

        // Pull tokens from payer
        require(token.transferFrom(msg.sender, address(this), paidToken), "Error pulling payment tokens");

        // Add balance to the debt
        uint256 newBalance = paidToken.add(debt.balance);
        require(newBalance < 340282366920938463463374607431768211456, "uin128 Overflow");
        debt.balance = uint128(newBalance);
    }

    function payToken(
        bytes32 id,
        uint256 amount,
        address origin,
        bytes oracleData
    ) external returns (uint256 paid, uint256 paidToken) {
        Debt storage debt = debts[id];

        // Read storage
        IOracle oracle = IOracle(debt.oracle);

        uint256 rate;
        uint256 decimals;
        uint256 available;

        // Get available <currency> amount
        if (oracle != address(0)) {
            (rate, decimals) = oracle.getRate(debt.currency, oracleData);
            available = fromToken(amount, rate, decimals);
        } else {
            available = amount;
        }

        // Pay the debt
        paid = debt.model.addPaid(id, available);
        require(paid <= available, "Paid can't exceed available");

        // Convert back to required pull amount
        if (oracle != address(0)) {
            paidToken = toToken(paid, rate, decimals);
            require(paidToken <= amount, "Paid can't exceed requested");
        } else {
            paidToken = paid;
        }

        // Pull tokens from payer
        require(token.transferFrom(msg.sender, address(this), paidToken), "Error pulling tokens");

        // Add balance to the debt
        uint256 newBalance = paidToken.add(debt.balance);
        require(newBalance < 340282366920938463463374607431768211456, "uin128 Overflow");
        debt.balance = uint128(newBalance);
    }

    /**
        Converts an amount in the rate currency to an amount in token

        @param amount Amount to convert in rate currency
        @param rate Rate to use in the convertion
        @param decimals Base difference between rate and tokens

        @return Amount in tokens
    */
    function toToken(uint256 amount, uint256 rate, uint256 decimals) internal pure returns (uint256) {
        require(decimals <= TOKEN_DECIMALS, "Decimals limit reached");
        return rate.mult(amount).mult((10 ** (TOKEN_DECIMALS - decimals))) / PRECISION;
    }

    /**
        Converts an amount in token to the rate currency

        @param amount Amount to convert in token
        @param rate Rate to use in the convertion
        @param decimals Base difference between rate and tokens

        @return Amount in rate currency
    */
    function fromToken(uint256 amount, uint256 rate, uint256 decimals) internal pure returns (uint256) {
        require(decimals <= TOKEN_DECIMALS, "Decimals limit reached");
        return amount.mult((10 ** (TOKEN_DECIMALS - decimals))) / (rate.mult(PRECISION));
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
