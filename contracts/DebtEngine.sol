pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/Model.sol";
import "./interfaces/IDebtStatus.sol";
import "./interfaces/RateOracle.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


contract DebtEngine is ERC721, Ownable, IDebtStatus {
    using Address for address;
    using SafeMath for uint256;

    event Created(
        bytes32 indexed _id,
        uint256 _nonce,
        bytes _data
    );

    event Created2(
        bytes32 indexed _id,
        uint256 _salt,
        bytes _data
    );

    event Created3(
        bytes32 indexed _id,
        uint256 _salt,
        bytes _data
    );

    event Paid(
        bytes32 indexed _id,
        address _sender,
        address _origin,
        uint256 _requested,
        uint256 _requestedTokens,
        uint256 _paid,
        uint256 _tokens
    );

    event ChargeBurnFee(
        bytes32 indexed _id,
        uint256 _amount
    );

    event ReadedOracleBatch(
        address _oracle,
        uint256 _count,
        uint256 _tokens,
        uint256 _equivalent
    );

    event ReadedOracle(
        bytes32 indexed _id,
        uint256 _tokens,
        uint256 _equivalent
    );

    event PayBatchError(
        bytes32 indexed _id,
        address _targetOracle
    );

    event Withdrawn(
        bytes32 indexed _id,
        address _sender,
        address _to,
        uint256 _amount
    );

    event Error(
        bytes32 indexed _id,
        address _sender,
        uint256 _value,
        uint256 _gasLeft,
        uint256 _gasLimit,
        bytes _callData
    );

    event ErrorRecover(
        bytes32 indexed _id,
        address _sender,
        uint256 _value,
        uint256 _gasLeft,
        uint256 _gasLimit,
        bytes32 _result,
        bytes _callData
    );

    event SetBurner(address indexed _burner);
    event SetFee(uint128 _fee);

    IERC20 public immutable token;
    address public burner;
    uint128 public fee; // Fee is calculated FEE/BASE EX: 100/10000= 0.01 = 1%

    uint256 public constant BASE = 10000;
    uint256 private constant UINT_128_OVERFLOW = 340282366920938463463374607431768211456;

    mapping(bytes32 => Debt) public debts;
    mapping(address => uint256) public nonces;

    struct Debt {
        bool error;
        uint128 balance;
        uint128 fee;
        Model model;
        address creator;
        address oracle;
    }

    constructor (
        IERC20 _token,
        address _burner,
        uint128 _fee
    ) ERC721("RCN Debt Record", "RDR") {
        // Sanity checks
        require(_burner != address(0), "Burner 0x0 is not valid");
        require(address(_token).isContract(), "Token should be a contract");
        require(_fee <= 100, "The fee should be lower or equal than 1%");

        token = _token;
        burner = _burner;
        fee = _fee;
        emit SetBurner(_burner);
        emit SetFee(_fee);
    }

    function isApprovedOrOwner(address _spender, uint256 _entryId) external view returns (bool) {
        return _isApprovedOrOwner(_spender, _entryId);
    }

    function setBurner(address _burner) external onlyOwner {
        require(_burner != address(0), "Burner 0x0 is not valid");

        burner = _burner;
        emit SetBurner(_burner);
    }

    function setFee(uint128 _fee) external onlyOwner {
        require(_fee <= 100, "The fee should be lower or equal than 1%");

        fee = _fee;
        emit SetFee(_fee);
    }

    function create(
        Model _model,
        address _owner,
        address _oracle,
        bytes calldata _data
    ) external returns (bytes32 id) {
        uint256 nonce = nonces[msg.sender]++; // Overflow when a user create (2**256)-1 debts
        id = keccak256(
            abi.encodePacked(
                uint8(1),
                address(this),
                msg.sender,
                nonce
            )
        );

        debts[id] = Debt({
            error: false,
            balance: 0,
            fee: fee,
            creator: msg.sender,
            model: _model,
            oracle: _oracle
        });

        _safeMint(_owner, uint256(id));
        require(_model.create(id, _data), "Error creating debt in model");

        emit Created({
            _id: id,
            _nonce: nonce,
            _data: _data
        });
    }

    function create2(
        Model _model,
        address _owner,
        address _oracle,
        uint256 _salt,
        bytes calldata _data
    ) external returns (bytes32 id) {
        id = keccak256(
            abi.encodePacked(
                uint8(2),
                address(this),
                msg.sender,
                _model,
                _oracle,
                _salt,
                _data
            )
        );

        debts[id] = Debt({
            error: false,
            balance: 0,
            fee: fee,
            creator: msg.sender,
            model: _model,
            oracle: _oracle
        });

        _safeMint(_owner, uint256(id));
        require(_model.create(id, _data), "Error creating debt in model");

        emit Created2({
            _id: id,
            _salt: _salt,
            _data: _data
        });
    }

    function create3(
        Model _model,
        address _owner,
        address _oracle,
        uint256 _salt,
        bytes calldata _data
    ) external returns (bytes32 id) {
        id = keccak256(
            abi.encodePacked(
                uint8(3),
                address(this),
                msg.sender,
                _salt
            )
        );

        debts[id] = Debt({
            error: false,
            balance: 0,
            fee: fee,
            creator: msg.sender,
            model: _model,
            oracle: _oracle
        });

        _safeMint(_owner, uint256(id));
        require(_model.create(id, _data), "Error creating debt in model");

        emit Created3({
            _id: id,
            _salt: _salt,
            _data: _data
        });
    }

    function buildId(
        address _creator,
        uint256 _nonce
    ) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                uint8(1),
                address(this),
                _creator,
                _nonce
            )
        );
    }

    function buildId2(
        address _creator,
        address _model,
        address _oracle,
        uint256 _salt,
        bytes calldata _data
    ) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                uint8(2),
                address(this),
                _creator,
                _model,
                _oracle,
                _salt,
                _data
            )
        );
    }

    function buildId3(
        address _creator,
        uint256 _salt
    ) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                uint8(3),
                address(this),
                _creator,
                _salt
            )
        );
    }

    function pay(
        bytes32 _id,
        uint256 _amountToPay,
        address _origin,
        bytes calldata _oracleData
    ) external returns (uint256 paid, uint256 paidToken, uint256 burnToken) {
        Debt storage debt = debts[_id];

        // Paid only required amount
        paid = _safePay(_id, debt.model, _amountToPay);

        if (debt.error)
            return (0, 0, 0);

        require(paid <= _amountToPay, "Paid can't be more than requested");

        RateOracle oracle = RateOracle(debt.oracle);
        if (address(oracle) != address(0)) {
            // Convert
            (uint256 tokens, uint256 equivalent) = oracle.readSample(_oracleData);
            emit ReadedOracle(_id, tokens, equivalent);
            paidToken = _toToken(paid, tokens, equivalent);
        } else {
            paidToken = paid;
        }

        // Pull tokens from payer
        require(token.transferFrom(msg.sender, address(this), paidToken), "Error pulling payment tokens");

        burnToken = _chargeBurnFee(_id, debt.fee, paidToken);

        // Add balance to the debt
        uint256 newBalance = paidToken.add(debt.balance);
        require(newBalance < UINT_128_OVERFLOW, "uint128 Overflow");
        debt.balance = uint128(newBalance);

        // Emit pay event
        emit Paid({
            _id: _id,
            _sender: msg.sender,
            _origin: _origin,
            _requested: _amountToPay,
            _requestedTokens: 0,
            _paid: paid,
            _tokens: paidToken
        });
    }

    function payToken(
        bytes32 id,
        uint256 amount,
        address origin,
        bytes calldata oracleData
    ) external returns (uint256 paid, uint256 paidToken, uint256 burnToken) {
        Debt storage debt = debts[id];
        // Read storage
        RateOracle oracle = RateOracle(debt.oracle);

        uint256 available;

        {
            uint256 equivalent;
            uint256 tokens;

            // Get available <currency> amount
            if (address(oracle) != address(0)) {
                (tokens, equivalent) = oracle.readSample(oracleData);
                emit ReadedOracle(id, tokens, equivalent);
                available = _fromToken(amount, tokens, equivalent);
            } else {
                available = amount;
            }

            // Call addPaid on model
            paid = _safePay(id, debt.model, available);

            if (debt.error)
                return (0, 0, 0);

            require(paid <= available, "Paid can't exceed available");

            // Convert back to required pull amount
            if (address(oracle) != address(0)) {
                paidToken = _toToken(paid, tokens, equivalent);
                require(paidToken <= amount, "Paid can't exceed requested");
            } else {
                paidToken = paid;
            }
        }

        // Pull tokens from payer
        require(token.transferFrom(msg.sender, address(this), paidToken), "Error pulling tokens");

        burnToken = _chargeBurnFee(id, debt.fee, paidToken);

        // Add balance to the debt
        // WARNING: Reusing variable **available**
        available = paidToken.add(debt.balance);
        require(available < UINT_128_OVERFLOW, "uint128 Overflow");
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

    function payBatch(
        bytes32[] calldata _ids,
        uint256[] calldata _amounts,
        address _origin,
        address _oracle,
        bytes calldata _oracleData
    ) external returns (uint256[] memory paid, uint256[] memory paidTokens) {
        uint256 count = _ids.length;
        require(count == _amounts.length, "_ids and _amounts should have the same length");

        uint256 tokens;
        uint256 equivalent;
        if (_oracle != address(0)) {
            (tokens, equivalent) = RateOracle(_oracle).readSample(_oracleData);
            emit ReadedOracleBatch(_oracle, count, tokens, equivalent);
        }

        paid = new uint256[](count);
        paidTokens = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 amount = _amounts[i];
            (paid[i], paidTokens[i],) = _pay(_ids[i], _oracle, amount, tokens, equivalent);

            emit Paid({
                _id: _ids[i],
                _sender: msg.sender,
                _origin: _origin,
                _requested: amount,
                _requestedTokens: 0,
                _paid: paid[i],
                _tokens: paidTokens[i]
            });
        }
    }

    function payTokenBatch(
        bytes32[] calldata _ids,
        uint256[] calldata _tokenAmounts,
        address _origin,
        address _oracle,
        bytes calldata _oracleData
    ) external returns (uint256[] memory paid, uint256[] memory paidTokens) {
        uint256 count = _ids.length;
        require(count == _tokenAmounts.length, "_ids and _amounts should have the same length");

        uint256 tokens;
        uint256 equivalent;
        if (_oracle != address(0)) {
            (tokens, equivalent) = RateOracle(_oracle).readSample(_oracleData);
            emit ReadedOracleBatch(_oracle, count, tokens, equivalent);
        }

        paid = new uint256[](count);
        paidTokens = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenAmount = _tokenAmounts[i];
            (paid[i], paidTokens[i],) = _pay(
                _ids[i],
                _oracle,
                _oracle != address(0) ? _fromToken(tokenAmount, tokens, equivalent) : tokenAmount,
                tokens,
                equivalent
            );
            require(paidTokens[i] <= tokenAmount, "Paid can't exceed requested");

            emit Paid({
                _id: _ids[i],
                _sender: msg.sender,
                _origin: _origin,
                _requested: 0,
                _requestedTokens: tokenAmount,
                _paid: paid[i],
                _tokens: paidTokens[i]
            });
        }
    }

    /**
        Internal method to pay a loan, during a payment batch context

        @param _id Pay identifier
        @param _oracle Address of the Oracle contract, if the loan does not use any oracle, this field should be 0x0.
        @param _amount Amount to pay, in currency
        @param _tokens How many tokens
        @param _equivalent How much currency _tokens equivales

        @return paid and paidTokens, similar to external pay
    */
    function _pay(
        bytes32 _id,
        address _oracle,
        uint256 _amount,
        uint256 _tokens,
        uint256 _equivalent
    ) internal returns (uint256 paid, uint256 paidToken, uint256 burnToken){
        Debt storage debt = debts[_id];

        if (_oracle != debt.oracle) {
            emit PayBatchError(
                _id,
                _oracle
            );

            return (0, 0, 0);
        }

        // Paid only required amount
        paid = _safePay(_id, debt.model, _amount);

        if (debt.error)
            return (0, 0, 0);

        require(paid <= _amount, "Paid can't be more than requested");

        // Get token amount to use as payment
        paidToken = _oracle != address(0) ? _toToken(paid, _tokens, _equivalent) : paid;

        // Pull tokens from payer
        require(token.transferFrom(msg.sender, address(this), paidToken), "Error pulling payment tokens");

        burnToken = _chargeBurnFee(_id, debt.fee, paidToken);

        // Add balance to debt
        uint256 newBalance = paidToken.add(debt.balance);
        require(newBalance < UINT_128_OVERFLOW, "uint128 Overflow");
        debt.balance = uint128(newBalance);
    }

    function _chargeBurnFee(bytes32 _id, uint128 _fee, uint256 _amount) internal returns (uint256 burnToken) {
        if (_fee == 0)
            return 0;

        // Get burn token amount from fee percentage
        burnToken = _amount.mul(_fee).div(BASE);

        if (burnToken == 0)
            return 0;

        // Pull tokens from payer to Burner
        require(token.transferFrom(msg.sender, burner, burnToken), "Error pulling fee tokens");

        emit ChargeBurnFee(_id, burnToken);
    }

    function _safePay(
        bytes32 _id,
        Model _model,
        uint256 _available
    ) internal returns (uint256) {
        require(_model != Model(address(0)), "Debt does not exist");

        (bool success, bytes32 paid) = _safeGasCall(
            address(_model),
            abi.encodeWithSelector(
                _model.addPaid.selector,
                _id,
                _available
            )
        );

        if (success) {
            if (debts[_id].error) {
                emit ErrorRecover({
                    _id: _id,
                    _sender: msg.sender,
                    _value: 0,
                    _gasLeft: gasleft(),
                    _gasLimit: block.gaslimit,
                    _result: paid,
                    _callData: msg.data
                });

                delete debts[_id].error;
            }

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

        @param _amount Amount to convert in rate currency
        @param _tokens How many tokens
        @param _equivalent How much currency _tokens equivales

        @return _result Amount in tokens
    */
    function _toToken(
        uint256 _amount,
        uint256 _tokens,
        uint256 _equivalent
    ) internal pure returns (uint256 _result) {
        require(_tokens != 0 && _equivalent != 0, "Oracle provided invalid rate");
        uint256 aux = _tokens.mul(_amount);
        _result = aux / _equivalent;
        if (aux % _equivalent > 0) {
            _result = _result.add(1);
        }
    }

    /**
        Converts an amount in token to the rate currency

        @param _amount Amount to convert in token
        @param _tokens How many tokens
        @param _equivalent How much currency _tokens equivales

        @return Amount in rate currency
    */
    function _fromToken(
        uint256 _amount,
        uint256 _tokens,
        uint256 _equivalent
    ) internal pure returns (uint256) {
        require(_tokens != 0 && _equivalent != 0, "Oracle provided invalid rate");
        return _amount.mul(_equivalent) / _tokens;
    }

    function run(bytes32 _id) external returns (bool) {
        Debt storage debt = debts[_id];
        require(debt.model != Model(address(0)), "Debt does not exist");

        (bool success, bytes32 result) = _safeGasCall(
            address(debt.model),
            abi.encodeWithSelector(
                debt.model.run.selector,
                _id
            )
        );

        if (success) {
            if (debt.error) {
                emit ErrorRecover({
                    _id: _id,
                    _sender: msg.sender,
                    _value: 0,
                    _gasLeft: gasleft(),
                    _gasLimit: block.gaslimit,
                    _result: result,
                    _callData: msg.data
                });

                delete debt.error;
            }

            return result == bytes32(uint256(1));
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

    function withdraw(bytes32 _id, address _to) external returns (uint256 amount) {
        require(_to != address(0x0), "_to should not be 0x0");
        require(_isApprovedOrOwner(msg.sender, uint256(_id)), "Sender not authorized");
        Debt storage debt = debts[_id];
        amount = debt.balance;
        debt.balance = 0;
        require(token.transfer(_to, amount), "Error sending tokens");
        emit Withdrawn({
            _id: _id,
            _sender: msg.sender,
            _to: _to,
            _amount: amount
        });
    }

    function withdrawPartial(bytes32 _id, address _to, uint256 _amount) external returns (bool success) {
        require(_to != address(0x0), "_to should not be 0x0");
        require(_isApprovedOrOwner(msg.sender, uint256(_id)), "Sender not authorized");
        Debt storage debt = debts[_id];
        debt.balance = uint128(uint256(debt.balance).sub(_amount));
        require(token.transfer(_to, _amount), "Error sending tokens");
        emit Withdrawn({
            _id: _id,
            _sender: msg.sender,
            _to: _to,
            _amount: _amount
        });
        success = true;
    }

    function withdrawBatch(bytes32[] calldata _ids, address _to) external returns (uint256 total) {
        require(_to != address(0x0), "_to should not be 0x0");
        bytes32 target;
        uint256 balance;
        for (uint256 i = 0; i < _ids.length; i++) {
            target = _ids[i];
            if (_isApprovedOrOwner(msg.sender, uint256(target))) {
                balance = debts[target].balance;
                debts[target].balance = 0;
                total += balance;
                emit Withdrawn({
                    _id: target,
                    _sender: msg.sender,
                    _to: _to,
                    _amount: balance
                });
            }
        }
        require(token.transfer(_to, total), "Error sending tokens");
    }

    function getStatus(bytes32 _id) external view returns (Status) {
        Debt storage debt = debts[_id];
        if (debt.error) {
            return Status.ERROR;
        } else {
            (bool success, uint256 result) = _safeGasStaticCall(
                address(debt.model),
                abi.encodeWithSelector(
                    debt.model.getStatus.selector,
                    _id
                )
            );
            return success ? Status(result) : Status.ERROR;
        }
    }

    function getFeeAmount(
        bytes32 _id,
        uint256 _amountToPay,
        bytes calldata _oracleData
    ) external view returns (uint256 feeAmount) {
        Debt storage debt = debts[_id];

        if (debt.fee == 0)
            return 0;

        uint256 paidToken;
        RateOracle oracle = RateOracle(debt.oracle);

        if (address(oracle) == address(0)) {
            paidToken = _amountToPay;
        } else {
            // Static convert
            ( bool success, bytes memory returnData ) = address(oracle).staticcall(
                abi.encodeWithSelector(
                    oracle.readSample.selector,
                    _oracleData
                )
            );

            require(success, "getFeeAmount: error static reading oracle");

            ( uint256 tokens, uint256 equivalent ) = abi.decode(returnData, (uint256, uint256));

            paidToken = _toToken(_amountToPay, tokens, equivalent);
        }

        feeAmount = paidToken.mul(debt.fee).div(BASE);
    }

    function toFee(
        bytes32 _id,
        uint256 _amount
    ) external view returns (uint256 feeAmount) {
        Debt storage debt = debts[_id];

        if (debt.fee == 0)
            return 0;

        feeAmount = _amount.mul(debt.fee).div(BASE);
    }

    function _safeGasStaticCall(
        address _contract,
        bytes memory _data
    ) internal view returns (bool success, uint256 result) {
        bytes memory returnData;
        uint256 _gas = (block.gaslimit * 80) / 100;

        (success, returnData) = _contract.staticcall{ gas: gasleft() < _gas ? gasleft() : _gas }(_data);

        if (returnData.length > 0)
            result = abi.decode(returnData, (uint256));
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract),
     * relaxing the requirement on the return value
     *
     * @param _contract The contract that receives the call
     * @param _data The call data
     *
     * @return success True if the call not reverts
     * @return result the result of the call
     */
    function _safeGasCall(
        address _contract,
        bytes memory _data
    ) internal returns (bool success, bytes32 result) {
        bytes memory returnData;
        uint256 _gas = (block.gaslimit * 80) / 100; // Cant overflow, the gas limit * 80 is lower than (2**256)-1

        (success, returnData) = _contract.call{ gas: gasleft() < _gas ? gasleft() : _gas }(_data);

        if (returnData.length > 0)
            result = abi.decode(returnData, (bytes32));
    }
}