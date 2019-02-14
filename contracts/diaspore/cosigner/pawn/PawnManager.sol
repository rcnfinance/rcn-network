pragma solidity ^0.5.0;

import "./../../../interfaces/IERC721Base.sol";
import "./../../interfaces/Cosigner.sol";
import "./../../interfaces/ILoanManager.sol";
import "./../../../interfaces/Token.sol";
import "./interfaces/IBundle.sol";
import "./interfaces/IPoach.sol";
import "./interfaces/IPawnManager.sol";

import "./../../../utils/BytesUtils.sol";
import "./../../../utils/Ownable.sol";
import "./../../../utils/ERC721Base.sol";


/**
    @notice The contract is used to handle all the lifetime of a pawn.

    Implements the Cosigner interface of RCN, and when is tied to a loan it creates a new ERC721Base
      to handle the ownership of the pawn.

    When the loan is resolved (paid, pardoned or defaulted), the pawn with his tokens can be recovered.
*/
contract PawnManager is Cosigner, ERC721Base, IPawnManager, BytesUtils, Ownable {
    ILoanManager public loanManager;
    IBundle public bundle;
    IPoach public poach;

    // Relates packageIds to pawnIds
    mapping(uint256 => uint256) public pawnByPackageId;
    // Relates loanManager address to loanId to pawnIds
    mapping(address => mapping(bytes32 => uint256)) public loanToLiability;

    Pawn[] public pawns;

    struct Pawn {
        address owner;
        ILoanManager loanManager;
        bytes32 loanId;
        uint256 packageId;
        Status status;
    }

    constructor(ILoanManager _loanManager, IBundle _bundle, IPoach _poach) public ERC721Base("Pawn manager", "PM") {
        loanManager = _loanManager;
        bundle = _bundle;
        poach = _poach;
    }

    /**
        @notice Request a loan and attachs a pawn request

        @dev Requires the loan signed by the borrower
            The length of _tokens and _amounts should be equal
             also length of _erc721s and _erc721Ids

        @param _amount  Amount of the loan
        @param _model  Model of the loan
        @param _oracle  Oracle of the loan
        @param _borrower Borrower of the loan
        @param _salt Salt of the loan
        @param _expiration Expiration of the loan

        @param _modelData Data to create a loan, custom by each model
        @param _signature Signature by the borrower

        @param _tokens Array of ERC20 contract addresses
        @param _amounts Array of tokens amounts
        @param _erc721s Array of ERC721Base contract addresses
        @param _erc721Ids Array of non fungible token ids

        @return pawnId The id of the pawn
        @return packageId The id of the package
    */
    function requestPawn(
        uint128 _amount,
        address _model,
        address _oracle,
        address _borrower,
        uint256 _salt,
        uint64 _expiration,
        bytes memory _modelData,
        bytes memory _signature,
        // ERC20
        Token[] memory _tokens,
        uint256[] memory _amounts,
        // ERC721
        bytes32 loanId = loanManager.requestLoan(
        IERC721Base[] memory _erc721s,
        uint256[] memory _erc721Ids
    ) public payable returns (uint256 pawnId, uint256 packageId) {
            _amount,
            _model,
            _oracle,
            _borrower,
            _salt,
            _expiration,
            _modelData
        );

        require(loanManager.registerApproveRequest(loanId, _signature), "Reject the approve");

        packageId = _createPackage(_tokens, _amounts, _erc721s, _erc721Ids);

        // Create the liability
        pawnId = pawns.push(Pawn({
            owner: _borrower,
            loanManager: loanManager,
            loanId: loanId,
            packageId: packageId,
            status: Status.Pending
        })) - 1;

        loanToLiability[address(loanManager)][loanId] = pawnId;

        emit RequestedPawn(
            pawnId,
            loanId,
            _borrower,
            loanManager,
            packageId
        );

        emit NewPawn(
            pawnId,
            loanId,
            msg.sender,
            packageId
        );
    }

    /**
        @notice Request a pawn to buy a new loan

        @dev The loan should exist in the designated loanManager
             The length of _tokens and _amounts should be equal
              also length of _erc721s and _erc721Ids

        @param _loanManager RCN Engine
        @param _loanId Id of the loan asociated with the pawn

        @param _tokens Array of ERC20 contract addresses
        @param _amounts Array of tokens amounts
        @param _erc721s Array of ERC721Base contract addresses
        @param _erc721Ids Array of non fungible token ids

        @return pawnId The id of the pawn
        @return packageId The id of the package
    */
    function requestPawnId(
        ILoanManager _loanManager,
        bytes32 _loanId,
        Token[] calldata _tokens,
        uint256[] calldata _amounts,
        IERC721Base[] calldata _erc721s,
        uint256[] calldata _erc721Ids
    ) external payable returns (uint256 pawnId, uint256 packageId) {
        // Validate the associated loan
        require(_loanManager.getStatus(_loanId) == 0, "The loan request should be open");
        require(_loanManager.isApproved(_loanId), "The loan its not approve");
        address borrower = _loanManager.getBorrower(_loanId);
        require(msg.sender == borrower || msg.sender == _loanManager.getCreator(_loanId), "The sender should be the borrower or the creator");
        require(loanToLiability[address(_loanManager)][_loanId] == 0, "The liability its taken");

        packageId = _createPackage(_tokens, _amounts, _erc721s, _erc721Ids);

        // Create the liability
        pawnId = pawns.push(Pawn({
            owner: borrower,
            loanManager: _loanManager,
            loanId: _loanId,
            packageId: packageId,
            status: Status.Pending
        })) - 1;

        loanToLiability[address(_loanManager)][_loanId] = pawnId;

        emit RequestedPawn(
            pawnId,
            _loanId,
            borrower,
            _loanManager,
            packageId
        );
    }

    /**
        @notice Create a package
        @dev The length of _tokens and _amounts should be equal also
              length of _erc721s and _erc721Ids
              The sum of the all amounts of ether should be send

        @param _tokens Array of ERC20 contract addresses
        @param _amounts Array of tokens amounts
        @param _erc721s Array of ERC721Base contract addresses
        @param _erc721Ids Array of non fungible token ids

        @return the index of package on array of bundle contract
    */
    function _createPackage(
        Token[] memory _tokens,
        uint256[] memory _amounts,
        IERC721Base[] memory _erc721s,
        uint256[] memory _erc721Ids
    ) internal returns(uint256 packageId) {
        uint256 tokensLength = _tokens.length;
        uint256 erc721sLength = _erc721s.length;
        require(tokensLength == _amounts.length && erc721sLength == _erc721Ids.length, "The lengths must be equal");

        packageId = bundle.create();
        uint256 i;
        uint256 poachId;
        uint256 totEth;

        for (; i < tokensLength; i++) {
            if (address(_tokens[i]) != ETH) {
                require(_tokens[i].transferFrom(msg.sender, address(this), _amounts[i]), "Error pulling tokens");
                require(_tokens[i].approve(address(poach), _amounts[i]), "Error approve tokens");
                poachId = poach.create(_tokens[i], _amounts[i]);
            } else {
                poachId = poach.create.value(_amounts[i])(_tokens[i], _amounts[i]);
                totEth += _amounts[i];
            }

            poach.approve(address(bundle), poachId);
            bundle.deposit(packageId, IERC721Base(poach), poachId);
        }
        require(totEth == msg.value, "The sum of all ETH amounts and msg.value must be equal");

        for (i = 0; i < erc721sLength; i++) {
            _erc721s[i].transferFrom(msg.sender, address(this), _erc721Ids[i]);
            _erc721s[i].approve(address(bundle), _erc721Ids[i]);
        }
        bundle.depositBatch(packageId, _erc721s, _erc721Ids);
    }

    /**
        @notice Cancels an existing pawn and withdraw all tokens
        @dev The pawn status should be pending

        @param _pawnId Id of the pawn
        @param _to The new owner
        @param _asBundle If true only transfer the package, if false transfer all tokens

        @return true If the operation was executed
    */
    function cancelPawn(
        uint256 _pawnId,
        address payable _to,
        bool _asBundle
    ) external returns (bool) {
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
        require(msg.sender == address(poach), "The sender must be the poach");
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
    function cost(address , bytes32 , bytes calldata, bytes calldata ) external view returns (uint256) {
        return 0;
    }

    /**
        @notice Request the cosign of a loan

        Emits an ERC721 to manage the ownership of the pawn property.

        @param _loanManager Engine of the loan
        @param _loanId Id of the loan
        @param _data Data with the pawn id

        @return True if the cosign was performed
    */
    function requestCosign(address _loanManager, bytes32 _loanId, bytes calldata _data, bytes calldata ) external returns (bool) {
        require(msg.sender == _loanManager, "the sender its not the Engine");
        uint256 pawnId = uint256(readBytes32(_data, I_PAWN_ID));
        Pawn storage pawn = pawns[pawnId];

        // Validate that the loan matches with the pawn
        // and the pawn is still pending
        require(pawn.loanManager == ILoanManager(_loanManager), "Engine does not match");
        require(pawn.loanId == _loanId, "Loan id does not match");
        require(pawn.status == Status.Pending, "Pawn is not pending");

        pawn.status = Status.Ongoing;

        // Mint pawn ERC721 Token
        _generate(pawnId, pawn.owner);

        // Cosign contract
        require(ILoanManager(_loanManager).cosign(_loanId, 0), "Error performing cosign");

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
        @param _loanId Id of the loan

        @return true if the loan is considered defaulted
    */
    function isDefaulted(ILoanManager _loanManager, bytes32 _loanId) public view returns (bool) {
        return _loanManager.getStatus(_loanId) == STATUS_ONGOING &&
            _loanManager.getDueTime(_loanId) + 7 days <= block.timestamp;
    }

    /**
        @notice Claims the pawn when the loan status is resolved
        and transfers the ownership of the package to which corresponds.

        @dev Deletes the pawn ERC721

        @param _loanManager RCN Engine
        @param _loanId Loan ID

        @return true If the claim succeded
    */
    function claim(address _loanManager, bytes32 _loanId, bytes calldata ) external returns (bool) {
        return _claim(_loanManager, _loanId, true);
    }

    /**
        @notice Claims the pawn when the loan status is resolved and transfer all tokens to which corresponds.

        @dev Deletes the pawn ERC721

        @param _loanManager RCN Engine
        @param _loanId Loan ID

        @return true If the claim succeded
    */
    function claimWithdraw(address _loanManager, bytes32 _loanId) external returns (bool) {
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
    function _claim(address _loanManager, bytes32 _loanId, bool _asBundle) internal returns(bool){
        uint256 pawnId = loanToLiability[_loanManager][_loanId];
        Pawn storage pawn = pawns[pawnId];
        // Validate that the pawn wasn't claimed
        require(pawn.status == Status.Ongoing, "Pawn not ongoing");
        require(pawn.loanId == _loanId, "Pawn don't match loan id");

        if (pawn.loanManager.getStatus(_loanId) == STATUS_PAID) {
            // The pawn is paid
            require(_isAuthorized(msg.sender, uint256(_loanId)), "Sender not authorized");

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

    function _transferAsset(uint256 _packageId, address payable _to, bool _asBundle) internal returns(bool) {
        if (_asBundle) // Transfer the package back to the _to
            bundle.safeTransferFrom(address(this), _to, _packageId);
        else // Transfer all tokens to the _to
            require(_withdrawAll(_packageId, _to));

        return true;
    }

    /**
        @notice Transfer all the ERC721 and ERC20 of an package back to the beneficiary

        @dev If the currency its ether and the destiny its a contract, execute the payable deposit()

        @param _packageId Id of the pawn
        @param _beneficiary Beneficiary of tokens

        @return true If the operation was executed
    */
    function _withdrawAll(uint256 _packageId, address payable _beneficiary) internal returns(bool) {
        (IERC721Base[] memory erc721s, uint256[] memory erc721Ids) = bundle.content(_packageId);
        Token addr;
        uint256 amount;

        for (uint256 i = 0; i < erc721s.length; i++) {
            if (erc721s[i] != poach) {
                // for a ERC721 token
                bundle.withdraw(_packageId, erc721s[i], erc721Ids[i], _beneficiary);
            } else { // for a ERC20 token
                bundle.withdraw(_packageId, erc721s[i], erc721Ids[i], address(this));
                (addr, amount) = poach.getPair(erc721Ids[i]);
                require(poach.withdraw(erc721Ids[i], _beneficiary), "Fail destroy");
                if (address(addr) != ETH)
                    require(addr.transfer(_beneficiary, amount), "Error transfer tokens");
                else
                    _beneficiary.transfer(amount);
            }
        }
        return true;
    }
}
