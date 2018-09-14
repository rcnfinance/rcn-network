pragma solidity ^0.4.24;

import "./interfaces/Oracle.sol";
import "./interfaces/Cosigner.sol";
import "./utils/Ownable.sol";

interface IERC721Receiver {
    function onERC721Received(
        address _oldOwner,
        uint256 _tokenId,
        bytes   _userData
    ) external returns (bytes4);
}

library SafeMath {
    function add(uint256 x, uint256 y) internal pure returns (uint256) {
        uint256 z = x + y;
        require((z >= x) && (z >= y), "Add overflow");
        return z;
    }

    function sub(uint256 x, uint256 y) internal pure returns (uint256) {
        require(x >= y, "Sub underflow");
        uint256 z = x - y;
        return z;
    }

    function mult(uint256 x, uint256 y) internal pure returns (uint256) {
        uint256 z = x * y;
        require((x == 0)||(z/x == y), "Mult overflow");
        return z;
    }
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0, "Div overflow");
        uint256 c = a / b;
        return c;
    }
}

library SafeMathWrapper {

    struct Result { 
        bool err;
    }

    /**
    * @dev Adds two number, returns an error status on overflow.
    * Gas optimization: if exist an error not evaluate the operation and return 0.
    */
    function safeAdd(uint256 a, uint256 b, Result memory self) internal returns (uint256) {
        if (self.err) {
            return 0;
        }
        uint256 c = a + b;
        if (c >= a) {
            return c;
        }  
        self.err = true;
    }

    /**
    * @dev Subtracts two numbers, returns an error status on overflow.
    * Gas optimization: if exist an error not evaluate the operation and return 0.
    */
    function safeSub(uint256 x, uint256 y, Result memory self) internal returns (uint256) {
        if (self.err) { 
            return 0;
        }
        if (x >= y) {
            uint256 z = x - y;
            return z;
        }
        self.err = true;
    }

    /**
    * @dev Multiplies two numbers, returns an error status on overflow.
    * Gas optimization: if exist an error not evaluate the operation and return 0.
    */
    function safeMul(uint256 a, uint256 b, Result memory self) internal returns (uint256) {
        if (a == 0 || self.err) {
            return 0;
        }
        uint256 c = a * b;
        if (c / a == b) {
            return c;
        }
        self.err = true;
    }
  
    /**
    * @dev Integer division of two numbers truncating the quotient, returns an error status on overflow.
    * Gas optimization: if exist an error not evaluate the operation and return 0.
    */
    function safeDiv(uint256 a, uint256 b, Result memory self) internal returns (uint256) {
        if (self.err) {
            return 0;
        }
        if (b > 0) { 
            uint256 c = a / b;
            return c;
        }
        self.err = true;
    }

}

contract ERC721Base {
    using SafeMath for uint256;

    uint256 private _count;

    mapping(uint256 => address) private _holderOf;
    mapping(address => uint256[]) private _assetsOf;
    mapping(address => mapping(address => bool)) private _operators;
    mapping(uint256 => address) private _approval;
    mapping(uint256 => uint256) private _indexOfAsset;

    event Transfer(address indexed _from, address indexed _to, uint256 _tokenId);
    event Approval(address indexed _owner, address indexed _approved, uint256 _tokenId);
    event ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved);

    //
    // Global Getters
    //

    /**
     * @dev Gets the total amount of assets stored by the contract
     * @return uint256 representing the total amount of assets
     */
    function totalSupply() external view returns (uint256) {
        return _totalSupply();
    }
    function _totalSupply() internal view returns (uint256) {
        return _count;
    }

    //
    // Asset-centric getter functions
    //

    /**
     * @dev Queries what address owns an asset. This method does not throw.
     * In order to check if the asset exists, use the `exists` function or check if the
     * return value of this call is `0`.
     * @return uint256 the assetId
     */
    function ownerOf(uint256 assetId) external view returns (address) {
        return _ownerOf(assetId);
    }
    function _ownerOf(uint256 assetId) internal view returns (address) {
        return _holderOf[assetId];
    }

    //
    // Holder-centric getter functions
    //
    /**
     * @dev Gets the balance of the specified address
     * @param owner address to query the balance of
     * @return uint256 representing the amount owned by the passed address
     */
    function balanceOf(address owner) external view returns (uint256) {
        return _balanceOf(owner);
    }
    function _balanceOf(address owner) internal view returns (uint256) {
        return _assetsOf[owner].length;
    }

    //
    // Authorization getters
    //

    /**
     * @dev Query whether an address has been authorized to move any assets on behalf of someone else
     * @param operator the address that might be authorized
     * @param assetHolder the address that provided the authorization
     * @return bool true if the operator has been authorized to move any assets
     */
    function isApprovedForAll(address operator, address assetHolder)
        external view returns (bool)
    {
        return _isApprovedForAll(operator, assetHolder);
    }
    function _isApprovedForAll(address operator, address assetHolder)
        internal view returns (bool)
    {
        return _operators[assetHolder][operator];
    }

    /**
     * @dev Query what address has been particularly authorized to move an asset
     * @param assetId the asset to be queried for
     * @return bool true if the asset has been approved by the holder
     */
    function getApprovedAddress(uint256 assetId) external view returns (address) {
        return _getApprovedAddress(assetId);
    }
    function _getApprovedAddress(uint256 assetId) internal view returns (address) {
        return _approval[assetId];
    }

    /**
     * @dev Query if an operator can move an asset.
     * @param operator the address that might be authorized
     * @param assetId the asset that has been `approved` for transfer
     * @return bool true if the asset has been approved by the holder
     */
    function isAuthorized(address operator, uint256 assetId) external view returns (bool) {
        return _isAuthorized(operator, assetId);
    }
    function _isAuthorized(address operator, uint256 assetId) internal view returns (bool)
    {
        require(operator != 0);
        address owner = _ownerOf(assetId);
        if (operator == owner) {
            return true;
        }
        return _isApprovedForAll(operator, owner) || _getApprovedAddress(assetId) == operator;
    }

    //
    // Authorization
    //

    /**
     * @dev Authorize a third party operator to manage (send) msg.sender's asset
     * @param operator address to be approved
     * @param authorized bool set to true to authorize, false to withdraw authorization
     */
    function setApprovalForAll(address operator, bool authorized) external {
        return _setApprovalForAll(operator, authorized);
    }
    function _setApprovalForAll(address operator, bool authorized) internal {
        if (authorized) {
            require(!_isApprovedForAll(operator, msg.sender));
            _addAuthorization(operator, msg.sender);
        } else {
            require(_isApprovedForAll(operator, msg.sender));
            _clearAuthorization(operator, msg.sender);
        }
        emit ApprovalForAll(operator, msg.sender, authorized);
    }

    /**
     * @dev Authorize a third party operator to manage one particular asset
     * @param operator address to be approved
     * @param assetId asset to approve
     */
    function approve(address operator, uint256 assetId) external {
        address holder = _ownerOf(assetId);
        require(msg.sender == holder || _isApprovedForAll(msg.sender, holder));
        require(operator != holder);
        if (_getApprovedAddress(assetId) != operator) {
            _approval[assetId] = operator;
            emit Approval(holder, operator, assetId);
        }
    }

    function _addAuthorization(address operator, address holder) private {
        _operators[holder][operator] = true;
    }

    function _clearAuthorization(address operator, address holder) private {
        _operators[holder][operator] = false;
    }

    //
    // Internal Operations
    //

    function _addAssetTo(address to, uint256 assetId) internal {
        _holderOf[assetId] = to;

        uint256 length = _balanceOf(to);

        _assetsOf[to].push(assetId);

        _indexOfAsset[assetId] = length;

        _count = _count.add(1);
    }

    function _removeAssetFrom(address from, uint256 assetId) internal {
        uint256 assetIndex = _indexOfAsset[assetId];
        uint256 lastAssetIndex = _balanceOf(from).sub(1);
        uint256 lastAssetId = _assetsOf[from][lastAssetIndex];

        _holderOf[assetId] = 0;

        // Insert the last asset into the position previously occupied by the asset to be removed
        _assetsOf[from][assetIndex] = lastAssetId;

        // Resize the array
        _assetsOf[from][lastAssetIndex] = 0;
        _assetsOf[from].length--;

        // Remove the array if no more assets are owned to prevent pollution
        if (_assetsOf[from].length == 0) {
            delete _assetsOf[from];
        }

        // Update the index of positions for the asset
        _indexOfAsset[assetId] = 0;
        _indexOfAsset[lastAssetId] = assetIndex;

        _count = _count.sub(1);
    }

    function _clearApproval(address holder, uint256 assetId) internal {
        if (_ownerOf(assetId) == holder && _approval[assetId] != 0) {
            _approval[assetId] = 0;
            emit Approval(holder, 0, assetId);
        }
    }

    //
    // Supply-altering functions
    //

    function _generate(uint256 assetId, address beneficiary) internal {
        require(_holderOf[assetId] == 0);

        _addAssetTo(beneficiary, assetId);

        emit Transfer(0x0, beneficiary, assetId);
    }

    function _destroy(uint256 assetId) internal {
        address holder = _holderOf[assetId];
        require(holder != 0);

        _removeAssetFrom(holder, assetId);

        emit Transfer(holder, 0x0, assetId);
    }

    //
    // Transaction related operations
    //

    modifier onlyHolder(uint256 assetId) {
        require(_ownerOf(assetId) == msg.sender);
        _;
    }

    modifier onlyAuthorized(uint256 assetId) {
        require(_isAuthorized(msg.sender, assetId));
        _;
    }

    modifier isCurrentOwner(address from, uint256 assetId) {
        require(_ownerOf(assetId) == from);
        _;
    }

    /**
     * @dev Alias of `safeTransferFrom(from, to, assetId, '')`
     *
     * @param from address that currently owns an asset
     * @param to address to receive the ownership of the asset
     * @param assetId uint256 ID of the asset to be transferred
     */
    function safeTransferFrom(address from, address to, uint256 assetId) external {
        return _doTransferFrom(from, to, assetId, "", true);
    }

    /**
     * @dev Securely transfers the ownership of a given asset from one address to
     * another address, calling the method `onNFTReceived` on the target address if
     * there's code associated with it
     *
     * @param from address that currently owns an asset
     * @param to address to receive the ownership of the asset
     * @param assetId uint256 ID of the asset to be transferred
     * @param userData bytes arbitrary user information to attach to this transfer
     */
    function safeTransferFrom(address from, address to, uint256 assetId, bytes userData) external {
        return _doTransferFrom(from, to, assetId, userData, true);
    }

    /**
     * @dev Transfers the ownership of a given asset from one address to another address
     * Warning! This function does not attempt to verify that the target address can send
     * tokens.
     *
     * @param from address sending the asset
     * @param to address to receive the ownership of the asset
     * @param assetId uint256 ID of the asset to be transferred
     */
    function transferFrom(address from, address to, uint256 assetId) external {
        return _doTransferFrom(from, to, assetId, "", false);
    }

    function _doTransferFrom(
        address from,
        address to,
        uint256 assetId,
        bytes userData,
        bool doCheck
    )
        onlyAuthorized(assetId)
        internal
    {
        _moveToken(from, to, assetId, userData, doCheck);
    }

    function _moveToken(
        address from,
        address to,
        uint256 assetId,
        bytes userData,
        bool doCheck
    )
        internal
        isCurrentOwner(from, assetId)
    {
        address holder = _holderOf[assetId];
        _removeAssetFrom(holder, assetId);
        _clearApproval(holder, assetId);
        _addAssetTo(to, assetId);

        if (doCheck && _isContract(to)) {
            // Equals to bytes4(keccak256("onERC721Received(address,uint256,bytes)"))
            bytes4 ERC721_RECEIVED = bytes4(0xf0b9e5ba);
            require(
                IERC721Receiver(to).onERC721Received(
                    holder, assetId, userData
                ) == ERC721_RECEIVED
            );
        }

        emit Transfer(holder, to, assetId);
    }

    /**
     * Internal function that moves an asset from one holder to another
     */

    /**
     * @dev Returns `true` if the contract implements `interfaceID` and `interfaceID` is not 0xffffffff, `false` otherwise
     * @param    _interfaceID The interface identifier, as specified in ERC-165
     */
    function supportsInterface(bytes4 _interfaceID) external view returns (bool) {

        if (_interfaceID == 0xffffffff) {
            return false;
        }
        return _interfaceID == 0x01ffc9a7 || _interfaceID == 0x80ac58cd;
    }

    //
    // Utilities
    //

    function _isContract(address addr) internal view returns (bool) {
        uint size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }
}

contract LoanEngine is Ownable, ERC721Base {
      
    using SafeMath for *;
    using SafeMathWrapper for *;

    uint256 constant internal PRECISION = (10**18);
    uint256 constant internal TOKEN_DECIMALS = 18;

    uint256 public constant VERSION = 300;
    string public constant VERSION_NAME = "Cobalt";


    event CreatedLoan(uint _index, address _borrower, address _creator);
    event ApprovedBy(uint _index, address _address);
    event Lent(uint _index, address _lender, address _cosigner);
    event DestroyedBy(uint _index, address _address);
    event PartialPayment(uint _index, address _sender, address _from, uint256 _total, uint256 _interest);
    event TotalPayment(uint _index);
    event ConvertRate(address indexed _oracle, uint256 _amount, uint256 _rate);
    event AccruedInterest(uint64 from, uint64 delta, uint128 debt, uint128 newInterest, uint128 loanPaid, uint128 paidInterest);

    function name() external pure returns (string _name) {
        _name = "RCN - Loan engine - Cobalt 300";
    }

    function symbol() external pure returns (string _symbol) {
        _symbol = "RCN-LE-300";
    }
    
    enum Status { request, ongoing, paid, destroyed, error }

    address public deprecated;
    Loan[] private loans;
    mapping(bytes32 => uint256) public identifierToIndex;

    struct Loan {
        // State
        bool approved;
        Status status;
        uint16 installments;
        uint64 clock;
        uint64 index;
        uint64 installmentDuration;
        uint64 lentTime;
        uint64 requestExpiration;
        bytes16 currency;
        uint128 accrued;
        uint128 amount;
        uint128 paid;
        uint128 paidBase;
        uint128 cuota;
        // Internal
        uint128 interest;
        uint128 lenderBalance;
        address borrower;
        address creator;
        address oracle;
        address cosigner;
        uint256 interestRatePunitory;
        string metadata;
    }
    
    function getTotalLoans() external view returns (uint256) { return loans.length; }

    // Configuration
    function getBorrower(uint256 id) external view returns (address) { return loans[id].borrower; }
    function getCreator(uint256 id) external view returns (address) { return loans[id].creator; }
    function getOracle(uint256 id) external view returns (address) { return loans[id].oracle; }
    function getCosigner(uint256 id) external view returns (address) { return loans[id].cosigner; }
    function getCurrency(uint256 id) external view returns (bytes32) { return loans[id].currency; }
    function getCuota(uint256 id) external view returns (uint256) { return loans[id].cuota; }
    function getInterestRatePunitory(uint256 id) external view returns (uint256) { return loans[id].interestRatePunitory; }
    function getAmount(uint256 id) external view returns (uint256) { return loans[id].amount; }
    function getInstallments(uint256 id) external view returns (uint256) { return loans[id].installments; }

    function getPaid(uint256 id) external view returns (uint256) { return loans[id].paid; }
    function getInstallmentDuration(uint256 id) external view returns (uint256) { return loans[id].installmentDuration; }
    function getLentTime(uint256 id) external view returns (uint256) { return loans[id].lentTime; }
    function getExpirationRequest(uint256 id) external view returns (uint256) { return loans[id].requestExpiration; }
    function getApproved(uint256 id) external view returns (bool) { return loans[id].approved; }
    function getDueTime(uint256 id) external view returns (uint256) { return loans[id].installments * loans[id].installmentDuration; }
    function getStatus(uint256 id) external view returns (Status) { return loans[id].status; }
    function getCheckpoint(uint256 id) external view returns (uint256) { return loans[id].clock / loans[id].installmentDuration; }
    function getLenderBalance(uint256 id) external view returns (uint256) { return loans[id].lenderBalance; }
    function getDuesIn(uint256 id) external view returns (uint256) {
        Loan memory loan = loans[id];
        if (loan.lentTime == 0) { return 0; }
        return loan.lentTime + loan.installments * loan.installmentDuration;
    }

    function getCurrentDebt(uint256 loanId) external view returns (uint256) {
        return _currentDebt(loans[loanId]);
    }

    Token public token;

    constructor(Token _token) public {
        token = _token;
        // The loan 0 is a Invalid loan
        loans.length++;
    }
    
    function requestLoan(
        address oracle,
        address borrower,
        bytes16 currency,
        uint256 interestRatePunitory,
        uint128 amount,
        uint128 cuota,
        uint16 installments,
        uint64 installmentDuration,
        uint64 requestExpiration,
        string metadata
    ) public returns (uint256) {
        require(deprecated == address(0), "The engine is deprectaed");
        require(borrower != address(0), "Borrower can't be 0x0");
        require(interestRatePunitory != 0, "P Interest rate wrong encoded");
        require(requestExpiration > now, "Request is already expired");
        require(installmentDuration > 0, "Installment should have a duration");
        require(installments > 0, "Min installments is 1");
        require(cuota * installments >= amount, "Negative interest is not allowed");

        Loan memory loan = Loan({
            index: uint64(loans.length),
            borrower: borrower,
            creator: msg.sender,
            oracle: oracle,
            cosigner: address(0),
            currency: currency,
            cuota: cuota,
            interestRatePunitory: interestRatePunitory,
            amount: amount,
            paid: 0,
            lentTime: 0,
            installments: installments,
            installmentDuration: installmentDuration,
            clock: 0,
            status: Status.request,
            approved: msg.sender == borrower,
            accrued: 0,
            interest: 0,
            lenderBalance: 0,
            paidBase: 0,
            requestExpiration: requestExpiration,
            metadata: metadata
        });

        uint index = loans.push(loan) - 1;
        emit CreatedLoan(index, borrower, msg.sender);

        bytes32 identifier = getIdentifier(index);
        require(identifierToIndex[identifier] == 0, "Loan already exists");
        identifierToIndex[identifier] = index;

        if (msg.sender == borrower) {
            emit ApprovedBy(index, msg.sender);
        }

        return index;
    }
    
    function getIdentifier(uint index) public view returns (bytes32) {
        Loan memory loan = loans[index];
        return buildIdentifier(
            loan.creator,
            loan.borrower,
            loan.oracle,
            loan.currency,
            loan.amount,
            loan.cuota,
            loan.interestRatePunitory,
            loan.installments,
            loan.installmentDuration,
            loan.requestExpiration,
            loan.metadata
        );
    }
    
    /**
        @notice Used to reference a loan that is not yet created, and by that does not have an index

        @dev Two identical loans cannot exist, only one loan per signature is allowed

        @return The signature hash of the loan configuration
    */
    function buildIdentifier(
        address creator,
        address borrower,
        address oracle,
        bytes32 currency,
        uint128 amount,
        uint128 cuota,
        uint256 interestRatePunitory,
        uint32 installments,
        uint64 installmentDuration,
        uint64 requestExpiration,
        string metadata
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                this,
                creator,
                borrower,
                oracle,
                currency,
                amount,
                cuota,
                interestRatePunitory,
                installments,
                installmentDuration,
                requestExpiration,
                metadata
            )
        ); 
    }
    
    /**
        @notice Called by the members of the loan to show that they agree with the terms of the loan; the borrower
        must call this method before any lender could call the method "lend".
            
        @dev Any address can call this method to be added to the "approbations" mapping.

        @param index Index of the loan

        @return true if the approve was done successfully
    */
    function approveLoan(uint index) external returns (bool) {
        Loan storage loan = loans[index];
        require(loan.borrower == msg.sender, "Only the borrower can approve the loan");
        loan.approved = true;
        emit ApprovedBy(index, msg.sender);
        return true;
    }

    /**
        @notice Approves a loan using the Identifier and not the index

        @param identifier Identifier of the loan

        @return true if the approve was done successfully
    */
    function approveLoanIdentifier(bytes32 identifier) external returns (bool) {
        uint256 index = identifierToIndex[identifier];
        require(index != 0, "Loan does not exist");
        require(loan.borrower == msg.sender, "Only the borrower can approve the loan");
        Loan storage loan = loans[index];
        loan.approved = true;
        emit ApprovedBy(index, msg.sender);
        return true;
    }

    /**
        @notice Register an approvation made by a borrower in the past

        @dev The loan should exist and have an index

        @param identifier Identifier of the loan

        @return true if the approve was done successfully
    */
    function registerApprove(bytes32 identifier, uint8 v, bytes32 r, bytes32 s) external returns (bool) {
        uint256 index = identifierToIndex[identifier];
        require(index != 0, "The loan does not exist");
        Loan storage loan = loans[index];
        address signer = ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", identifier)), v, r, s);
        require(loan.borrower == signer, "The approve is not signed by the borrower");
        loan.approved = true;
        emit ApprovedBy(index, loan.borrower);
        return true;
    }
    
    /**
        @notice Returns the loan metadata, this field can be set by the creator of the loan with his own criteria.

        @param index Index of the loan

        @return The string with the metadata
    */
    function tokenMetadata(uint256 index) external view returns (string) {
        return loans[index].metadata;
    }

    function _baseDebt(Loan memory loan) internal pure returns (uint128) {
        uint32 installment = uint32(loan.clock.div(loan.installmentDuration));
        return uint128(installment < loan.installments ? installment.mult(loan.cuota) : loan.installments.mult(loan.cuota));
    }

    /**
        @notice Returns the loan metadata, hashed with keccak256.
        @dev This emthod is useful to evaluate metadata from a smart contract.

        @param index Index of the loan

        @return The metadata hashed with keccak256
    */
    function tokenMetadataHash(uint256 index) external view returns (bytes32) {
        return keccak256(abi.encodePacked(loans[index].metadata));
    }

    function _currentDebt(Loan memory loan) internal pure returns (uint256) {
        uint128 debt = _baseDebt(loan) + loan.interest;
        return loan.paid < debt ? debt - loan.paid : 0;
    }

    function advanceClock(Loan storage loan, uint64 targetDelta) internal returns (bool) {
        // Advance no more than the next installment unless we passed the last one
        uint64 nextInstallmentDelta = loan.installmentDuration - loan.clock % loan.installmentDuration;
        uint64 currentInstallment = loan.clock / loan.installmentDuration;
        uint64 delta = nextInstallmentDelta < targetDelta && currentInstallment < loan.installments ? nextInstallmentDelta : targetDelta;

        uint128 runningDebt = _baseDebt(loan) - loan.paidBase;
        uint128 newInterest = uint128(calculateInterest(delta, loan.interestRatePunitory, runningDebt));
        loan.interest += newInterest;

        emit AccruedInterest(loan.clock, delta, runningDebt, newInterest, loan.paid, loan.paidBase);

        // Don't change clock unless we have a change
        if (newInterest > 0 || delta == nextInstallmentDelta) {
            loan.clock += delta;
            return true;
        }
    }
    
    function checkFullyPaid(Loan storage loan) internal returns (bool) {
        uint32 currentInstallment = uint32((loan.clock / loan.installmentDuration));
        if ((currentInstallment >= loan.installments) && (_baseDebt(loan) + loan.interest <= loan.paid)) {
            // Loan paid!
            emit TotalPayment(loan.index);
            loan.status = Status.paid;
            return true;
        }
    }

    function moveCheckpoint(Loan storage loan, uint64 to) internal {
        bool advanced = true;
        uint64 targetDelta = to - loan.lentTime;
        while (loan.clock < targetDelta && advanced) {
            advanced = advanceClock(loan, targetDelta - loan.clock);
        }
    }
    
    function fixAdvance(uint256 loanId, uint64 to) external returns (bool) {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.ongoing, "The loan should be ongoing");
        require(to <= now, "Can't advance a loan into the future");
        require(loan.clock + loan.lentTime < to, "The loan already passed that date");
        moveCheckpoint(loan, to);
        return true;
    }
    
    function lend(uint256 loanId, bytes oracleData, address cosigner, bytes cosignerData) external {
        Loan storage loan = loans[loanId];
        require(loan.approved, "The loan is not approved by the borrower");
        require(loan.status == Status.request, "The loan is not a request");
        require(now < loan.requestExpiration, "Request is expired");
        uint256 requiredTransfer = convertRate(loan.oracle, loan.currency, oracleData, loan.amount);
        require(token.transferFrom(msg.sender, loan.borrower, requiredTransfer), "Error pulling tokens");
        _generate(loanId, msg.sender);

        loan.status = Status.ongoing;
        loan.lentTime = uint64(now);
        loan.clock = loan.installmentDuration;

        if (cosigner != address(0)) {
            // The cosigner it's temporary set to the next address (cosigner + 2), it's expected that the cosigner will
            // call the method "cosign" to accept the conditions; that method also sets the cosigner to the right
            // address. If that does not happen, the transaction fails.
            loan.cosigner = address(uint256(cosigner) + 2);
            require(Cosigner(cosigner).requestCosign(Engine(this), loanId, cosignerData, oracleData), "Cosign method returned false");
            require(loan.cosigner == cosigner, "Cosigner didn't called callback");
        }
        
        emit Lent(loanId, msg.sender, cosigner);
    }
    
    /**
        @notice The cosigner must call this method to accept the conditions of a loan, this method pays the cosigner his fee.
        
        @dev If the cosigner does not call this method the whole "lend" call fails.

        @param loanId Index of the loan
        @param cost Fee set by the cosigner

        @return true If the cosign was successfull
    */
    function cosign(uint loanId, uint256 cost) external returns (bool) {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.ongoing && loan.lentTime == block.timestamp, "Cosign on the wrong tx");
        require(loan.cosigner != address(0), "Cosigner not valid");
        require(loan.cosigner == address(uint256(msg.sender) + 2), "Cosigner not valid");
        loan.cosigner = msg.sender;
        require(token.transferFrom(_ownerOf(loanId), msg.sender, cost), "Error paying cosigner");
        return true;
    }
    
    /**
        @notice Destroys a loan, the borrower could call this method if they performed an accidental or regretted 
        "approve" of the loan, this method only works for them if the loan is in "pending" status.

        The lender can call this method at any moment, in case of a loan with status "lent" the lender is pardoning 
        the debt. 

        @param loanId Index of the loan

        @return true if the destroy was done successfully
    */
    function destroy(uint loanId) external returns (bool) {
        Loan storage loan = loans[loanId];
        require(loan.status != Status.destroyed, "Loan already destroyed");

        if (loan.status == Status.request) {
            require(msg.sender == loan.borrower || msg.sender == loan.creator, "Only creator and borrower can destroy a request");
        } else {
            require(_isAuthorized(msg.sender, loanId), "Only lender or authorized can destroy an ongoing loan");
        }

        emit DestroyedBy(loanId, msg.sender);
        loan.status = Status.destroyed;
        return true;
    }

    function pay(uint256 loanId, uint128 amount, address from, bytes oracleData) external returns (bool) {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.ongoing, "The loan is not ongoing");
        moveCheckpoint(loan, uint64(now));
        if (loan.status == Status.ongoing) {
            
            SafeMathWrapper.Result memory result = SafeMathWrapper.Result(false);
  
            uint128 available = amount;
            uint128 unpaidInterest;
            uint128 pending;
            uint128 target;
            do {
                // Pay the full installment or the max ammount possible
                pending = uint128(_currentDebt(loan));
                target = pending < available ? pending : available;
                
                // Calc paid base
                unpaidInterest = uint128(loan.interest.safeSub(loan.paid.safeSub(loan.paidBase, result), result));
                loan.paidBase = uint128(loan.paidBase.safeAdd(target > unpaidInterest ? target.safeSub(unpaidInterest, result) : 0, result));
                
                loan.paid = uint128(loan.paid.safeAdd(target, result));
                loan.lenderBalance = uint128(loan.lenderBalance.safeAdd(target, result));
                available = uint128(available.safeSub(target, result));

                emit PartialPayment(loanId, msg.sender, from, target, unpaidInterest);

                // If the loan is fully paid stop paying
                if (checkFullyPaid(loan)) {
                    break;
                }

                // If current installment was fully paid move to the next one
                if (pending == target) {
                    advanceClock(loan, loan.installmentDuration);
                }
            } while (available != 0);

            uint128 missing = uint128(amount.safeSub(available, result));
            uint256 requiredTransfer = convertRate(loan.oracle, loan.currency, oracleData, missing);
            require(token.transferFrom(msg.sender, this, requiredTransfer), "Error pulling tokens");
        }

        if (result.err) {
          loan.status = Status.error;
        }
        return true;
    }

    /**
        @notice Converts an amount to RCN using the loan oracle.
        
        @dev If the loan has no oracle the currency must be RCN so the rate is 1

        @return The result of the convertion
    */
    function convertRate(address oracle, bytes32 currency, bytes data, uint256 amount) public returns (uint256) {
        
        if (oracle == address(0)) {
            return amount;
        }

        uint256 rate;
        uint256 decimals;
        uint256 newRate;

        (rate, decimals) = Oracle(oracle).getRate(currency, data);
        newRate = (rate.mult(amount).mult((10**(TOKEN_DECIMALS.sub(decimals))))).div(PRECISION);
        
        emit ConvertRate(oracle, amount, newRate);            
        return newRate;
    }
    
    /**
        @notice Calculates the interest of a given amount, interest rate and delta time.

        @param timeDelta Elapsed time
        @param interestRate Interest rate expressed as the denominator of 10 000 000.
        @param amount Amount to apply interest

        @return realDelta The real timeDelta applied
        @return interest The interest gained in the realDelta time
    */
    function calculateInterest(uint256 timeDelta, uint256 interestRate, uint256 amount) internal pure returns (uint256 interest) {
        interest = (amount.mult(100000).mult(timeDelta)).div(interestRate);
    }

    /**
        @notice Withdraw lender funds

        When a loan is paid, the funds are not transferred automatically to the lender, the funds are stored on the
        engine contract, and the lender must call this function specifying the amount desired to transfer and the 
        destination.

        @dev This behavior is defined to allow the temporary transfer of the loan to a smart contract, without worrying that
        the contract will receive tokens that are not traceable; and it allows the development of decentralized 
        autonomous organizations.

        @param loanId Index of the loan
        @param to Destination of the wiwthdraw funds
        @param amount Amount to withdraw, in RCN

        @return true if the withdraw was executed successfully
    */
    function withdrawal(uint loanId, address to, uint128 amount) public returns (bool) {
        Loan storage loan = loans[loanId];
        require(_isAuthorized(msg.sender, loanId), "Sender not authorized");
        require(loan.lenderBalance >= amount, "Lender balance is not enought");
        loan.lenderBalance = uint128(loan.lenderBalance.sub(amount));
        require(token.transfer(to, amount), "Token transfer failed");
        return true;
    }

    /**
        @notice Withdraw lender funds in batch, it walks by all the loans passed to the function and withdraws all
        the funds stored on that loans.

        @dev This batch withdraw method can be expensive in gas, it must be used with care.

        @param loanIds Array of the loans to withdraw
        @param to Destination of the tokens

        @return the total withdrawed 
    */
    function withdrawalList(uint256[] memory loanIds, address to) public returns (uint256) {
        uint256 inputId;
        uint256 loanId;
        uint256 totalWithdraw = 0;

        for (inputId = 0; inputId < loanIds.length; inputId++) {
            loanId = loanIds[inputId];
            if (_isAuthorized(msg.sender, loanId)) {
                Loan storage loan = loans[loanId];
                totalWithdraw = totalWithdraw.add(loan.lenderBalance);
                loan.lenderBalance = 0;
            }
        }

        require(token.transfer(to, totalWithdraw), "Token transfer failed");

        return totalWithdraw;
    }

    function setDeprecated(address _new) external onlyOwner returns (bool) {
        deprecated = _new;
        return true;
    }
}