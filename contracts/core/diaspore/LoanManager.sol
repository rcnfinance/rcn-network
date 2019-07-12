pragma solidity ^0.5.10;

import "./DebtEngine.sol";
import "./interfaces/LoanApprover.sol";
import "./interfaces/LoanCallback.sol";
import "./interfaces/RateOracle.sol";
import "../../interfaces/Cosigner.sol";
import "../../utils/ImplementsInterface.sol";
import "../../utils/IsContract.sol";
import "../../utils/SafeMath.sol";
import "../../utils/BytesUtils.sol";


contract LoanManager is BytesUtils {
    using ImplementsInterface for address;
    using IsContract for address;
    using SafeMath for uint256;

    uint256 public constant GAS_CALLBACK = 300000;

    DebtEngine public debtEngine;
    IERC20 public token;

    mapping(bytes32 => Request) public requests;
    mapping(bytes32 => bool) public canceledSettles;

    event Requested(
        bytes32 indexed _id,
        uint128 _amount,
        address _model,
        address _creator,
        address _oracle,
        address _borrower,
        address _callback,
        uint256 _salt,
        bytes _loanData,
        uint256 _expiration
    );

    event Approved(bytes32 indexed _id);
    event Lent(bytes32 indexed _id, address _lender, uint256 _tokens);
    event Cosigned(bytes32 indexed _id, address _cosigner, uint256 _cost);
    event Canceled(bytes32 indexed _id, address _canceler);
    event ReadedOracle(address _oracle, uint256 _tokens, uint256 _equivalent);

    event ApprovedRejected(bytes32 indexed _id, bytes32 _response);
    event ApprovedError(bytes32 indexed _id, bytes32 _response);

    event ApprovedByCallback(bytes32 indexed _id);
    event ApprovedBySignature(bytes32 indexed _id);

    event CreatorByCallback(bytes32 indexed _id);
    event BorrowerByCallback(bytes32 indexed _id);
    event CreatorBySignature(bytes32 indexed _id);
    event BorrowerBySignature(bytes32 indexed _id);

    event SettledLend(bytes32 indexed _id, address _lender, uint256 _tokens);
    event SettledCancel(bytes32 indexed _id, address _canceler);

    constructor(DebtEngine _debtEngine) public {
        debtEngine = _debtEngine;
        token = debtEngine.token();
        require(address(token) != address(0), "Error loading token");
    }

    // uint256 getters(legacy)
    function getBorrower(uint256 _id) external view returns (address) { return requests[bytes32(_id)].borrower; }
    function getCreator(uint256 _id) external view returns (address) { return requests[bytes32(_id)].creator; }
    function getOracle(uint256 _id) external view returns (address) { return requests[bytes32(_id)].oracle; }
    function getCosigner(uint256 _id) external view returns (address) { return requests[bytes32(_id)].cosigner; }
    function getCurrency(uint256 _id) external view returns (bytes32) {
        address oracle = requests[bytes32(_id)].oracle;
        return oracle == address(0) ? bytes32(0x0) : RateOracle(oracle).currency();
    }
    function getAmount(uint256 _id) external view returns (uint256) { return requests[bytes32(_id)].amount; }
    function getExpirationRequest(uint256 _id) external view returns (uint256) { return requests[bytes32(_id)].expiration; }
    function getApproved(uint256 _id) external view returns (bool) { return requests[bytes32(_id)].approved; }
    function getDueTime(uint256 _id) external view returns (uint256) { return Model(requests[bytes32(_id)].model).getDueTime(bytes32(_id)); }
    function getClosingObligation(uint256 _id) external view returns (uint256) { return Model(requests[bytes32(_id)].model).getClosingObligation(bytes32(_id)); }
    function getLoanData(uint256 _id) external view returns (bytes memory) { return requests[bytes32(_id)].loanData; }
    function getStatus(uint256 _id) external view returns (uint256) {
        Request storage request = requests[bytes32(_id)];
        return request.open ? 0 : debtEngine.getStatus(bytes32(_id));
    }
    function ownerOf(uint256 _id) external view returns (address) {
        return debtEngine.ownerOf(_id);
    }

    // bytes32 getters
    function getBorrower(bytes32 _id) external view returns (address) { return requests[_id].borrower; }
    function getCreator(bytes32 _id) external view returns (address) { return requests[_id].creator; }
    function getOracle(bytes32 _id) external view returns (address) { return requests[_id].oracle; }
    function getCosigner(bytes32 _id) external view returns (address) { return requests[_id].cosigner; }
    function getCurrency(bytes32 _id) external view returns (bytes32) {
        address oracle = requests[_id].oracle;
        return oracle == address(0) ? bytes32(0x0) : RateOracle(oracle).currency();
    }
    function getAmount(bytes32 _id) external view returns (uint256) { return requests[_id].amount; }
    function getExpirationRequest(bytes32 _id) external view returns (uint256) { return requests[_id].expiration; }
    function getApproved(bytes32 _id) external view returns (bool) { return requests[_id].approved; }
    function getDueTime(bytes32 _id) external view returns (uint256) { return Model(requests[_id].model).getDueTime(bytes32(_id)); }
    function getClosingObligation(bytes32 _id) external view returns (uint256) { return Model(requests[_id].model).getClosingObligation(bytes32(_id)); }
    function getLoanData(bytes32 _id) external view returns (bytes memory) { return requests[_id].loanData; }
    function getStatus(bytes32 _id) external view returns (uint256) {
        Request storage request = requests[_id];
        return request.open ? 0 : debtEngine.getStatus(bytes32(_id));
    }
    function ownerOf(bytes32 _id) external view returns (address) {
        return debtEngine.ownerOf(uint256(_id));
    }

    function getCallback(bytes32 _id) external view returns (address) { return requests[_id].callback; }

    struct Request {
        bool open;
        bool approved;
        uint64 expiration;
        uint128 amount;
        address cosigner;
        address model;
        address creator;
        address oracle;
        address borrower;
        address callback;
        uint256 salt;
        bytes loanData;
    }

    function calcId(
        uint128 _amount,
        address _borrower,
        address _creator,
        address _model,
        address _oracle,
        address _callback,
        uint256 _salt,
        uint64 _expiration,
        bytes memory _data
    ) public view returns (bytes32) {
        uint256 internalSalt = _buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _callback,
            _salt,
            _expiration
        );

        return keccak256(
            abi.encodePacked(
                uint8(2),
                debtEngine,
                address(this),
                _model,
                _oracle,
                internalSalt,
                _data
            )
        );
    }

    function buildInternalSalt(
        uint128 _amount,
        address _borrower,
        address _creator,
        address _callback,
        uint256 _salt,
        uint64 _expiration
    ) external pure returns (uint256) {
        return _buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _callback,
            _salt,
            _expiration
        );
    }

    function internalSalt(bytes32 _id) external view returns (uint256) {
        Request storage request = requests[_id];
        require(request.borrower != address(0), "Request does not exist");
        return _internalSalt(request);
    }

    function _internalSalt(Request memory _request) internal view returns (uint256) {
        return _buildInternalSalt(
            _request.amount,
            _request.borrower,
            _request.creator,
            _request.callback,
            _request.salt,
            _request.expiration
        );
    }

    function requestLoan(
        uint128 _amount,
        address _model,
        address _oracle,
        address _borrower,
        address _callback,
        uint256 _salt,
        uint64 _expiration,
        bytes calldata _loanData
    ) external returns (bytes32 id) {
        require(_borrower != address(0), "The request should have a borrower");
        require(Model(_model).validate(_loanData), "The loan data is not valid");

        id = calcId(
            _amount,
            _borrower,
            msg.sender,
            _model,
            _oracle,
            _callback,
            _salt,
            _expiration,
            _loanData
        );

        require(!canceledSettles[id], "The debt was canceled");

        require(requests[id].borrower == address(0), "Request already exist");

        bool approved = msg.sender == _borrower;

        requests[id] = Request({
            open: true,
            approved: approved,
            cosigner: address(0),
            amount: _amount,
            model: _model,
            creator: msg.sender,
            oracle: _oracle,
            borrower: _borrower,
            callback: _callback,
            salt: _salt,
            loanData: _loanData,
            expiration: _expiration
        });

        emit Requested(
            id,
            _amount,
            _model,
            msg.sender,
            _oracle,
            _borrower,
            _callback,
            _salt,
            _loanData,
            _expiration
        );

        if (!approved) {
            // implements: 0x76ba6009 = approveRequest(bytes32)
            if (_borrower.isContract() && _borrower.implementsMethod(0x76ba6009)) {
                approved = _requestContractApprove(id, _borrower);
                requests[id].approved = approved;
            }
        }

        if (approved) {
            emit Approved(id);
        }
    }

    function _requestContractApprove(
        bytes32 _id,
        address _borrower
    ) internal returns (bool approved) {
        // bytes32 expected = _id XOR keccak256("approve-loan-request");
        bytes32 expected = _id ^ 0xdfcb15a077f54a681c23131eacdfd6e12b5e099685b492d382c3fd8bfc1e9a2a;
        (bool success, bytes32 result) = _safeCall(
            _borrower,
            abi.encodeWithSelector(
                0x76ba6009,
                _id
            )
        );

        approved = success && result == expected;

        // Emit events if approve was rejected or failed
        if (approved) {
            emit ApprovedByCallback(_id);
        } else {
            if (!success) {
                emit ApprovedError(_id, result);
            } else {
                emit ApprovedRejected(_id, result);
            }
        }
    }

    function approveRequest(
        bytes32 _id
    ) external returns (bool) {
        Request storage request = requests[_id];
        require(msg.sender == request.borrower, "Only borrower can approve");
        if (!request.approved) {
            request.approved = true;
            emit Approved(_id);
        }
        return true;
    }

    function registerApproveRequest(
        bytes32 _id,
        bytes calldata _signature
    ) external returns (bool approved) {
        Request storage request = requests[_id];
        address borrower = request.borrower;

        if (!request.approved) {
            if (borrower.isContract() && borrower.implementsMethod(0x76ba6009)) {
                approved = _requestContractApprove(_id, borrower);
            } else {
                bytes32 _hash = keccak256(
                    abi.encodePacked(
                        _id,
                        "sign approve request"
                    )
                );

                address signer = ecrecovery(
                    keccak256(
                        abi.encodePacked(
                            "\x19Ethereum Signed Message:\n32",
                            _hash
                        )
                    ),
                    _signature
                );

                if (borrower == signer) {
                    emit ApprovedBySignature(_id);
                    approved = true;
                }
            }
        }

        // Check request.approved again, protect against reentrancy
        if (approved && !request.approved) {
            request.approved = true;
            emit Approved(_id);
        }
    }

    function lend(
        bytes32 _id,
        bytes memory _oracleData,
        address _cosigner,
        uint256 _cosignerLimit,
        bytes memory _cosignerData,
        bytes memory _callbackData
    ) public returns (bool) {
        Request storage request = requests[_id];
        require(request.open, "Request is no longer open");
        require(request.approved, "The request is not approved by the borrower");
        require(request.expiration > now, "The request is expired");

        request.open = false;

        uint256 tokens = _currencyToToken(request.oracle, request.amount, _oracleData);
        require(
            token.transferFrom(
                msg.sender,
                request.borrower,
                tokens
            ),
            "Error sending tokens to borrower"
        );

        emit Lent(_id, msg.sender, tokens);

        // Generate the debt
        require(
            debtEngine.create2(
                Model(request.model),
                msg.sender,
                request.oracle,
                _internalSalt(request),
                request.loanData
            ) == _id,
            "Error creating the debt"
        );

        // Call the cosigner
        if (_cosigner != address(0)) {
            uint256 auxSalt = request.salt;
            request.cosigner = address(uint256(_cosigner) + 2);
            request.salt = _cosignerLimit; // Risky ?
            require(
                Cosigner(_cosigner).requestCosign(
                    address(this),
                    uint256(_id),
                    _cosignerData,
                    _oracleData
                ),
                "Cosign method returned false"
            );
            require(request.cosigner == _cosigner, "Cosigner didn't callback");
            request.salt = auxSalt;
        }

        // Call the loan callback
        address callback = request.callback;
        if (callback != address(0)) {
            require(LoanCallback(callback).onLent.gas(GAS_CALLBACK)(_id, msg.sender, _callbackData), "Rejected by loan callback");
        }

        return true;
    }

    function cancel(bytes32 _id) external returns (bool) {
        Request storage request = requests[_id];

        require(request.open, "Request is no longer open or not requested");
        require(
            request.creator == msg.sender || request.borrower == msg.sender,
            "Only borrower or creator can cancel a request"
        );

        delete request.loanData;
        delete requests[_id];
        canceledSettles[_id] = true;

        emit Canceled(_id, msg.sender);

        return true;
    }

    function cosign(uint256 _id, uint256 _cost) external returns (bool) {
        Request storage request = requests[bytes32(_id)];
        require(request.cosigner != address(0), "Cosigner 0x0 is not valid");
        require(request.expiration > now, "Request is expired");
        require(request.cosigner == address(uint256(msg.sender) + 2), "Cosigner not valid");
        request.cosigner = msg.sender;
        if (_cost != 0){
            require(request.salt >= _cost, "Cosigner cost exceeded");
            require(token.transferFrom(debtEngine.ownerOf(_id), msg.sender, _cost), "Error paying cosigner");
        }
        emit Cosigned(bytes32(_id), msg.sender, _cost);
        return true;
    }

    // ///
    // Offline requests
    // ///

    uint256 private constant L_AMOUNT = 16;
    uint256 private constant O_AMOUNT = 0;
    uint256 private constant O_MODEL = L_AMOUNT;
    uint256 private constant L_MODEL = 20;
    uint256 private constant O_ORACLE = O_MODEL + L_MODEL;
    uint256 private constant L_ORACLE = 20;
    uint256 private constant O_BORROWER = O_ORACLE + L_ORACLE;
    uint256 private constant L_BORROWER = 20;
    uint256 private constant O_SALT = O_BORROWER + L_BORROWER;
    uint256 private constant L_SALT = 32;
    uint256 private constant O_EXPIRATION = O_SALT + L_SALT;
    uint256 private constant L_EXPIRATION = 8;
    uint256 private constant O_CREATOR = O_EXPIRATION + L_EXPIRATION;
    uint256 private constant L_CREATOR = 20;
    uint256 private constant O_CALLBACK = O_CREATOR + L_CREATOR;
    uint256 private constant L_CALLBACK = 20;

    function encodeRequest(
        uint128 _amount,
        address _model,
        address _oracle,
        address _borrower,
        address _callback,
        uint256 _salt,
        uint64 _expiration,
        address _creator,
        bytes calldata _loanData
    ) external view returns (bytes memory requestData, bytes32 id) {
        requestData = abi.encodePacked(
            _amount,
            _model,
            _oracle,
            _borrower,
            _salt,
            _expiration,
            _creator,
            _callback
        );

        uint256 innerSalt = _buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _callback,
            _salt,
            _expiration
        );

        id = debtEngine.buildId2(
            address(this),
            _model,
            _oracle,
            innerSalt,
            _loanData
        );
    }

    function settleLend(
        bytes memory _requestData,
        bytes memory _loanData,
        address _cosigner,
        uint256 _maxCosignerCost,
        bytes memory _cosignerData,
        bytes memory _oracleData,
        bytes memory _creatorSig,
        bytes memory _borrowerSig,
        bytes memory _callbackData
    ) public returns (bytes32 id) {
        // Validate request
        require(uint256(read(_requestData, O_EXPIRATION, L_EXPIRATION)) > now, "Loan request is expired");

        // Get id
        uint256 innerSalt;
        (id, innerSalt) = _buildSettleId(_requestData, _loanData);

        require(requests[id].borrower == address(0), "Request already exist");

        // Transfer tokens to borrower
        uint256 tokens = _currencyToToken(_requestData, _oracleData);
        require(
            token.transferFrom(
                msg.sender,
                address(uint256(read(_requestData, O_BORROWER, L_BORROWER))),
                tokens
            ),
            "Error sending tokens to borrower"
        );

        // Generate the debt
        require(
            _createDebt(
                _requestData,
                _loanData,
                innerSalt
            ) == id,
            "Error creating debt registry"
        );

        emit SettledLend(id, msg.sender, tokens);

        // Save the request info
        requests[id] = Request({
            open: false,
            approved: true,
            cosigner: _cosigner,
            amount: uint128(uint256(read(_requestData, O_AMOUNT, L_AMOUNT))),
            model: address(uint256(read(_requestData, O_MODEL, L_MODEL))),
            creator: address(uint256(read(_requestData, O_CREATOR, L_CREATOR))),
            oracle: address(uint256(read(_requestData, O_ORACLE, L_ORACLE))),
            borrower: address(uint256(read(_requestData, O_BORROWER, L_BORROWER))),
            callback: address(uint256(read(_requestData, O_CALLBACK, L_CALLBACK))),
            salt: _cosigner != address(0) ? _maxCosignerCost : uint256(read(_requestData, O_SALT, L_SALT)),
            loanData: _loanData,
            expiration: uint64(uint256(read(_requestData, O_EXPIRATION, L_EXPIRATION)))
        });

        Request storage request = requests[id];

        // Validate signatures
        _validateSettleSignatures(id, _requestData, _loanData, _creatorSig, _borrowerSig);

        // Call the cosigner
        if (_cosigner != address(0)) {
            request.cosigner = address(uint256(_cosigner) + 2);
            require(Cosigner(_cosigner).requestCosign(address(this), uint256(id), _cosignerData, _oracleData), "Cosign method returned false");
            require(request.cosigner == _cosigner, "Cosigner didn't callback");
            request.salt = uint256(read(_requestData, O_SALT, L_SALT));
        }

        // Call the loan callback
        address callback = address(uint256(read(_requestData, O_CALLBACK, L_CALLBACK)));
        if (callback != address(0)) {
            require(LoanCallback(callback).onLent.gas(GAS_CALLBACK)(id, msg.sender, _callbackData), "Rejected by loan callback");
        }
    }

    function settleCancel(
        bytes calldata _requestData,
        bytes calldata _loanData
    ) external returns (bool) {
        (bytes32 id, ) = _buildSettleId(_requestData, _loanData);
        require(
            msg.sender == address(uint256(read(_requestData, O_BORROWER, L_BORROWER))) ||
            msg.sender == address(uint256(read(_requestData, O_CREATOR, L_CREATOR))),
            "Only borrower or creator can cancel a settle"
        );
        canceledSettles[id] = true;
        emit SettledCancel(id, msg.sender);

        return true;
    }

    function _validateSettleSignatures(
        bytes32 _id,
        bytes memory _requestData,
        bytes memory _loanData,
        bytes memory _creatorSig,
        bytes memory _borrowerSig
    ) internal {
        require(!canceledSettles[_id], "Settle was canceled");

        // bytes32 expected = uint256(_id) XOR keccak256("approve-loan-request");
        bytes32 expected = _id ^ 0xdfcb15a077f54a681c23131eacdfd6e12b5e099685b492d382c3fd8bfc1e9a2a;
        address borrower = address(uint256(read(_requestData, O_BORROWER, L_BORROWER)));
        address creator = address(uint256(read(_requestData, O_CREATOR, L_CREATOR)));
        bytes32 _hash;

        if (borrower.isContract()) {
            require(
                LoanApprover(borrower).settleApproveRequest(_requestData, _loanData, true, uint256(_id)) == expected,
                "Borrower contract rejected the loan"
            );

            emit BorrowerByCallback(_id);
        } else {
            _hash = keccak256(
                abi.encodePacked(
                    _id,
                    "sign settle lend as borrower"
                )
            );
            require(
                borrower == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash)), _borrowerSig),
                "Invalid borrower signature"
            );

            emit BorrowerBySignature(_id);
        }

        if (borrower != creator) {
            if (creator.isContract()) {
                require(
                    LoanApprover(creator).settleApproveRequest(_requestData, _loanData, false, uint256(_id)) == expected,
                    "Creator contract rejected the loan"
                );

                emit CreatorByCallback(_id);
            } else {
                _hash = keccak256(
                    abi.encodePacked(
                        _id,
                        "sign settle lend as creator"
                    )
                );
                require(
                    creator == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash)), _creatorSig),
                    "Invalid creator signature"
                );

                emit CreatorBySignature(_id);
            }
        }
    }

    function _currencyToToken(
        bytes memory _requestData,
        bytes memory _oracleData
    ) internal returns (uint256) {
        return _currencyToToken(
            address(uint256(read(_requestData, O_ORACLE, L_ORACLE))),
            uint256(read(_requestData, O_AMOUNT, L_AMOUNT)),
            _oracleData
        );
    }

    function _createDebt(
        bytes memory _requestData,
        bytes memory _loanData,
        uint256 _innerSalt
    ) internal returns (bytes32) {
        return debtEngine.create2(
            Model(address(uint256(read(_requestData, O_MODEL, L_MODEL)))),
            msg.sender,
            address(uint256(read(_requestData, O_ORACLE, L_ORACLE))),
            _innerSalt,
            _loanData
        );
    }

    function _buildSettleId(
        bytes memory _requestData,
        bytes memory _loanData
    ) internal view returns (bytes32 id, uint256 innerSalt) {
        (
            uint128 amount,
            address model,
            address oracle,
            address borrower,
            uint256 salt,
            uint64 expiration,
            address creator
        ) = _decodeSettle(_requestData);

        innerSalt = _buildInternalSalt(
            amount,
            borrower,
            creator,
            address(uint256(read(_requestData, O_CALLBACK, L_CALLBACK))),
            salt,
            expiration
        );

        id = debtEngine.buildId2(
            address(this),
            model,
            oracle,
            innerSalt,
            _loanData
        );
    }

    function _buildInternalSalt(
        uint128 _amount,
        address _borrower,
        address _creator,
        address _callback,
        uint256 _salt,
        uint64 _expiration
    ) internal pure returns (uint256) {
        return uint256(
            keccak256(
                abi.encodePacked(
                    _amount,
                    _borrower,
                    _creator,
                    _callback,
                    _salt,
                    _expiration
                )
            )
        );
    }

    function _decodeSettle(
        bytes memory _data
    ) internal pure returns (
        uint128 amount,
        address model,
        address oracle,
        address borrower,
        uint256 salt,
        uint64 expiration,
        address creator
    ) {
        (
            bytes32 _amount,
            bytes32 _model,
            bytes32 _oracle,
            bytes32 _borrower,
            bytes32 _salt,
            bytes32 _expiration
        ) = decode(_data, L_AMOUNT, L_MODEL, L_ORACLE, L_BORROWER, L_SALT, L_EXPIRATION);

        amount = uint128(uint256(_amount));
        model = address(uint256(_model));
        oracle = address(uint256(_oracle));
        borrower = address(uint256(_borrower));
        salt = uint256(_salt);
        expiration = uint64(uint256(_expiration));
        creator = address(uint256(read(_data, O_CREATOR, L_CREATOR)));
    }

    function ecrecovery(bytes32 _hash, bytes memory _sig) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(_sig, 32))
            s := mload(add(_sig, 64))
            v := and(mload(add(_sig, 65)), 255)
        }

        if (v < 27) {
            v += 27;
        }

        return ecrecover(_hash, v, r, s);
    }

    function _currencyToToken(
        address _oracle,
        uint256 _amount,
        bytes memory _oracleData
    ) internal returns (uint256) {
        if (_oracle == address(0)) return _amount;
        (uint256 tokens, uint256 equivalent) = RateOracle(_oracle).readSample(_oracleData);

        emit ReadedOracle(_oracle, tokens, equivalent);

        return tokens.mult(_amount) / equivalent;
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract),
     * relaxing the requirement on the return value
     * @param _contract The borrower contract that receives the approveRequest(bytes32) call
     * @param _data The call data
     * @return True if the call not reverts and the result of the call
     */
    function _safeCall(
        address _contract,
        bytes memory _data
    ) internal returns (bool success, bytes32 result) {
        bytes memory returnData;
        (success, returnData) = _contract.call(_data);

        if (returnData.length > 0)
            result = abi.decode(returnData, (bytes32));
    }
}
