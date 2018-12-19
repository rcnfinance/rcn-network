pragma solidity ^0.4.24;

import "./DebtEngine.sol";
import "./interfaces/LoanApprover.sol";
import "./interfaces/RateOracle.sol";
import "./../interfaces/Cosigner.sol";
import "./../utils/ImplementsInterface.sol";
import "./../utils/IsContract.sol";
import "./../utils/SafeMath.sol";
import "./../utils/BytesUtils.sol";

contract LoanManager is BytesUtils {
    using ImplementsInterface for address;
    using IsContract for address;
    using SafeMath for uint256;

    DebtEngine public debtEngine;
    Token public token;

    bytes32[] public directory;
    mapping(bytes32 => Request) public requests;
    mapping(bytes32 => bool) public canceledSettles;

    event Requested(bytes32 indexed _id, uint256 _internalSalt);
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
        require(token != address(0), "Error loading token");
        directory.length++;
    }

    function getDirectory() external view returns (bytes32[]) { return directory; }

    function getDirectoryLength() external view returns (uint256) { return directory.length; }

    function getBorrower(uint256 _id) external view returns (address) { return requests[bytes32(_id)].borrower; }
    function getCreator(uint256 _id) external view returns (address) { return requests[bytes32(_id)].creator; }
    function getOracle(uint256 _id) external view returns (address) { return requests[bytes32(_id)].oracle; }
    function getCosigner(uint256 _id) external view returns (address) { return requests[bytes32(_id)].cosigner; }
    function getCurrency(uint256 _id) external view returns (bytes32) {
        address oracle = requests[bytes32(_id)].oracle;
        return oracle == 0x0 ? bytes32(0x0) : RateOracle(oracle).currency();
    }
    function getAmount(uint256 _id) external view returns (uint256) { return requests[bytes32(_id)].amount; }

    function getExpirationRequest(uint256 _id) external view returns (uint256) { return requests[bytes32(_id)].expiration; }
    function getApproved(uint256 _id) external view returns (bool) { return requests[bytes32(_id)].approved; }
    function getDueTime(uint256 _id) external view returns (uint256) { return Model(requests[bytes32(_id)].model).getDueTime(bytes32(_id)); }
    function getLoanData(uint256 _id) external view returns (bytes) { return requests[bytes32(_id)].loanData; }

    function isApproved(uint256 _id) external view returns (bool) {
        return requests[bytes32(_id)].approved;
    }

    function getStatus(uint256 _id) external view returns (uint256) {
        Request storage request = requests[bytes32(_id)];
        return request.open ? 0 : debtEngine.getStatus(bytes32(_id));
    }

    function ownerOf(uint256 _id) external view returns (address) {
        return debtEngine.ownerOf(_id);
    }

    struct Request {
        bool open;
        bool approved;
        uint64 position;
        uint64 expiration;
        uint128 amount;
        address cosigner;
        address model;
        address creator;
        address oracle;
        address borrower;
        uint256 salt;
        bytes loanData;
    }

    function calcId(
        uint128 _amount,
        address _borrower,
        address _creator,
        address _model,
        address _oracle,
        uint256 _salt,
        uint64 _expiration,
        bytes _data
    ) external view returns (bytes32) {
        return debtEngine.buildId2(
            address(this),
            _model,
            _oracle,
            _buildInternalSalt(
                _amount,
                _borrower,
                _creator,
                _salt,
                _expiration
            ),
            _data
        );
    }

    function buildInternalSalt(
        uint128 _amount,
        address _borrower,
        address _creator,
        uint256 _salt,
        uint64 _expiration
    ) external pure returns (uint256) {
        return _buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _salt,
            _expiration
        );
    }

    function internalSalt(bytes32 _id) external view returns (uint256) {
        Request storage request = requests[_id];
        require(request.borrower != address(0), "Request does not exist");
        return _internalSalt(request);
    }

    function _internalSalt(Request _request) internal view returns (uint256) {
        return _buildInternalSalt(
            _request.amount,
            _request.borrower,
            _request.creator,
            _request.salt,
            _request.expiration
        );
    }

    function requestLoan(
        uint128 _amount,
        address _model,
        address _oracle,
        address _borrower,
        uint256 _salt,
        uint64 _expiration,
        bytes _loanData
    ) external returns (bytes32 id) {
        require(_borrower != address(0), "The request should have a borrower");
        require(Model(_model).validate(_loanData), "The loan data is not valid");

        uint256 internalSalt = _buildInternalSalt(_amount, _borrower, msg.sender, _salt, _expiration);
        id = keccak256(
            abi.encodePacked(
                uint8(2),
                debtEngine,
                address(this),
                _model,
                _oracle,
                internalSalt,
                _loanData
            )
        );

        require(requests[id].borrower == address(0), "Request already exist");

        bool approved = msg.sender == _borrower;

        requests[id] = Request({
            open: true,
            approved: approved,
            position: 0,
            cosigner: address(0),
            amount: _amount,
            model: _model,
            creator: msg.sender,
            oracle: _oracle,
            borrower: _borrower,
            salt: _salt,
            loanData: _loanData,
            expiration: _expiration
        });

        emit Requested(id, internalSalt);

        if (!approved) {
            // implements: 0x76ba6009 = approveRequest(bytes32)
            if (_borrower.isContract() && _borrower.implements(0x76ba6009)) {
                approved = _requestContractApprove(id, _borrower);
                requests[id].approved = approved;
            }
        }

        if (approved) {
            requests[id].position = uint64(directory.push(id) - 1);
            emit Approved(id);
        }
    }

    function _requestContractApprove(
        bytes32 _id,
        address _borrower
    ) internal returns (bool approved) {
        // bytes32 expected = _id XOR keccak256("approve-loan-request");
        bytes32 expected = _id ^ 0xdfcb15a077f54a681c23131eacdfd6e12b5e099685b492d382c3fd8bfc1e9a2a;
        (uint256 success, bytes32 result) = _safeCall(
            _borrower,
            abi.encodeWithSelector(
                0x76ba6009,
                _id
            )
        );

        approved = success == 1 && result == expected;

        // Emit events if approve was rejected or failed
        if (approved) {
            emit ApprovedByCallback(_id);
        } else {
            if (success == 0) {
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
            request.position = uint64(directory.push(_id) - 1);
            request.approved = true;
            emit Approved(_id);
        }
        return true;
    }

    function registerApproveRequest(
        bytes32 _id,
        bytes _signature
    ) external returns (bool) {
        Request storage request = requests[_id];
        address borrower = request.borrower;

        if (!request.approved) {
            if (borrower.isContract() && borrower.implements(0x76ba6009)) {
                require(_requestContractApprove(_id, borrower), "The borrower contract dont approve the request");
                // Check request.approved again, protect against reentrancy
                if (!request.approved) {
                    request.position = uint64(directory.push(_id) - 1);
                    request.approved = true;
                    
                    emit Approved(_id);

                    return true;
                }
            } else {
                require(
                    borrower == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _id)), _signature),
                    "Wrong borrower signature"
                );

                request.position = uint64(directory.push(_id) - 1);
                request.approved = true;

                emit ApprovedBySignature(_id);

                return true;
            }
        }
    }

    function lend(
        bytes32 _id,
        bytes _oracleData,
        address _cosigner,
        uint256 _cosignerLimit,
        bytes _cosignerData
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

        // Remove directory entry
        bytes32 last = directory[directory.length - 1];
        requests[last].position = request.position;
        directory[request.position] = last;
        request.position = 0;
        directory.length--;

        // Call the cosigner
        if (_cosigner != address(0)) {
            uint256 auxSalt = request.salt;
            request.cosigner = address(uint256(_cosigner) + 2);
            request.salt = _cosignerLimit; // Risky ?
            require(
                Cosigner(_cosigner).requestCosign(
                    Engine(address(this)),
                    uint256(_id),
                    _cosignerData,
                    _oracleData
                ),
                "Cosign method returned false"
            );
            require(request.cosigner == _cosigner, "Cosigner didn't callback");
            request.salt = auxSalt;
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

        if (request.approved){
            // Remove directory entry
            bytes32 last = directory[directory.length - 1];
            requests[last].position = request.position;
            directory[request.position] = last;
            request.position = 0;
            directory.length--;
        }

        delete request.loanData;
        delete requests[_id];

        emit Canceled(_id, msg.sender);

        return true;
    }

    function cosign(uint256 _id, uint256 _cost) external returns (bool) {
        Request storage request = requests[bytes32(_id)];
        require(request.position == 0, "Request cosigned is invalid");
        require(request.cosigner != address(0), "Cosigner 0x0 is not valid");
        require(request.expiration > now, "Request is expired");
        require(request.cosigner == address(uint256(msg.sender) + 2), "Cosigner not valid");
        request.cosigner = msg.sender;
        require(request.salt >= _cost, "Cosigner cost exceeded");
        require(token.transferFrom(debtEngine.ownerOf(_id), msg.sender, _cost), "Error paying cosigner");
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

    uint256 private constant L_TOTAL = O_CREATOR + L_CREATOR;

    function encodeRequest(
        uint128 _amount,
        address _model,
        address _oracle,
        address _borrower,
        uint256 _salt,
        uint64 _expiration,
        address _creator,
        bytes _loanData
    ) external view returns (bytes requestData, bytes32 id) {
        requestData = abi.encodePacked(
            _amount,
            _model,
            _oracle,
            _borrower,
            _salt,
            _expiration,
            _creator
        );

        uint256 internalSalt = _buildInternalSalt(
            _amount,
            _borrower,
            _creator,
            _salt,
            _expiration
        );

        id = debtEngine.buildId2(
            address(this),
            _model,
            _oracle,
            internalSalt,
            _loanData
        );
    }

    function settleLend(
        bytes _requestData,
        bytes _loanData,
        address _cosigner,
        uint256 _maxCosignerCost,
        bytes _cosignerData,
        bytes _oracleData,
        bytes _creatorSig,
        bytes _borrowerSig
    ) public returns (bytes32 id) {
        // Validate request
        require(uint64(read(_requestData, O_EXPIRATION, L_EXPIRATION)) > now, "Loan request is expired");

        // Get id
        uint256 interSalt;
        (id, interSalt) = _buildSettleId(_requestData, _loanData);

        // Validate signatures
        require(requests[id].borrower == address(0), "Request already exist");
        _validateSettleSignatures(id, _requestData, _loanData, _creatorSig, _borrowerSig);

        // Transfer tokens to borrower
        uint256 tokens = _currencyToToken(_requestData, _oracleData);
        require(
            token.transferFrom(
                msg.sender,
                address(read(_requestData, O_BORROWER, L_BORROWER)),
                tokens
            ),
            "Error sending tokens to borrower"
        );

        // Generate the debt
        require(
            _createDebt(
                _requestData,
                _loanData,
                interSalt
            ) == id,
            "Error creating debt registry"
        );

        emit SettledLend(id, msg.sender, tokens);

        // Save the request info
        requests[id] = Request({
            open: false,
            approved: true,
            cosigner: _cosigner,
            amount: uint128(read(_requestData, O_AMOUNT, L_AMOUNT)),
            model: address(read(_requestData, O_MODEL, L_MODEL)),
            creator: address(read(_requestData, O_CREATOR, L_CREATOR)),
            oracle: address(read(_requestData, O_ORACLE, L_ORACLE)),
            borrower: address(read(_requestData, O_BORROWER, L_BORROWER)),
            salt: _cosigner != address(0) ? _maxCosignerCost : uint256(read(_requestData, O_SALT, L_SALT)),
            loanData: _loanData,
            position: 0,
            expiration: uint64(read(_requestData, O_EXPIRATION, L_EXPIRATION))
        });

        Request storage request = requests[id];

        // Call the cosigner
        if (_cosigner != address(0)) {
            request.cosigner = address(uint256(_cosigner) + 2);
            require(Cosigner(_cosigner).requestCosign(Engine(address(this)), uint256(id), _cosignerData, _oracleData), "Cosign method returned false");
            require(request.cosigner == _cosigner, "Cosigner didn't callback");
            request.salt = uint256(read(_requestData, O_SALT, L_SALT));
        }
    }

    function settleCancel(
        bytes _requestData,
        bytes _loanData
    ) external returns (bool) {
        (bytes32 id, ) = _buildSettleId(_requestData, _loanData);
        require(
            msg.sender == address(read(_requestData, O_BORROWER, L_BORROWER)) ||
            msg.sender == address(read(_requestData, O_CREATOR, L_CREATOR)),
            "Only borrower or creator can cancel a settle"
        );
        canceledSettles[id] = true;
        emit SettledCancel(id, msg.sender);

        return true;
    }

    function _validateSettleSignatures(
        bytes32 _id,
        bytes _requestData,
        bytes _loanData,
        bytes _creatorSig,
        bytes _borrowerSig
    ) internal {
        require(!canceledSettles[_id], "Settle was canceled");

        // bytes32 expected = uint256(_id) XOR keccak256("approve-loan-request");
        bytes32 expected = _id ^ 0xdfcb15a077f54a681c23131eacdfd6e12b5e099685b492d382c3fd8bfc1e9a2a;
        address borrower = address(read(_requestData, O_BORROWER, L_BORROWER));
        address creator = address(read(_requestData, O_CREATOR, L_CREATOR));

        if (borrower.isContract()) {
            require(
                LoanApprover(borrower).settleApproveRequest(_requestData, _loanData, true, uint256(_id)) == expected,
                "Borrower contract rejected the loan"
            );

            emit BorrowerByCallback(_id);
        } else {
            require(
                borrower == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _id)), _borrowerSig),
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
                require(
                    creator == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _id)), _creatorSig),
                    "Invalid creator signature"
                );

                emit CreatorBySignature(_id);
            }
        }
    }

    function _currencyToToken(
        bytes _requestData,
        bytes _oracleData
    ) internal returns (uint256) {
        return _currencyToToken(
            address(read(_requestData, O_ORACLE, L_ORACLE)),
            uint256(read(_requestData, O_AMOUNT, L_AMOUNT)),
            _oracleData
        );
    }

    function _createDebt(
        bytes _requestData,
        bytes _loanData,
        uint256 _internalSalt
    ) internal returns (bytes32) {
        return debtEngine.create2(
            Model(address(read(_requestData, O_MODEL, L_MODEL))),
            msg.sender,
            address(read(_requestData, O_ORACLE, L_ORACLE)),
            _internalSalt,
            _loanData
        );
    }

    function _buildSettleId(
        bytes _requestData,
        bytes _loanData
    ) internal view returns (bytes32 id, uint256 internalSalt) {
        (
            uint128 amount,
            address model,
            address oracle,
            address borrower,
            uint256 salt,
            uint64 expiration,
            address creator
        ) = _decodeSettle(_requestData);

        internalSalt = _buildInternalSalt(
            amount,
            borrower,
            creator,
            salt,
            expiration
        );

        id = debtEngine.buildId2(
            address(this),
            model,
            oracle,
            internalSalt,
            _loanData
        );
    }

    function _buildInternalSalt(
        uint128 _amount,
        address _borrower,
        address _creator,
        uint256 _salt,
        uint64 _expiration
    ) internal pure returns (uint256) {
        return uint256(
            keccak256(
                abi.encodePacked(
                    _amount,
                    _borrower,
                    _creator,
                    _salt,
                    _expiration
                )
            )
        );
    }

    function _decodeSettle(
        bytes _data
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

        amount = uint128(_amount);
        model = address(_model);
        oracle = address(_oracle);
        borrower = address(_borrower);
        salt = uint256(_salt);
        expiration = uint64(_expiration);

        creator = address(read(_data, O_CREATOR, L_CREATOR));
    }

    function ecrecovery(bytes32 _hash, bytes _sig) internal pure returns (address) {
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
        bytes _oracleData
    ) internal returns (uint256) {
        if (_oracle == address(0)) return _amount;
        (uint256 tokens, uint256 equivalent) = RateOracle(_oracle).readSample(_oracleData);

        emit ReadedOracle(_oracle, tokens, equivalent);

        return tokens.mult(_amount) / equivalent;
    }

    function _safeCall(
        address _contract,
        bytes _data
    ) internal returns (uint256 success, bytes32 result) {
        assembly {
            let x := mload(0x40)
            success := call(
                            gas,                 // Send almost all gas
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
