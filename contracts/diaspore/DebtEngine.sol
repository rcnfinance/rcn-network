pragma solidity ^0.4.24;

import "./../interfaces/Token.sol";
import "./../interfaces/Cosigner.sol";
import "./../utils/ERC721Base.sol";
import "./interfaces/Model.sol";

interface IOracle {
    function getRate(bytes32 symbol, bytes data) external returns (uint256 rate, uint256 decimals);
}

contract DebtEngine is ERC721Base {
    event Created(bytes32 indexed _id, uint256 _nonce, bytes32[] _data);
    event Created2(bytes32 indexed _id, uint256 _nonce, bytes32[] _data);
    event Paid(bytes32 indexed _id, address _sender, address _origin, uint256 _requested, uint256 _requestedTokens, uint256 _paid, uint256 _tokens);
    event ReadedOracle(bytes32 indexed _id, address _oracle, bytes32 _currency, uint256 _amount, uint256 _decimals);
    event Withdrawn(bytes32 indexed _id, address _sender, address _to, uint256 _amount);

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

    constructor(Token _token) public {
        token = _token;
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

        emit Created({
            _id: id,
            _nonce: nonce,
            _data: data
        });
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

        emit Created2({
            _id: id,
            _nonce: nonce,
            _data: data
        });
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
            bytes32 currency = debt.currency;
            (uint256 rate, uint256 decimals) = oracle.getRate(currency, oracleData);
            emit ReadedOracle(id, oracle, currency, rate, decimals);
            paidToken = toToken(paid, rate, decimals);
        } else {
            paidToken = paid;
        }

        // Pull tokens from payer
        require(token.transferFrom(msg.sender, address(this), paidToken), "Error pulling payment tokens");

        // Add balance to the debt
        uint256 newBalance = paidToken.add(debt.balance);
        require(newBalance < 340282366920938463463374607431768211456, "uint128 Overflow");
        debt.balance = uint128(newBalance);

        // Emit pay event
        emit Paid({
            _id: id,
            _sender: msg.sender,
            _origin: origin,
            _requested: amount,
            _requestedTokens: 0,
            _paid: paid,
            _tokens: paidToken
        });
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
            // TODO: Fix double storage read debt.currency
            emit ReadedOracle(id, oracle, debt.currency, rate, decimals);
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
        // WARNING: Reusing variable **available**
        available = paidToken.add(debt.balance);
        require(available < 340282366920938463463374607431768211456, "uint128 Overflow");
        debt.balance = uint128(available);

        // Emit pay event
        emit Paid({
            _id: id,
            _sender: msg.sender,
            _origin: origin,
            _requested: 0,
            _requestedTokens: amount,
            _paid: paid,
            _tokens: paidToken
        });
    }

    /**
        Converts an amount in the rate currency to an amount in token

        @param amount Amount to convert in rate currency
        @param rate Rate to use in the convertion
        @param decimals Base difference between rate and tokens

        @return Amount in tokens
    */
    function toToken(uint256 amount, uint256 rate, uint256 decimals) internal pure returns (uint256) {
        require(decimals <= 18, "Decimals limit reached");
        return rate.mult(amount).mult((10 ** (18 - decimals))) / 1000000000000000000;
    }

    /**
        Converts an amount in token to the rate currency

        @param amount Amount to convert in token
        @param rate Rate to use in the convertion
        @param decimals Base difference between rate and tokens

        @return Amount in rate currency
    */
    function fromToken(uint256 amount, uint256 rate, uint256 decimals) internal pure returns (uint256) {
        require(decimals <= 18, "Decimals limit reached");
        return (amount.mult(1000000000000000000) / rate) / 10 ** (18 - decimals);
    }

    function withdrawal(bytes32 id, address to) external returns (uint256 amount) {
        require(_isAuthorized(msg.sender, uint256(id)), "Sender not authorized");
        Debt storage debt = debts[id];
        amount = debt.balance;
        debt.balance = 0;
        require(token.transfer(to, amount), "Error sending tokens");
        emit Withdrawn({
            _id: id,
            _sender: msg.sender,
            _to: to,
            _amount: amount
        });
    }

    function withdrawalList(bytes32[] ids, address to) external returns (uint256 amount) {
        bytes32 target;
        uint256 balance;
        for (uint256 i = 0; i < ids.length; i++) {
            target = ids[i];
            if(_isAuthorized(msg.sender, uint256(target))) {
                balance = debts[target].balance;
                debts[target].balance = 0;
                amount += balance;
                emit Withdrawn({
                    _id: target,
                    _sender: msg.sender,
                    _to: to,
                    _amount: balance
                });
            }
        }
        require(token.transfer(to, amount), "Error sending tokens");
    }

    function getStatus(bytes32 id) external view returns (uint256) {
        // TODO: Check and return error
        return debts[id].model.getStatus(id);
    }
}
