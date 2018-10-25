pragma solidity ^0.4.24;

import "./DebtEngine.sol";
import "./interfaces/LoanRequester.sol";

contract LoanManager {
    DebtEngine public debtEngine;
    Token public token;

    bytes32[] public directory;
    mapping(bytes32 => Request) public requests;
    mapping(bytes32 => bool) public canceledSettles;

    event Requested(bytes32 indexed _id, uint256 _nonce);
    event Approved(bytes32 indexed _id);
    event Lent(bytes32 indexed _id, address _lender, uint256 _tokens);
    event Cosigned(bytes32 indexed _id, address _cosigner, uint256 _cost);
    event Canceled(bytes32 indexed _id, address _canceler);
    event ReadedOracle(bytes32 indexed _id, uint256 _amount, uint256 _decimals);

    event SettledLend(bytes32 indexed _id, bytes32 _sig, address _lender, uint256 _tokens);
    event SettledCancel(bytes32 _sig, address _canceler);

    constructor(DebtEngine _debtEngine) public {
        debtEngine = _debtEngine;
        token = debtEngine.token();
        require(token != address(0), "Error loading token");
    }
    
    function getDirectory() external view returns (bytes32[]) { return directory; }

    function getDirectoryLength() external view returns (uint256) { return directory.length; }

    function getBorrower(uint256 _id) external view returns (address) { return requests[bytes32(_id)].borrower; }
    function getCreator(uint256 _id) external view returns (address) { return requests[bytes32(_id)].creator; }
    function getOracle(uint256 _id) external view returns (address) { return requests[bytes32(_id)].oracle; }
    function getCosigner(uint256 _id) external view returns (address) { return requests[bytes32(_id)].cosigner; }
    function getCurrency(uint256 _id) external view returns (bytes32) { return requests[bytes32(_id)].currency; }
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
        bytes8 currency;
        uint64 position;
        uint64 expiration;
        uint128 amount;
        address cosigner;
        address model;
        address creator;
        address oracle;
        address borrower;
        uint256 nonce;
        bytes loanData;
    }

    function calcFutureDebt(
        address _creator,
        uint256 _nonce
    ) external view returns (bytes32) {
        return debtEngine.buildId(
            address(this),
            uint256(keccak256(abi.encodePacked(_creator, _nonce))),
            true
        );
    }

    function requestLoan(
        bytes8 _currency,
        uint128 _amount,
        address _model,
        address _oracle,
        address _borrower,
        uint256 _nonce,
        uint64 _expiration,
        bytes _loanData
    ) external returns (bytes32 futureDebt) {
        require(_borrower != address(0), "The request should have a borrower");
        require(Model(_model).validate(_loanData), "The loan data is not valid");

        uint256 internalNonce = uint256(keccak256(abi.encodePacked(msg.sender, _nonce)));
        futureDebt = debtEngine.buildId(
            address(this),
            internalNonce,
            true
        );

        require(requests[futureDebt].borrower == address(0), "Request already exist");

        requests[futureDebt] = Request({
            open: true,
            approved: approved,
            position: pos,
            cosigner: address(0),
            currency: _currency,
            amount: _amount,
            model: _model,
            creator: msg.sender,
            oracle: _oracle,
            borrower: _borrower,
            nonce: internalNonce,
            loanData: _loanData,
            expiration: _expiration
        });

        emit Requested(futureDebt, _nonce);

        bool approved = msg.sender == _borrower;
        uint64 pos;
        if (approved) {
            pos = uint64(directory.push(futureDebt) - 1);
            emit Approved(futureDebt);
        }
    }

    function approveRequest(
        bytes32 _futureDebt
    ) external returns (bool) {
        Request storage request = requests[_futureDebt];
        require(msg.sender == request.borrower, "Only borrower can approve");
        if (!request.approved) {
            request.position = uint64(directory.push(_futureDebt) - 1);
            request.approved = true;
            emit Approved(_futureDebt);
        }
        return true;
    }

    function lend(
        bytes32 _futureDebt,
        bytes _oracleData,
        address _cosigner,
        uint256 _cosignerLimit,
        bytes _cosignerData
    ) public returns (bool) {
        Request storage request = requests[_futureDebt];
        require(request.open, "Request is no longer open");
        require(request.approved, "The request is not approved by the borrower");
        require(request.expiration > now, "The request is expired");

        request.open = false;

        uint256 tokens = currencyToToken(request.oracle, request.currency, request.amount, _oracleData);
        require(
            token.transferFrom(
                msg.sender,
                request.borrower,
                tokens
            ),
            "Error sending tokens to borrower"
        );

        emit Lent(_futureDebt, msg.sender, tokens);

        // Generate the debt
        require(
            debtEngine.create2(
                Model(request.model),
                msg.sender,
                request.oracle,
                request.currency,
                request.nonce,
                request.loanData
            ) == _futureDebt,
            "Error creating the debt"
        );

        // Purge request
        delete request.loanData;

        // Remove directory entry
        bytes32 last = directory[directory.length - 1];
        requests[last].position = request.position;
        directory[request.position] = last;
        request.position = 0;
        directory.length--;

        // Call the cosigner
        if (_cosigner != address(0)) {
            uint256 auxNonce = request.nonce;
            request.cosigner = address(uint256(_cosigner) + 2);
            request.nonce = _cosignerLimit; // Risky ?
            require(Cosigner(_cosigner).requestCosign(
                    Engine(address(this)),
                    uint256(_futureDebt),
                    _cosignerData,
                    _oracleData
                ),
                "Cosign method returned false"
            );
            require(request.cosigner == _cosigner, "Cosigner didn't callback");
            request.nonce = auxNonce;
        }

        return true;
    }

    function requestSignature(
        bytes32[8] _requestData,
        bytes _loanData
    ) external view returns (bytes32) {
        return keccak256(abi.encodePacked(this, _requestData, _loanData));
    }

    function _requestSignature(
        bytes32[8] _requestData,
        bytes _loanData
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(this, _requestData, _loanData));
    }

    uint256 public constant R_CURRENCY = 0;
    uint256 public constant R_AMOUNT = 1;
    uint256 public constant R_MODEL = 2;
    uint256 public constant R_ORACLE = 3;
    uint256 public constant R_BORROWER = 4;
    uint256 public constant R_NONCE = 5;
    uint256 public constant R_EXPIRATION = 6;
    uint256 public constant R_CREATOR = 7;

    function settleLend(
        bytes32[8] _requestData,
        bytes _loanData,
        address _cosigner,
        uint256 _maxCosignerCost,
        bytes _cosignerData,
        bytes _oracleData,
        bytes _creatorSig,
        bytes _borrowerSig
    ) public returns (bytes32 futureDebt) {
        require(uint64(_requestData[R_EXPIRATION]) > now, "Loan request is expired");
        require(address(_requestData[R_BORROWER]) != address(0), "Borrower can't be 0x0");
        require(address(_requestData[R_CREATOR]) != address(0), "Creator can't be 0x0");

        uint256 internalNonce = uint256(
            keccak256(
                abi.encodePacked(
                    address(_requestData[R_CREATOR]),
                    uint256(_requestData[R_NONCE]))
                )
            );
        
        futureDebt = debtEngine.buildId(
            address(this),
            internalNonce,
            true
        );
        
        require(requests[futureDebt].borrower == address(0), "Request already exist");

        bytes32 sig = _requestSignature(_requestData, _loanData);
        validateRequest(sig, _requestData, _loanData, _borrowerSig, _creatorSig);

        uint256 tokens = currencyToToken(_requestData, _oracleData);
        require(
            token.transferFrom(
                msg.sender,
                address(_requestData[R_BORROWER]),
                tokens
            ),
            "Error sending tokens to borrower"
        );

        // Generate the debt
        require(createDebt(_requestData, _loanData, internalNonce) == futureDebt, "Error creating debt registry");

        emit SettledLend(futureDebt, sig, msg.sender, tokens);

        requests[futureDebt] = Request({
            open: false,
            approved: true,
            cosigner: _cosigner,
            currency: bytes8(_requestData[R_CURRENCY]),
            amount: uint128(_requestData[R_AMOUNT]),
            model: address(_requestData[R_MODEL]),
            creator: address(_requestData[R_CREATOR]),
            oracle: address(_requestData[R_ORACLE]),
            borrower: address(_requestData[R_BORROWER]),
            nonce: _cosigner != address(0) ? _maxCosignerCost : internalNonce,
            loanData: "",
            position: 0,
            expiration: uint64(_requestData[R_EXPIRATION])
        });
        
        Request storage request = requests[futureDebt];

        // Call the cosigner
        if (_cosigner != address(0)) {
            request.cosigner = address(uint256(_cosigner) + 2);
            require(Cosigner(_cosigner).requestCosign(Engine(address(this)), uint256(futureDebt), _cosignerData, _oracleData), "Cosign method returned false");
            require(request.cosigner == _cosigner, "Cosigner didn't callback");
            request.nonce = internalNonce;
        }
    }

    function cancel(bytes32 _futureDebt) external returns (bool) {
        Request storage request = requests[_futureDebt];

        require(request.open, "Request is no longer open or not requested");
        require(
            request.creator == msg.sender || request.borrower == msg.sender,
            "Only borrower or creator can cancel a request"
        );
        
        if(request.approved){
            // Remove directory entry
            bytes32 last = directory[directory.length - 1];
            requests[last].position = request.position;
            directory[request.position] = last;
            request.position = 0;
            directory.length--;
        }

        delete request.loanData;
        delete requests[_futureDebt];

        emit Canceled(_futureDebt, msg.sender);

        return true;
    }

    function settleCancel(
        bytes32[8] _requestData,
        bytes _loanData
    ) external returns (bool) {
        bytes32 sig = _requestSignature(_requestData, _loanData);
        require(
            msg.sender == address(_requestData[R_BORROWER]) ||
            msg.sender == address(_requestData[R_CREATOR]),
            "Only borrower or creator can cancel a settle"
        );
        canceledSettles[sig] = true;
        emit SettledCancel(sig, msg.sender);

        return true;
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

    function validateRequest(
        bytes32 _sig,
        bytes32[8] _requestData,
        bytes _loanData,
        bytes _borrowerSig,
        bytes _creatorSig
    ) internal {
        require(!canceledSettles[_sig], "Settle was canceled");
        
        uint256 expected = uint256(_sig) / 2;
        address borrower = address(_requestData[R_BORROWER]);
        address creator = address(_requestData[R_CREATOR]);

        if (_isContract(borrower)) {
            require(
                LoanRequester(borrower).loanRequested(_requestData, _loanData, true, uint256(_sig)) == expected,
                "Borrower contract rejected the loan"
            );
        } else {
            require(
                borrower == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _sig)), _borrowerSig),
                "Invalid borrower signature"
            );
        }

        if (borrower != creator) {
            if (_isContract(creator)) {
                require(
                    LoanRequester(creator).loanRequested(_requestData, _loanData, true, uint256(_sig)) == expected,
                    "Creator contract rejected the loan"
                );
            } else {
                require(
                    creator == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _sig)), _creatorSig),
                    "Invalid creator signature"
                );
            }
        }
    }

    function createDebt(
        bytes32[8] _requestData,
        bytes _loanData,
        uint256 _internalNonce
    ) internal returns (bytes32) {
        return debtEngine.create2(
            Model(address(_requestData[R_MODEL])),
            msg.sender,
            address(_requestData[R_ORACLE]),
            bytes8(_requestData[R_CURRENCY]),
            _internalNonce,
            _loanData
        );
    }

    function cosign(uint256 _futureDebt, uint256 _cost) external returns (bool) {
        Request storage request = requests[bytes32(_futureDebt)];
        require(request.position == 0, "Request cosigned is invalid");
        require(request.cosigner != address(0), "Cosigner not valid");
        require(request.expiration > now, "Request is expired");
        require(request.cosigner == address(uint256(msg.sender) + 2), "Cosigner not valid");
        request.cosigner = msg.sender;
        require(request.nonce >= _cost || request.nonce == 0, "Cosigner cost exceeded");
        require(token.transferFrom(debtEngine.ownerOf(_futureDebt), msg.sender, _cost), "Error paying cosigner");
        emit Cosigned(bytes32(_futureDebt), msg.sender, _cost);
        return true;
    }

    function currencyToToken(
        bytes32[8] _requestData,
        bytes _oracleData
    ) internal returns (uint256) {
        return currencyToToken(
            address(_requestData[R_ORACLE]),
            bytes16(_requestData[R_CURRENCY]),
            uint256(_requestData[R_AMOUNT]),
            _oracleData
        );
    }

    function currencyToToken(
        address _oracle,
        bytes16 _currency,
        uint256 _amount,
        bytes _oracleData
    ) internal returns (uint256) {
        if (_oracle != 0x0) {
            (uint256 rate, uint256 decimals) = Oracle(_oracle).getRate(_currency, _oracleData);
            return (rate * _amount * 10 ** (18 - decimals)) / 10 ** 18;
        } else {
            return _amount;
        }
    }

    function _isContract(address _addr) internal view returns (bool) {
        uint size;
        assembly { size := extcodesize(_addr) }
        return size > 0;
    }
}
