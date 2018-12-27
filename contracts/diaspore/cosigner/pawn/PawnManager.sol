pragma solidity ^0.5.0;

import "./../../../interfaces/IERC721Base.sol";
import "./../../interfaces/Cosigner.sol";
import "./../../interfaces/ILoanManager.sol";
import "./../../../interfaces/Token.sol";
import "./interfaces/IBundle.sol";
import "./interfaces/IPoach.sol";

import "./../../../utils/BytesUtils.sol";
import "./../../../utils/Ownable.sol";
import "./../../../utils/SafeMath.sol";
import "./../../../utils/ERC721Base.sol";


contract Events {
    event NewPawn(
        uint256 pawnId,
        uint256 loanId,
        address borrower,
        uint256 packageId
    );

    event RequestedPawn(
        uint256 pawnId,
        uint256 loanId,
        address borrower,
        address loanManager,
        uint256 packageId
    );

    event StartedPawn(uint256 pawnId );

    event CanceledPawn(uint256 pawnId, address from, address to);

    event PaidPawn(uint256 pawnId, address from);

    event DefaultedPawn(uint256 pawnId);
}


/**
    @notice The contract is used to handle all the lifetime of a pawn.

    Implements the Cosigner interface of RCN, and when is tied to a loan it creates a new ERC721Base
      to handle the ownership of the pawn.

    When the loan is resolved (paid, pardoned or defaulted), the pawn with his tokens can be recovered.
*/
contract PawnManager is Cosigner, ERC721Base, Events, BytesUtils, Ownable {
    using SafeMath for uint256;

    address constant internal ETH = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;
    ILoanManager public loanManager;
    IBundle public bundle;
    IPoach public poach;

    // Relates packageIds to pawnIds
    mapping(uint256 => uint256) public pawnByPackageId;
    // Relates loanManager address to loanId to pawnIds
    mapping(address => mapping(uint256 => uint256)) public loanToLiability;

    Pawn[] public pawns;

    struct Pawn {
        address owner;
        ILoanManager loanManager;
        uint256 loanId;
        uint256 packageId;
        Status status;
    }

    enum Status { Pending, Ongoing, Canceled, Paid, Defaulted }

    constructor(ILoanManager _loanManager, IBundle _bundle, IPoach _poach) public {
        ILoanManager = _loanManager;
        bundle = _bundle;
        poach = _poach;
        pawns.length++;
    }

    // Getters
    function getLiability(ILoanManager _loanManager, uint256 _loanId) external view returns(uint256) { return loanToLiability[_loanManager][_loanId]; }
    function getPawnId(uint256 _packageId) external view returns(uint256) { return pawnByPackageId[_packageId]; }
    // Struct pawn getters
    function getPawnOwner(uint256 _pawnId) external view returns(address) { return pawns[_pawnId].owner; }
    function getPawnLoanManager(uint256 _pawnId) external view returns(address) { return pawns[_pawnId].loanManager; }
    function getPawnLoanId(uint256 _pawnId) external view returns(uint256) { return pawns[_pawnId].loanId; }
    function getPawnPackageId(uint256 _pawnId) external view returns(uint256) { return pawns[_pawnId].packageId; }
    function getPawnStatus(uint256 _pawnId) external view returns(Status) { return pawns[_pawnId].status; }

    /**
        @notice Request a loan and attachs a pawn request

        @dev Requires the loan signed by the borrower
            The length of _tokens and _amounts should be equal
             also length of _erc721Bases and _ids

        @param _amount  Amount of the loan
        @param _oracle  Oracle of the loan
        @param _borrower Borrower of the loan
        @param _salt Salt of the loan
        @param _expiration Expiration of the loan

        @param _model  Model of the loan
        @param _modelData Data to create a loan, custom by each model
        @param _signature Signature by the borrower

        @param _tokens Array of ERC20 contract addresses
        @param _amounts Array of tokens amounts
        @param _ERC721s Array of ERC721Base contract addresses
        @param _ids Array of non fungible token ids

        @return pawnId The id of the pawn
        @return packageId The id of the package
    */
    function requestPawn(
        uint128 _amount,
        address _oracle,
        address _borrower,
        uint256 _salt,
        uint64 _expiration,
        address _model,
        bytes calldata _modelData,
        bytes calldata _signature,
        // ERC20
        Token[] calldata _tokens,
        uint256[] calldata _amounts,
        // ERC721
        IERC721Base[] calldata _ERC721s,
        uint256[] calldata _ids
    ) external payable returns (uint256, uint256) {
        bytes32 loanId = loanManager.requestLoan(
            _amount,
            _model,
            _oracle,
            _borrower,
            _salt,
            _expiration,
            _loanData
        );

        loanManager.registerApproveRequest(
            loanId,
            _signature
        );

        // require(loanManager.registerApprove(loanManager.getIdentifier(loanId), v, r, s));

        (uint256 pawnId, uint256 packageId) = requestPawnId(loanManager, loanId, _tokens, _amounts, _ERC721s, _ids);

        emit NewPawn(
            pawnId,
            loanId,
            msg.sender,
            packageId
        );

        return (pawnId, packageId);
    }

    /**
        @notice Requests a pawn with a loan identifier

        @dev The loan should exist in the designated loanManager
             The length of _tokens and _amounts should be equal
              also length of _ERC721s and _ids

        @param _loanManager RCN Engine
        @param _loanIdentifier Identifier of the loan asociated with the pawn

        @param _tokens Array of ERC20 contract addresses
        @param _amounts Array of tokens amounts
        @param _ERC721s Array of ERC721 contract addresses
        @param _ids Array of non fungible token ids

        @return pawnId The id of the pawn
        @return packageId The id of the package
    */
    function requestPawnWithLoanIdentifier(
        ILoanManager _loanManager,
        bytes32 _loanIdentifier,
        Token[] calldata _tokens,
        uint256[] calldata _amounts,
        IERC721Base[] calldata _ERC721s,
        uint256[] calldata _ids
    ) external payable returns (uint256 pawnId, uint256 packageId) {
        return requestPawnId(_loanManager, _loanManager.identifierToIndex(_loanIdentifier), _tokens, _amounts, _ERC721s, _ids);
    }

    /**
        @notice Request a pawn to buy a new loan

        @dev The loan should exist in the designated loanManager
             The length of _tokens and _amounts should be equal
              also length of _ERC721s and _ids

        @param _loanManager RCN Engine
        @param _loanId Id of the loan asociated with the pawn

        @param _tokens Array of ERC20 contract addresses
        @param _amounts Array of tokens amounts
        @param _ERC721s Array of ERC721Base contract addresses
        @param _ids Array of non fungible token ids

        @return pawnId The id of the pawn
        @return packageId The id of the package
    */
    function requestPawnId(
        ILoanManager _loanManager,
        uint256 _loanId,
        Token[] calldata _tokens,
        uint256[] calldata _amounts,
        IERC721Base[] calldata _ERC721s,
        uint256[] calldata _ids
    ) external payable returns (uint256 pawnId, uint256 packageId) {
        // Validate the associated loan
        address borrower = _loanManager.getBorrower(_loanId);
        require(_loanManager.getStatus(_loanId) == Engine.Status.initial);
        require(msg.sender == borrower || msg.sender == _loanManager.getCreator(_loanId));
        require(_loanManager.isApproved(_loanId));
        require(loanToLiability[_loanManager][_loanId] == 0);

        packageId = createPackage(_tokens, _amounts, _ERC721s, _ids);

        // Create the liability
        pawnId = pawns.push(Pawn({
            owner: borrower,
            loanManager: _loanManager,
            loanId: _loanId,
            packageId: packageId,
            status: Status.Pending
        })) - 1;

        loanToLiability[_loanManager][_loanId] = pawnId;

        emit RequestedPawn({
            pawnId: pawnId,
            loanId: _loanId,
            borrower: borrower,
            loanManager: _loanManager,
            packageId: packageId
        });
    }

    /**
        @notice Create a package
        @dev The length of _tokens and _amounts should be equal also
              length of _ERC721s and _ids
              The sum of the all amounts of ether should be send

        @param _tokens Array of ERC20 contract addresses
        @param _amounts Array of tokens amounts
        @param _ERC721s Array of ERC721Base contract addresses
        @param _ids Array of non fungible token ids

        @return the index of package on array of bundle contract
    */
    function createPackage(
        Token[] memory _tokens,
        uint256[] memory _amounts,
        IERC721Base[] memory _ERC721s,
        uint256[] memory _ids
    ) internal returns(uint256 packageId) {
        uint256 tokensLength = _tokens.length;
        uint256 erc721sLength = _ERC721s.length;
        require(tokensLength == _amounts.length && erc721sLength == _ids.length);

        packageId = bundle.create();
        uint256 i = 0;
        uint256 poachId;
        uint256 totEth;

        for (; i < tokensLength; i++) {
            if (address(_tokens[i]) != ETH) {
                require(_tokens[i].transferFrom(msg.sender, this, _amounts[i]));
                require(_tokens[i].approve(poach, _amounts[i]));
                poachId = poach.create(_tokens[i], _amounts[i]);
            } else {
                poachId = poach.create.value(_amounts[i])(_tokens[i], _amounts[i]);
                totEth = totEth.add(_amounts[i]);
            }

            require(poach.approve(bundle, poachId));
            bundle.deposit(packageId, IERC721Base(poach), poachId);
        }
        require(totEth == msg.value);

        for (i = 0; i < erc721sLength; i++) {
            require(_ERC721s[i].transferFrom(msg.sender, this, _ids[i]));
            require(_ERC721s[i].approve(bundle, _ids[i]));
        }
        bundle.depositBatch(packageId, _ERC721s, _ids);
    }

    /**
        @notice Cancels an existing pawn and withdraw all tokens
        @dev The pawn status should be pending

        @param _pawnId Id of the pawn
        @param _to The new owner
        @param _asBundle If true only transfer the package, if false transfer all tokens

        @return true If the operation was executed
    */
    function cancelPawn(uint256 _pawnId, address _to, bool _asBundle) external returns (bool) {
        Pawn storage pawn = pawns[_pawnId];

        // Only the owner of the pawn and if the pawn is pending
        require(msg.sender == pawn.owner, "Only the owner can cancel the pawn");
        require(pawn.status == Status.Pending, "The pawn is not pending");

        pawn.status = Status.Canceled;

        _transferAsset(pawn.packageId, _to, _asBundle);

        emit CanceledPawn(_pawnId, msg.sender, _to);
        return true;
    }

    /**
        @dev Use to claim eth to the poach
    */
    function () external payable {
        require(msg.sender == address(poach));
    }

    //
    // Implements cosigner
    //
    uint256 private constant I_PAWN_ID = 0;

    /**
        @notice Returns the cost of the cosigner

        This cosigner does not have any risk or maintenance cost, so its free.

        @return 0, because it's free
    */
    function cost(address , uint256 , bytes calldata, bytes calldata ) external view returns (uint256) {
        return 0;
    }

    /**
        @notice Request the cosign of a loan

        Emits an ERC721 to manage the ownership of the pawn property.

        @param _loanManager Engine of the loan
        @param _index Index of the loan
        @param _data Data with the pawn id

        @return True if the cosign was performed
    */
    function requestCosign(ILoanManager _loanManager, uint256 _index, bytes calldata _data, bytes calldata ) external returns (bool) {
        require(msg.sender == address(_loanManager), "the sender its not the Engine");
        uint256 pawnId = uint256(readBytes32(_data, I_PAWN_ID));
        Pawn storage pawn = pawns[pawnId];

        // Validate that the loan matches with the pawn
        // and the pawn is still pending
        require(pawn.loanManager == _loanManager, "Engine does not match");
        require(pawn.loanId == _index, "Loan id does not match");
        require(pawn.status == Status.Pending, "Pawn is not pending");

        pawn.status = Status.Ongoing;

        // Mint pawn ERC721 Token
        _generate(pawnId, pawn.owner);

        // Cosign contract
        require(_loanManager.cosign(_index, 0), "Error performing cosign");

        // Save pawn id registry
        pawnByPackageId[pawn.packageId] = pawnId;

        // Emit pawn event
        emit StartedPawn(pawnId);

        return true;
    }

    function url() external view returns (string memory) {
        return "";
    }

    /**
        @notice Defines a custom logic that determines if a loan is defaulted or not.

        @param _loanManager RCN Engines
        @param _index Index of the loan

        @return true if the loan is considered defaulted
    */
    function isDefaulted(ILoanManager _loanManager, uint256 _index) external view returns (bool) {
        return _loanManager.getStatus(_index) == Engine.Status.lent &&
            _loanManager.getDueTime(_index) + 7 days <= block.timestamp;
    }

    /**
        @notice Claims the pawn when the loan status is resolved
        and transfers the ownership of the package to which corresponds.

        @dev Deletes the pawn ERC721

        @param _loanManager RCN Engine
        @param _loanId Loan ID

        @return true If the claim succeded
    */
    function claim(address _loanManager, uint256 _loanId, bytes calldata ) external returns (bool) {
        return _claim(_loanManager, _loanId, true);
    }

    /**
        @notice Claims the pawn when the loan status is resolved and transfer all tokens to which corresponds.

        @dev Deletes the pawn ERC721

        @param _loanManager RCN Engine
        @param _loanId Loan ID

        @return true If the claim succeded
    */
    function claimWithdraw(address _loanManager, uint256 _loanId) external returns (bool) {
        return _claim(_loanManager, _loanId, false);
    }

    /**
        @notice Claims the pawn when the loan status is resolved and transfer all tokens to which corresponds.

        @dev Deletes the pawn ERC721

        @param _loanManager RCN Engine
        @param _loanId Loan ID
        @param _asBundle If true only transfer the package, if false transfer all tokens

        @return true If the claim succeded
    */
    function _claim(address _loanManager, uint256 _loanId, bool _asBundle) internal returns(bool){
        uint256 pawnId = loanToLiability[_loanManager][_loanId];
        Pawn storage pawn = pawns[pawnId];
        // Validate that the pawn wasn't claimed
        require(pawn.status == Status.Ongoing, "Pawn not ongoing");
        require(pawn.loanId == _loanId, "Pawn don't match loan id");

        if (pawn.loanManager.getStatus(_loanId) == Engine.Status.paid || pawn.loanManager.getStatus(_loanId) == Engine.Status.destroyed) {
            // The pawn is paid
            require(_isAuthorized(msg.sender, pawnId), "Sender not authorized");

            pawn.status = Status.Paid;

            _transferAsset(pawn.packageId, msg.sender, _asBundle);

            emit PaidPawn(pawnId, msg.sender);
        } else {
            if (isDefaulted(pawn.loanManager, _loanId)) {
                // The pawn is defaulted
                require(msg.sender == pawn.loanManager.ownerOf(_loanId), "Sender not lender");

                pawn.status = Status.Defaulted;

                _transferAsset(pawn.packageId, msg.sender, _asBundle);

                emit DefaultedPawn(pawnId);
            } else {
                revert("Pawn not defaulted/paid");
            }
        }

        // ERC721 Delete asset
        //_destroy(pawnId);

        // Delete pawn id registry
        delete pawnByPackageId[pawn.packageId];

        return true;
    }

    function _transferAsset(uint _packageId, address _to, bool _asBundle) internal returns(bool) {
        if (_asBundle) {
            // Transfer the package back to the _to
            require(bundle.safeTransferFrom(this, _to, _packageId));
        } else {
            // Transfer all tokens to the _to
            require(_withdrawAll(_packageId, _to));
        }

        return true;
    }

    /**
        @notice Transfer all the ERC721 and ERC20 of an package back to the beneficiary

        @dev If the currency its ether and the destiny its a contract, execute the payable deposit()

        @param _packageId Id of the pawn
        @param _beneficiary Beneficiary of tokens

        @return true If the operation was executed
    */
    function _withdrawAll(uint256 _packageId, address _beneficiary) internal returns(bool) {
        address[] memory tokens;
        uint256[] memory ids;
        (tokens, ids) = bundle.content(_packageId);
        uint256 tokensLength = tokens.length;
        // for ERC20 tokens
        address addr;
        uint256 amount;

        for (uint i = 0; i < tokensLength; i++) {
            if (tokens[i] != address(poach)) {
                // for a ERC721 token
                bundle.withdraw(_packageId, IERC721Base(tokens[i]), ids[i], _beneficiary);
            } else { // for a ERC20 token
                bundle.withdraw(_packageId, IERC721Base(tokens[i]), ids[i], address(this));
                (addr, amount,) = poach.getPair(ids[i]);
                require(poach.destroy(ids[i]), "Fail destroy");
                if (addr != ETH)
                    require(Token(addr).transfer(_beneficiary, amount));
                else
                    _beneficiary.transfer(amount);
            }
        }
        return true;
    }
}
