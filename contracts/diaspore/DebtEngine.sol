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

    event Created(bytes32 indexed _id, uint256 _nonce, bytes32[] _data);
    event Created2(bytes32 indexed _id, uint256 _nonce, bytes32[] _data);
    event Paid(bytes32 indexed _id, address _sender, address _origin, uint256 _requested, uint256 _requestedTokens, uint256 _paid, uint256 _tokens);
    event ReadedOracle(bytes32 indexed _id, address _oracle, bytes32 _currency, uint256 _amount, uint256 _decimals);
    event Withdrawn(bytes32 indexed _id, address _sender, address _to, uint256 _amount);
    event Error(bytes32 indexed _id, address _sender, uint256 _value, uint256 _gasLeft, uint256 _gasLimit, bytes _callData);

    Token public token;

    mapping(bytes32 => Debt) public debts;
    mapping(address => uint256) public nonces;

    struct Debt {
        bool error;
        bytes8 currency;
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
        bytes8 currency,
        bytes32[] data
    ) external returns (bytes32 id) {
        uint256 nonce = nonces[msg.sender]++;
        id = _buildId(msg.sender, nonce, false);

        debts[id] = Debt({
            error: false,
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
        bytes8 currency,
        uint256 nonce,
        bytes32[] data
    ) external returns (bytes32 id) {
        id = _buildId(msg.sender, nonce, true);

        debts[id] = Debt({
            error: false,
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
        if (debt.error) delete debt.error;

        // Paid only required amount
        paid = _safePay(id, debt.model, amount);
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
        if (debt.error) delete debt.error;

        // Read storage
        IOracle oracle = IOracle(debt.oracle);

        // WARNING: Using **paidToken** as **rate**
        uint256 decimals;
        uint256 available;

        // Get available <currency> amount
        if (oracle != address(0)) {
            bytes32 currency = debt.currency;
            // Real:
            // (rate, decimals) = oracle.getRate(currency, oracleData);
            // emit ReadedOracle(id, oracle, currency, rate, decimals);
            // available = fromToken(amount, rate, decimals);
            (paidToken, decimals) = oracle.getRate(currency, oracleData);
            emit ReadedOracle(id, oracle, currency, paidToken, decimals);
            available = fromToken(amount, paidToken, decimals);
        } else {
            available = amount;
        }

        // Call addPaid on model
        paid = _safePay(id, debt.model, available);
        require(paid <= available, "Paid can't exceed available");

        // Convert back to required pull amount
        if (oracle != address(0)) {
            // Real:
            // (paidToken = toToken(paid, rate, decimals);
            paidToken = toToken(paid, paidToken, decimals);
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

    function _safePay(
        bytes32 _id,
        Model _model,
        uint256 _available
    ) internal returns (uint256) {
        (uint256 success, bytes32 paid) = _safeGasCall(
            _model,
            abi.encodeWithSelector(
                _model.addPaid.selector,
                _id,
                _available
            )
        );

        if (success != 0) {
            return uint256(paid);
        } else {
            emit Error({
                _id: _id,
                _sender: msg.sender,
                _value: msg.value,
                _gasLeft: gasleft(),
                _gasLimit: block.gaslimit,
                _callData: msg.data
            });
            debts[_id].error = true;
        }
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

    function run(bytes32 _id) external returns (bool) {
        Debt storage debt = debts[_id];
        if (debt.error) delete debt.error;

        (uint256 success, bytes32 result) = _safeGasCall(
            debt.model,
            abi.encodeWithSelector(
                debt.model.run.selector,
                _id
            )
        );

        if (success != 0) {
            return result == bytes32(1);
        } else {
            emit Error({
                _id: _id,
                _sender: msg.sender,
                _value: 0,
                _gasLeft: gasleft(),
                _gasLimit: block.gaslimit,
                _callData: msg.data
            });
            debt.error = true;
        }
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

    function getStatus(bytes32 _id) external view returns (uint256) {
        Debt storage debt = debts[_id];
        if (debt.error) {
            return 4;
        } else {
            (uint256 success, bytes32 result) = _safeGasStaticCall(
                debt.model,
                abi.encodeWithSelector(debt.model.getStatus.selector, _id)
            );
            return success == 1 ? uint256(result) : 4;
        }
    }

    function _safeGasStaticCall(
        address _contract,
        bytes _data
    ) internal view returns (uint256 success, bytes32 result) {
        uint256 _gas = (block.gaslimit * 80) / 100;
        _gas = gasleft() < _gas ? gasleft() : _gas;
        assembly {
            let x := mload(0x40)
            success := staticcall(
                            _gas,                 // Send almost all gas
                            _contract,            // To addr
                            add(0x20, _data),     // Input is data past the first 32 bytes
                            mload(_data),         // Input size is the lenght of data
                            x,                    // Store the ouput on x
                            0x20                  // Output is a single bytes32, has 32 bytes
                        )

            result := mload(x)
        }
    }

    function _safeGasCall(
        address _contract,
        bytes _data
    ) internal returns (uint256 success, bytes32 result) {
        uint256 _gas = (block.gaslimit * 80) / 100;
        _gas = gasleft() < _gas ? gasleft() : _gas;
        assembly {
            let x := mload(0x40)
            success := call(
                            _gas,                 // Send almost all gas
                            _contract,            // To addr
                            0,                    // Send ETH
                            add(0x20, _data),     // Input is data past the first 32 bytes
                            mload(_data),         // Input size is the lenght of data
                            x,                    // Store the ouput on x
                            0x20                  // Output is a single bytes32, has 32 bytes
                        )

            result := mload(x)
        }
    }
}
