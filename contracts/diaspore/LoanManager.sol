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

    constructor (DebtEngine _debtEngine) public {
        debtEngine = _debtEngine;
        token = debtEngine.token();
        require(token != address(0), "Error loading token");
    }

    function getDirectory() external view returns (bytes32[]) { return directory; }

    function getDirectoryLength() external view returns (uint256) { return directory.length; }

    function getBorrower(uint256 id) external view returns (address) {
        return requests[bytes32(id)].borrower;
    }

    function getCreator(uint256 id) public view returns (address) { return requests[bytes32(id)].creator; }
    function getOracle(uint256 id) public view returns (address) { return requests[bytes32(id)].oracle; }
    function getCosigner(uint256 id) external view returns (address) { return requests[bytes32(id)].cosigner; }
    function getCurrency(uint256 id) external view returns (bytes32) { return requests[bytes32(id)].currency; }
    function getAmount(uint256 id) external view returns (uint256) { return requests[bytes32(id)].amount; }

    function getExpirationRequest(uint256 id) external view returns (uint256) { return requests[bytes32(id)].expiration; }
    function getApproved(uint256 id) external view returns (bool) { return requests[bytes32(id)].approved; }
    function getDueTime(uint256 id) external view returns (uint256) { return Model(requests[bytes32(id)].model).getDueTime(bytes32(id)); }
    function getLoanData(uint256 id) external view returns (bytes) { return requests[bytes32(id)].loanData; }

    function getStatus(uint256 id) public view returns (uint256) {
        Request storage request = requests[bytes32(id)];
        return request.open ? 0 : Model(request.model).getStatus(bytes32(id));
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
        address creator,
        uint256 nonce
    ) external view returns (bytes32) {
        return debtEngine.buildId(
            address(this),
            uint256(keccak256(abi.encodePacked(creator, nonce))),
            true
        );
    }

    function requestLoan(
        bytes8 currency,
        uint128 amount,
        address model,
        address oracle,
        address borrower,
        uint256 nonce,
        uint64 expiration,
        bytes loanData
    ) public returns (bytes32 futureDebt) {
        require(borrower != address(0), "The request should have a borrower");
        require(Model(model).validate(loanData), "The loan data is not valid");

        uint256 internalNonce = uint256(keccak256(abi.encodePacked(msg.sender, nonce)));
        futureDebt = debtEngine.buildId(
            address(this),
            internalNonce,
            true
        );

        require(requests[futureDebt].borrower == address(0), "Request already exist");
        bool approved = msg.sender == borrower;
        uint64 pos;
        if (approved) {
            pos = uint64(directory.push(futureDebt) - 1);
            emit Approved(futureDebt);
        }

        requests[futureDebt] = Request({
            open: true,
            approved: approved,
            position: pos,
            cosigner: address(0),
            currency: currency,
            amount: amount,
            model: model,
            creator: msg.sender,
            oracle: oracle,
            borrower: borrower,
            nonce: internalNonce,
            loanData: loanData,
            expiration: expiration
        });

        emit Requested(futureDebt, nonce);
    }

    function approveRequest(
        bytes32 futureDebt
    ) public returns (bool) {
        Request storage request = requests[futureDebt];
        require(msg.sender == request.borrower, "Only borrower can approve");
        if (!request.approved) {
            request.position = uint64(directory.push(futureDebt) - 1);
            request.approved = true;
            emit Approved(futureDebt);
        }
        return true;
    }

    function lend(
        bytes32 futureDebt,
        bytes oracleData,
        address cosigner,
        uint256 cosignerLimit,
        bytes cosignerData
    ) public returns (bool) {
        Request storage request = requests[futureDebt];
        require(request.open, "Request is no longer open");
        require(request.approved, "The request is not approved by the borrower");
        require(request.expiration > now, "The request is expired");

        request.open = false;

        uint256 tokens = currencyToToken(request.oracle, request.currency, request.amount, oracleData);
        require(
            token.transferFrom(
                msg.sender,
                request.borrower,
                tokens
            ),
            "Error sending tokens to borrower"
        );

        emit Lent(futureDebt, msg.sender, tokens);

        // Generate the debt
        require(
            debtEngine.create2(
                Model(request.model),
                msg.sender,
                request.oracle,
                request.currency,
                request.nonce,
                request.loanData
            ) == futureDebt,
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
        if (cosigner != address(0)) {
            uint256 auxNonce = request.nonce;
            request.cosigner = address(uint256(cosigner) + 2);
            request.nonce = cosignerLimit; // Risky ?
            require(Cosigner(cosigner).requestCosign(Engine(address(this)), uint256(futureDebt), cosignerData, oracleData), "Cosign method returned false");
            require(request.cosigner == cosigner, "Cosigner didn't callback");
            request.nonce = auxNonce;
        }

        return true;
    }

    function requestSignature(
        bytes32[8] requestData,
        bytes loanData
    ) external view returns (bytes32) {
        return keccak256(abi.encodePacked(this, requestData, loanData));
    }

    function _requestSignature(
        bytes32[8] requestData,
        bytes loanData
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(this, requestData, loanData));
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
        bytes32[8] requestData,
        bytes loanData,
        address cosigner,
        uint256 maxCosignerCost,
        bytes cosignerData,
        bytes oracleData,
        bytes creatorSig,
        bytes borrowerSig
    ) public returns (bytes32 futureDebt) {
        require(uint64(requestData[R_EXPIRATION]) > now, "Loan request is expired");
        require(address(requestData[R_BORROWER]) != address(0), "Borrower can't be 0x0");
        require(address(requestData[R_CREATOR]) != address(0), "Creator can't be 0x0");

        uint256 internalNonce = uint256(
            keccak256(
                abi.encodePacked(
                    address(requestData[R_CREATOR]),
                    uint256(requestData[R_NONCE]))
                )
            );

        futureDebt = debtEngine.buildId(
            address(this),
            internalNonce,
            true
        );

        require(requests[futureDebt].borrower == address(0), "Request already exist");

        bytes32 sig = _requestSignature(requestData, loanData);
        validateRequest(sig, requestData, loanData, borrowerSig, creatorSig);

        uint256 tokens = currencyToToken(requestData, oracleData);
        require(
            token.transferFrom(
                msg.sender,
                address(requestData[R_BORROWER]),
                tokens
            ),
            "Error sending tokens to borrower"
        );

        // Generate the debt
        require(createDebt(requestData, loanData, internalNonce) == futureDebt, "Error creating debt registry");

        emit SettledLend(futureDebt, sig, msg.sender, tokens);

        requests[futureDebt] = Request({
            open: false,
            approved: true,
            cosigner: cosigner,
            currency: bytes8(requestData[R_CURRENCY]),
            amount: uint128(requestData[R_AMOUNT]),
            model: address(requestData[R_MODEL]),
            creator: address(requestData[R_CREATOR]),
            oracle: address(requestData[R_ORACLE]),
            borrower: address(requestData[R_BORROWER]),
            nonce: cosigner != address(0) ? maxCosignerCost : internalNonce,
            loanData: "",
            position: 0,
            expiration: uint64(requestData[R_EXPIRATION])
        });

        Request storage request = requests[futureDebt];

        // Call the cosigner
        if (cosigner != address(0)) {
            request.cosigner = address(uint256(cosigner) + 2);
            require(Cosigner(cosigner).requestCosign(Engine(address(this)), uint256(futureDebt), cosignerData, oracleData), "Cosign method returned false");
            require(request.cosigner == cosigner, "Cosigner didn't callback");
            request.nonce = internalNonce;
        }
    }

    function cancel(bytes32 futureDebt) external returns (bool) {
        Request storage request = requests[futureDebt];

        require(
            request.creator == msg.sender || request.borrower == msg.sender,
            "Only borrower or creator can cancel a request"
        );

        // Remove directory entry
        bytes32 last = directory[directory.length - 1];
        requests[last].position = request.position;
        directory[request.position] = last;
        request.position = 0;
        directory.length--;

        delete request.loanData;
        delete requests[futureDebt];

        emit Canceled(futureDebt, msg.sender);

        return true;
    }

    function settleCancel(
        bytes32[8] requestData,
        bytes loanData
    ) external returns (bool) {
        bytes32 sig = _requestSignature(requestData, loanData);
        require(
            msg.sender == address(requestData[R_BORROWER]) ||
            msg.sender == address(requestData[R_CREATOR]),
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
        bytes32 sig,
        bytes32[8] requestData,
        bytes loanData,
        bytes borrowerSig,
        bytes creatorSig
    ) internal {
        require(!canceledSettles[sig], "Settle was canceled");

        uint256 expected = uint256(sig) / 2;
        address borrower = address(requestData[R_BORROWER]);
        address creator = address(requestData[R_CREATOR]);

        if (_isContract(borrower)) {
            require(
                LoanRequester(borrower).loanRequested(requestData, loanData, true, uint256(sig)) == expected,
                "Borrower contract rejected the loan"
            );
        } else {
            require(
                borrower == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", sig)), borrowerSig),
                "Invalid borrower signature"
            );
        }

        if (borrower != creator) {
            if (_isContract(creator)) {
                require(
                    LoanRequester(creator).loanRequested(requestData, loanData, true, uint256(sig)) == expected,
                    "Creator contract rejected the loan"
                );
            } else {
                require(
                    creator == ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", sig)), creatorSig),
                    "Invalid creator signature"
                );
            }
        }
    }

    function createDebt(
        bytes32[8] requestData,
        bytes loanData,
        uint256 internalNonce
    ) internal returns (bytes32) {
        return debtEngine.create2(
            Model(address(requestData[R_MODEL])),
            msg.sender,
            address(requestData[R_ORACLE]),
            bytes8(requestData[R_CURRENCY]),
            internalNonce,
            loanData
        );
    }

    function cosign(uint256 futureDebt, uint256 cost) external returns (bool) {
        Request storage request = requests[bytes32(futureDebt)];
        require(request.position == 0, "Request cosigned is invalid");
        require(request.cosigner != address(0), "Cosigner not valid");
        require(request.expiration > now, "Request is expired");
        require(request.cosigner == address(uint256(msg.sender) + 2), "Cosigner not valid");
        request.cosigner = msg.sender;
        require(request.nonce >= cost || request.nonce == 0, "Cosigner cost exceeded");
        require(token.transferFrom(debtEngine.ownerOf(futureDebt), msg.sender, cost), "Error paying cosigner");
        emit Cosigned(bytes32(futureDebt), msg.sender, cost);
        return true;
    }

    function currencyToToken(
        bytes32[8] requestData,
        bytes oracleData
    ) internal returns (uint256) {
        return currencyToToken(
            address(requestData[R_ORACLE]),
            bytes16(requestData[R_CURRENCY]),
            uint256(requestData[R_AMOUNT]),
            oracleData
        );
    }

    function currencyToToken(
        address oracle,
        bytes16 currency,
        uint256 amount,
        bytes oracleData
    ) internal returns (uint256) {
        if (oracle != 0x0) {
            (uint256 rate, uint256 decimals) = Oracle(oracle).getRate(currency, oracleData);
            return (rate * amount * 10 ** (18 - decimals)) / 10 ** 18;
        } else {
            return amount;
        }
    }

    function _isContract(address addr) internal view returns (bool) {
        uint size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }
}
