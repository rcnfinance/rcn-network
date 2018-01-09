pragma solidity ^0.4.15;

import './interfaces/Oracle.sol';
import './rcn/RpSafeMath.sol';
import "./interfaces/Token.sol";

contract NanoLoanEngine is RpSafeMath {
    uint256 public constant VERSION = 15;
    
    Token public token;

    enum Status { initial, lent, paid, destroyed }

    address public owner;
    bool public deprecated;
    uint256 public totalLenderBalance;

    event CreatedLoan(uint _index, address _borrower, address _creator);
    event ApprovedBy(uint _index, address _address);
    event Lent(uint _index, address _lender);
    event CreatedDebt(uint _index, address _lend);
    event DestroyedBy(uint _index, address _address);
    event PartialPayment(uint _index, address _sender, address _from, uint256 _amount);
    event Transfer(uint _index, address _from, address _to);
    event TotalPayment(uint _index);

    function NanoLoanEngine(Token _token) {
        owner = msg.sender;
        token = _token;
    }

    struct Loan {
        Oracle oracle;

        Status status;

        address borrower;
        address cosigner;
        address lender;
        address creator;
        
        uint256 amount;
        uint256 interest;
        uint256 punitoryInterest;
        uint256 interestTimestamp;
        uint256 paid;
        uint256 cosignerFee;
        uint256 interestRate;
        uint256 interestRatePunitory;
        uint256 dueTime;
        uint256 duesIn;

        string currency;
        uint256 cancelableAt;
        uint256 lenderBalance;

        address approvedTransfer;
        uint256 expirationRequest;

        mapping(address => bool) approbations;
    }

    Loan[] private loans;

    /**
        @dev Creates a loan request, the loan can be generated with any borrower, cosigner, and conditions; if the 
        cosigner and borrower agree they must call the "approve" function.

        The creator of the loan is the caller of this function; this is useful to track which wallet created the loan.

        @param _oracleContract Address of the Oracle contract, if the loan does not use any oracle, this field should be 0x0.
        @param _borrower Address of the borrower
        @param _cosigner Address of the cosigner, 0x0 if the contract does not have a cosigner.
        @param _cosignerFee Defined on the same currency and unit that "amount"; this value is absolute and paid by the
        lender when the loan starts. If there is no cosigner, the fee must be 0.
        @param _currency The currency to use in the Oracle, if there is no Oracle, this field must remain empty.
        @param _amount The requested amount; currency and unit are defined by the Oracle, if there is no Oracle present
        the currency is RCN, and the unit is wei.
        @param _interestRate The non-punitory interest rate by second, defined as a denominator of 10 000 000.
        @param _interestRatePunitory The punitory interest rate by second, defined as a denominator of 10 000 000.
        Ej: interestRate 11108571428571 = 28% Anual interest
        @param _duesIn The time in seconds that the borrower has in order to pay the debt after the lender lends the money.
        @param _cancelableAt Delta in seconds specifying how much interest should be added in advance, if the borrower pays 
        entirely or partially the loan before this term, no extra interest will be deducted.
        @param _expirationRequest Timestamp of when the loan request expires, if the loan is not filled before this date, 
        the request is no longer valid.
    */
    function createLoan(Oracle _oracleContract, address _borrower, address _cosigner,
        uint256 _cosignerFee, string _currency, uint256 _amount, uint256 _interestRate,
        uint256 _interestRatePunitory, uint256 _duesIn, uint256 _cancelableAt, uint256 _expirationRequest) returns (uint256) {

        require(!deprecated);
        require(_cancelableAt <= _duesIn);
        require(_oracleContract != address(0) || bytes(_currency).length == 0);
        require(_cosigner != address(0) || _cosignerFee == 0);
        require(_borrower != address(0));
        require(_amount != 0);
        require(_interestRatePunitory != 0);
        require(_interestRate != 0);
        require(_expirationRequest > block.timestamp);

        var loan = Loan(_oracleContract, Status.initial, _borrower, _cosigner, 0x0, msg.sender, _amount,
            0, 0, 0, 0, _cosignerFee, _interestRate, _interestRatePunitory, 0, _duesIn, _currency, _cancelableAt, 0, 0x0, _expirationRequest);
        uint index = loans.push(loan) - 1;
        CreatedLoan(index, _borrower, msg.sender);
        return index;
    }
    
    function getLoanConfig(uint index) constant returns (address oracle, address borrower, address lender, address creator, uint amount, 
        uint cosignerFee, uint interestRate, uint interestRatePunitory, uint duesIn, uint cancelableAt, uint decimals, bytes32 currencyHash, uint256 expirationRequest) {
        Loan storage loan = loans[index];
        oracle = loan.oracle;
        borrower = loan.borrower;
        lender = loan.lender;
        creator = loan.creator;
        amount = loan.amount;
        cosignerFee = loan.cosignerFee;
        interestRate = loan.interestRate;
        interestRatePunitory = loan.interestRatePunitory;
        duesIn = loan.duesIn;
        cancelableAt = loan.cancelableAt;
        decimals = loan.oracle.getDecimals(loan.currency);
        currencyHash = keccak256(loan.currency); 
        expirationRequest = loan.expirationRequest;
    }

    function getLoanState(uint index) constant returns (uint interest, uint punitoryInterest, uint interestTimestamp,
        uint paid, uint dueTime, Status status, uint lenderBalance, address approvedTransfer, bool approved) {
        Loan storage loan = loans[index];
        interest = loan.interest;
        punitoryInterest = loan.punitoryInterest;
        interestTimestamp = loan.interestTimestamp;
        paid = loan.paid;
        dueTime = loan.dueTime;
        status = loan.status;
        lenderBalance = loan.lenderBalance;
        approvedTransfer = loan.approvedTransfer;
        approved = isApproved(index);
    }
    
    function getTotalLoans() constant returns (uint256) { return loans.length; }
    function getOracle(uint index) constant returns (Oracle) { return loans[index].oracle; }
    function getBorrower(uint index) constant returns (address) { return loans[index].borrower; }
    function getCosigner(uint index) constant returns (address) { return loans[index].cosigner; }
    function getLender(uint index) constant returns (address) { return loans[index].lender; }
    function getCreator(uint index) constant returns (address) { return loans[index].creator; }
    function getAmount(uint index) constant returns (uint256) { return loans[index].amount; }
    function getInterest(uint index) constant returns (uint256) { return loans[index].interest; }
    function getPunitoryInterest(uint index) constant returns (uint256) { return loans[index].punitoryInterest; }
    function getInterestTimestamp(uint index) constant returns (uint256) { return loans[index].interestTimestamp; }
    function getPaid(uint index) constant returns (uint256) { return loans[index].paid; }
    function getCosignerFee(uint index) constant returns (uint256) { return loans[index].cosignerFee; }
    function getInterestRate(uint index) constant returns (uint256) { return loans[index].interestRate; }
    function getInterestRatePunitory(uint index) constant returns (uint256) { return loans[index].interestRatePunitory; }
    function getDueTime(uint index) constant returns (uint256) { return loans[index].dueTime; }
    function getDuesIn(uint index) constant returns (uint256) { return loans[index].duesIn; }
    function getCurrency(uint index) constant returns (string) { return loans[index].currency; }
    function getCancelableAt(uint index) constant returns (uint256) { return loans[index].cancelableAt; }
    function getApprobation(uint index, address _address) constant returns (bool) { return loans[index].approbations[_address]; }
    function getStatus(uint index) constant returns (Status) { return loans[index].status; }
    function getLenderBalance(uint index) constant returns (uint256) { return loans[index].lenderBalance; }
    function getCurrencyLength(uint index) constant returns (uint256) { return bytes(loans[index].currency).length; }
    function getCurrencyByte(uint index, uint cindex) constant returns (bytes1) { return bytes(loans[index].currency)[cindex]; }
    function getApprovedTransfer(uint index) constant returns (address) {return loans[index].approvedTransfer; }
    function getCurrencyHash(uint index) constant returns (bytes32) { return keccak256(loans[index].currency); }
    function getCurrencyDecimals(uint index) constant returns (uint256) { return loans[index].oracle.getDecimals(loans[index].currency); }
    function getExpirationRequest(uint index) constant returns (uint256) { return loans[index].expirationRequest; }

    /**
        @param index Index of the loan

        @return true if the loan has been approved by the borrower and cosigner.
    */
    function isApproved(uint index) constant returns (bool) {
        Loan storage loan = loans[index];
        return loan.approbations[loan.borrower] && (loan.approbations[loan.cosigner] || loan.cosigner == address(0));
    }

    /**
        @dev Called by the members of the loan to show that they agree with the terms of the loan; the borrower and the 
        cosigner must call this method before any lender could call the method "lend".

        Any address can call this method to be added to the "approbations" mapping.

        @param index Index of the loan

        @return true if the approve was done successfully
    */
    function approve(uint index) public returns(bool) {
        Loan storage loan = loans[index];
        require(loan.status == Status.initial);
        loan.approbations[msg.sender] = true;
        ApprovedBy(index, msg.sender);
        return true;
    }

    /**
        @dev Performs the lend of the RCN equivalent to the requested amount, and transforms the msg.sender in the new lender.

        The loan must be previously approved by the borrower and the cosigner.

        Before calling this function, the lender candidate must call the "approve" function on the RCN Token, specifying
        an amount sufficient enough to pay the equivalent of the requested amount, the oracle fee and the cosigner 
        fee.
        
        @param index Index of the loan

        @return true if the lend was done successfully
    */
    function lend(uint index) public returns (bool) {
        Loan storage loan = loans[index];
        require(loan.status == Status.initial);
        require(isApproved(index));
        require(block.timestamp <= loan.expirationRequest);

        loan.lender = msg.sender;
        loan.dueTime = safeAdd(block.timestamp, loan.duesIn);
        loan.interestTimestamp = block.timestamp;
        loan.status = Status.lent;

        if (loan.cancelableAt > 0)
            internalAddInterest(index, safeAdd(block.timestamp, loan.cancelableAt));

        uint256 rate = getOracleRate(index);
        require(token.transferFrom(msg.sender, loan.borrower, safeMult(loan.amount, rate)));

        if (loan.cosigner != address(0))
            require(token.transferFrom(msg.sender, loan.cosigner, safeMult(loan.cosignerFee, rate)));
        
        Lent(index, loan.lender);
        return true;
    }

    /**
        @dev Destroys a loan, the borrower or the cosigner can call this method if they performed an accidental or regretted 
        "approve" of the loan, this method only works for them if the loan is in "pending" status.

        The lender can call this method at any moment, in case of a loan with status "lent" the lender is pardoning 
        the debt. 

        @param index Index of the loan

        @return true if the destroy was done successfully
    */
    function destroy(uint index) public returns (bool) {
        Loan storage loan = loans[index];
        require(loan.status != Status.destroyed);
        require(msg.sender == loan.lender || ((msg.sender == loan.borrower || msg.sender == loan.cosigner) && loan.status == Status.initial));
        DestroyedBy(index, msg.sender);
        loan.status = Status.destroyed;
        return true;
    }

    /**
        @dev Transfers a loan to a different lender, the caller must be the current lender or previously being approved with
        the method "approveTransfer"

        @param index Index of the loan
        @param to New lender

        @return true if the transfer was done successfully
    */
    function transfer(uint index, address to) public returns (bool) {
        Loan storage loan = loans[index];
        require(loan.status != Status.destroyed);
        require(msg.sender == loan.lender || msg.sender == loan.approvedTransfer);
        require(to != address(0));
        Transfer(index, loan.lender, to);
        loan.lender = to;
        loan.approvedTransfer = address(0);
        return true;
    }

    /**
        @dev Approves the transfer a given loan in the name of the lender, the behavior of this function is similar to
        "approve" in the ERC20 standard, but only one approved address is allowed at a time.

        The same method can be called passing 0x0 as parameter "to" to erase a previously approved address.

        @param index Index of the loan
        @param to Address allowed to transfer the loan or 0x0 to delete

        @return true if the approve was done successfully
    */
    function approveTransfer(uint index, address to) public returns (bool) {
        Loan storage loan = loans[index];
        require(msg.sender == loan.lender);
        loan.approvedTransfer = to;
        return true;
    }

    /**
        @dev Returns the pending amount to complete de payment of the loan, it doesn’t consider the total amount of accrued 
        interest, to get the real pending you must call "addInterest" before.

        @param index Index of the loan

        @return Aprox pending payment amount
    */
    function getPendingAmount(uint index) public constant returns (uint256) {
        Loan storage loan = loans[index];
        return safeSubtract(safeAdd(safeAdd(loan.amount, loan.interest), loan.punitoryInterest), loan.paid);
    }

    /**
        @dev Calculates the interest of a given amount, interest rate and delta time.

        @param timeDelta Elapsed time
        @param interestRate Interest rate expressed as the denominator of 10 000 000.
        @param amount Amount to apply interest
        @return realDelta The real timeDelta applied
        @return interest The interest gained in the realDelta time
    */
    function calculateInterest(uint256 timeDelta, uint256 interestRate, uint256 amount) public constant returns (uint256 realDelta, uint256 interest) {
        interest = safeMult(safeMult(100000, amount), timeDelta) / interestRate;
        realDelta = safeMult(interest, interestRate) / (amount * 100000);
    }

    /**
        @dev Computes loan interest

        Computes the punitory and non-punitory interest of a given loan and only applies the change.
        
        @param index Index of the loan
        @param timestamp Target absolute unix time to calculate interest.
    */
    function internalAddInterest(uint index, uint256 timestamp) internal {
        Loan storage loan = loans[index];
        if (timestamp > loan.interestTimestamp) {
            uint256 newInterest = loan.interest;
            uint256 newPunitoryInterest = loan.punitoryInterest;

            uint256 newTimestamp;
            uint256 realDelta;
            uint256 calculatedInterest;

            uint256 deltaTime;
            uint256 pending;

            uint256 endNonPunitory = min(timestamp, loan.dueTime);
            if (endNonPunitory > loan.interestTimestamp) {
                deltaTime = safeSubtract(endNonPunitory, loan.interestTimestamp);
                pending = safeSubtract(loan.amount, loan.paid);
                (realDelta, calculatedInterest) = calculateInterest(deltaTime, loan.interestRate, pending);
                newInterest = safeAdd(calculatedInterest, newInterest);
                newTimestamp = loan.interestTimestamp + realDelta;
            }

            if (timestamp > loan.dueTime) {
                uint256 startPunitory = max(loan.dueTime, loan.interestTimestamp);
                deltaTime = safeSubtract(timestamp, startPunitory);
                pending = safeSubtract(safeAdd(loan.amount, newInterest), loan.paid);
                (realDelta, calculatedInterest) = calculateInterest(deltaTime, loan.interestRatePunitory, pending);
                newPunitoryInterest = safeAdd(newPunitoryInterest, calculatedInterest);
                newTimestamp = startPunitory + realDelta;
            }
            
            if (newInterest != loan.interest || newPunitoryInterest != loan.punitoryInterest) {
                loan.interestTimestamp = newTimestamp;
                loan.interest = newInterest;
                loan.punitoryInterest = newPunitoryInterest;
            }
        }
    }

    /**
        @dev Computes loan interest only up to current unix time

        @param index Index of the loan
        @param timestamp Target absolute unix time to calculate interest.
    */
    function addInterestUpTo(uint index, uint256 timestamp) internal {
        Loan storage loan = loans[index];
        require(loan.status == Status.lent);
        if (timestamp <= block.timestamp) {
            internalAddInterest(index, timestamp);
        }
    }

    /**
        @dev Updates the loan accumulated interests up to the current Unix time.
        
        @param index Index of the loan
    */
    function addInterest(uint index) public {
        addInterestUpTo(index, block.timestamp);
    }
    
    /**
        @dev Pay loan

        Realizes a payment of a given Loan, before performing the payment the accumulated
        interest is computed and added to the total pending amount.

        Before calling this function, the msg.sender must call the "approve" function on the RCN Token, specifying an amount
        sufficient enough to pay the equivalent of the desired payment and the oracle fee.

        Because it is difficult or even impossible to know in advance how much RCN are going to be spent on the
        transaction*, we recommend performing the "approve" using an amount 5% superior to the wallet estimated
        spending. If the RCN spent results to be less, the extra tokens are never debited from the msg.sender.

        * The RCN rate can fluctuate on the same block, and it is impossible to know in advance the exact time of the
        confirmation of the transaction. 

        If the paid pending amount equals zero, the loan changes status to "paid" and it is considered closed.

        @param index Index of the loan
        @param _amount Amount to pay, specified in the loan currency; or in RCN if the loan has no oracle
        @param _from The identity of the payer

        @return true if the payment was executed successfully
    */
    function pay(uint index, uint256 _amount, address _from) public returns (bool) {
        Loan storage loan = loans[index];
        require(loan.status == Status.lent);
        addInterest(index);
        uint256 toPay = min(getPendingAmount(index), _amount);

        loan.paid = safeAdd(loan.paid, toPay);
        if (getPendingAmount(index) == 0) {
            TotalPayment(index);
            loan.status = Status.paid;
        }

        uint256 transferValue = safeMult(toPay, getOracleRate(index));
        require(token.transferFrom(msg.sender, this, transferValue));
        loan.lenderBalance = safeAdd(transferValue, loan.lenderBalance);
        totalLenderBalance = safeAdd(transferValue, totalLenderBalance);
        PartialPayment(index, msg.sender, _from, toPay);

        return true;
    }

    /**
        @dev Withdraw lender funds

        When a loan is paid, the funds are not transferred automatically to the lender, the funds are stored on the
        engine contract, and the lender must call this function specifying the amount desired to transfer and the 
        destination.

        This behavior is defined to allow the temporary transfer of the loan to a smart contract, without worrying that
        the contract will receive tokens that are not traceable; and it allows the development of decentralized 
        autonomous organizations.

        @param index Index of the loan
        @param to Destination of the wiwthdraw funds
        @param amount Amount to withdraw, in RCN

        @return true if the withdraw was executed successfully
    */
    function withdrawal(uint index, address to, uint256 amount) public returns (bool) {
        Loan storage loan = loans[index];
        require(to != address(0));
        if (msg.sender == loan.lender && loan.lenderBalance >= amount) {
            loan.lenderBalance = safeSubtract(loan.lenderBalance, amount);
            totalLenderBalance = safeSubtract(totalLenderBalance, amount);
            require(token.transfer(to, amount));
            return true;
        }
    }

    /**
        @dev Changes the owner of the engine 
    */
    function changeOwner(address to) public {
        require(msg.sender == owner);
        require(to != address(0));
        owner = to;
    }

    /**
        @dev Deprecates the engine, locks the creation of new loans.
    */
    function setDeprecated(bool _deprecated) public {
        require(msg.sender == owner);
        deprecated = _deprecated;
    }

    /**
        @dev Retrieves the rate of the loan's currency in RCN, provided by the oracle; 
        if the loan has no oracle, returns 1.

        @param index Index of the loan
        @return Equivalent of the currency in RCN
    */
    function getOracleRate(uint index) internal returns (uint256) {
        Loan storage loan = loans[index];
        if (loan.oracle == address(0)) 
            return 1;

        uint256 costOracle = loan.oracle.getCost(loan.currency);
        require(token.transferFrom(msg.sender, this, costOracle));
        require(token.approve(loan.oracle, costOracle));
        uint256 rate = loan.oracle.getRateFor(loan.currency);
        require(rate != 0);
        return rate;
    }

    /**
        @dev Withdraws tokens not belonging to any lender. 
    */
    function emergencyWithdrawal(Token _token, address to, uint256 amount) returns (bool) {
        require(msg.sender == owner);
        require(_token != token || safeSubtract(token.balanceOf(this), totalLenderBalance) >= amount);
        require(to != address(0));
        return _token.transfer(to, amount);
    }
}
