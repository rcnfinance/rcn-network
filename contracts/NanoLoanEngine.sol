pragma solidity ^0.4.15;

import './interfaces/Oracle.sol';
import './utils/RpSafeMath.sol';

contract Token {
    function transfer(address _to, uint _value) returns (bool success);
    function transferFrom(address _from, address _to, uint256 _value) returns (bool success);
    function allowance(address _owner, address _spender) constant returns (uint256 remaining);
    function approve(address _spender, uint256 _value) returns (bool success);
    function increaseApproval (address _spender, uint _addedValue) public returns (bool success);
}

contract NanoLoanEngine is RpSafeMath {
    uint256 public constant VERSION = 2;
    
    Token public token;

    enum Status { initial, lent, paid, destroyed }

    address public owner;
    bool public deprecated;

    event CreatedLoan(uint _index, address _borrower);
    event ApprovedBy(uint _index, address _address);
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
        uint256 interestTimestamp;
        uint256 paid;
        uint256 cosignerFee;

        uint256 interestRate;
        uint256 dueTime;
        uint256 duesIn;

        string currency;

        uint256 cancelableAt;
        uint256 interestMaxWindow;

        uint256 lenderBalance;

        address approvedTransfer;
        mapping(address => bool) approbations;
    }

    Loan[] private loans;

    // _oracleContract: Address of the Oracle contract, must implement OracleInterface. 0x0 for no oracle
    // _cosigner: Responsable of the payment of the loan if the lender does not pay. 0x0 for no cosigner
    // _cosignerFee: absolute amount in currency
    // _interestRate: 10 000 / interest; ej 100 000 = 100 %; 10 000 000 = 1% (by second)
    function createLoan(Oracle _oracleContract, address _borrower, address _cosigner,
        uint256 _cosignerFee, string _currency, uint256 _amount, uint256 _interestRate, uint256 _duesIn,
        uint256 _cancelableAt, uint256 _interestMaxWindow) returns (uint256) {

        require(!deprecated);
        require(_cancelableAt <= _duesIn);
        require(_oracleContract != address(0) || bytes(_currency).length == 0);
        require(_cosigner != address(0) || _cosignerFee == 0);
        require(_borrower != address(0));
        require(_amount != 0);
        require(_interestMaxWindow == 0 || _interestMaxWindow >= 86400);

        var loan = Loan(_oracleContract, Status.initial, _borrower, _cosigner, 0x0, msg.sender, _amount,
            0, 0, 0, _cosignerFee, _interestRate, 0, _duesIn, _currency, _cancelableAt, _interestMaxWindow, 0, 0x0);
        uint index = loans.push(loan) - 1;
        CreatedLoan(index, _borrower);
        return index;
    }
    
    function getTotalLoans() constant returns (uint256) { return loans.length; }
    function getOracle(uint index) constant returns (Oracle) { return loans[index].oracle; }
    function getBorrower(uint index) constant returns (address) { return loans[index].borrower; }
    function getCosigner(uint index) constant returns (address) { return loans[index].cosigner; }
    function getLender(uint index) constant returns (address) { return loans[index].lender; }
    function getCreator(uint index) constant returns (address) { return loans[index].creator; }
    function getAmount(uint index) constant returns (uint256) { return loans[index].amount; }
    function getInterest(uint index) constant returns (uint256) { return loans[index].interest; }
    function getInterestTimestamp(uint index) constant returns (uint256) { return loans[index].interestTimestamp; }
    function getPaid(uint index) constant returns (uint256) { return loans[index].paid; }
    function getCosignerFee(uint index) constant returns (uint256) { return loans[index].cosignerFee; }
    function getInterestRate(uint index) constant returns (uint256) { return loans[index].interestRate; }
    function getDueTime(uint index) constant returns (uint256) { return loans[index].dueTime; }
    function getDuesIn(uint index) constant returns (uint256) { return loans[index].duesIn; }
    function getCurrency(uint index) constant returns (string) { return loans[index].currency; }
    function getCancelableAt(uint index) constant returns (uint256) { return loans[index].cancelableAt; }
    function getInterestMaxWindow(uint index) constant returns (uint256) { return loans[index].interestMaxWindow; }
    function getApprobation(uint index, address _address) constant returns (bool) { return loans[index].approbations[_address]; }
    function getStatus(uint index) constant returns (Status) { return loans[index].status; }
    function getLenderBalance(uint index) constant returns (uint256) { return loans[index].lenderBalance; }
    function getCurrencyLength(uint index) constant returns (uint256) { return bytes(loans[index].currency).length; }
    function getCurrencyByte(uint index, uint cindex) constant returns (bytes1) { return bytes(loans[index].currency)[cindex]; }
    function getApprovedTransfer(uint index) constant returns (address) {return loans[index].approvedTransfer; }

    function isApproved(uint index) constant returns (bool) {
        Loan storage loan = loans[index];
        return loan.approbations[loan.borrower] && (loan.approbations[loan.cosigner] || loan.cosigner == address(0));
    }

    function approve(uint index) returns(bool) {
        Loan storage loan = loans[index];
        require(loan.status == Status.initial);
        loan.approbations[msg.sender] = true;
        ApprovedBy(index, msg.sender);
        return true;
    }

    function lend(uint index) returns (bool) {
        Loan storage loan = loans[index];
        require(loan.status == Status.initial);
        require(isApproved(index));

        loan.lender = msg.sender;
        loan.dueTime = safeAdd(block.timestamp, loan.duesIn);
        loan.interestTimestamp = block.timestamp;
        loan.status = Status.lent;

        uint256 rate = getOracleRate(index);
        require(token.transferFrom(msg.sender, loan.borrower, safeMult(loan.amount, rate)));

        if (loan.cosigner != address(0))
            require(token.transferFrom(msg.sender, loan.cosigner, safeMult(loan.cosignerFee, rate)));
        
        if (loan.cancelableAt > 0)
            internalAddInterest(index, safeAdd(block.timestamp, loan.cancelableAt));
        
        ApprovedBy(index, loan.lender);
        return true;
    }

    function destroy(uint index) returns (bool) {
        Loan storage loan = loans[index];
        require(loan.status != Status.destroyed);
        require(msg.sender == loan.lender || ((msg.sender == loan.borrower || msg.sender == loan.cosigner) && loan.status == Status.initial));
        DestroyedBy(index, msg.sender);
        loan.status = Status.destroyed;
        return true;
    }

    function transfer(uint index, address to) returns (bool) {
        Loan storage loan = loans[index];
        require(loan.status != Status.destroyed);
        require(msg.sender == loan.lender || msg.sender == loan.approvedTransfer);
        require(to != address(0));
        loan.lender = to;
        loan.approvedTransfer = address(0);
        Transfer(index, loan.lender, to);
        return true;
    }

    function approveTransfer(uint index, address to) returns (bool) {
        Loan storage loan = loans[index];
        require(msg.sender == loan.lender);
        loan.approvedTransfer = to;
        return true;
    }

    function getPendingAmount(uint index) constant returns (uint256) {
        Loan storage loan = loans[index];
        return safeSubtract(safeAdd(loan.amount, loan.interest), loan.paid);
    }
    
    // Computes `k * (1+1/q) ^ N`, with precision `p`. The higher
    // the precision, the higher the gas cost. It should be
    // something around the log of `n`. When `p == n`, the
    // precision is absolute (sans possible integer overflows).
    // Much smaller values are sufficient to get a great approximation.
    function fracExp(uint256 k, uint256 q, uint256 n, uint256 p, uint256 y) private constant returns (uint256) {
      uint256 s = 0;
      uint256 N = 1;
      uint256 B = 1;
      for (uint256 i = 0; i < p; ++i) {
        s += k * (y ** i) * N / B / (q**i);
        N = N * (n - i);
        B = B * (i + 1);
      }
      return s;
    }

    function calculateInterest(uint index, uint256 timestamp) constant returns(uint256) {
        Loan storage loan = loans[index];
        uint256 deltaTime = safeSubtract(min(timestamp, loan.dueTime), loan.interestTimestamp);
        uint256 pending = safeSubtract(loan.amount, loan.paid);
        return safeSubtract(fracExp(pending, loan.interestRate / deltaTime, 1, 2, 100000), pending);
    }

    function calculatePunitoryInterest(uint index, uint256 timestamp, uint256 currentInterest) constant returns(uint256) {
        Loan storage loan = loans[index];
        uint256 deltaDays = safeSubtract(timestamp, max(loan.dueTime, loan.interestTimestamp)) / 86400;
        uint256 pendingPunitory = safeSubtract(safeAdd(loan.amount, currentInterest), loan.paid);
        uint256 interestByDay = loan.interestRate / 86400;
        return safeSubtract(fracExp(pendingPunitory, interestByDay, deltaDays, 20, 100000), pendingPunitory);
    }

    function internalAddInterest(uint index, uint256 timestamp) internal {
        Loan storage loan = loans[index];
        if (timestamp > loan.interestTimestamp) {
            uint256 newInterest = loan.interest;

            if (min(timestamp, loan.dueTime) > loan.interestTimestamp) {
                newInterest = safeAdd(calculateInterest(index, timestamp), newInterest);
            }

            if (timestamp > loan.dueTime) {
                newInterest = safeAdd(calculatePunitoryInterest(index, timestamp, newInterest), newInterest);
            }
            
            if (newInterest != loan.interest) {
                loan.interestTimestamp = timestamp;
                loan.interest = newInterest;
            }
        }
    }

    function addInterestUpTo(uint index, uint256 timestamp) internal {
        Loan storage loan = loans[index];
        require(loan.status == Status.lent);
        if (timestamp <= block.timestamp) {
            if (loan.interestMaxWindow == 0) {
                internalAddInterest(index, timestamp);
            } else {
                var deltaTimestamp = safeSubtract(timestamp, loan.interestTimestamp);
                var chunks = deltaTimestamp / loan.interestMaxWindow;
                var remainder = deltaTimestamp % loan.interestMaxWindow;
                for (uint256 i = 0; i < chunks; i++) {
                    internalAddInterest(index, safeAdd(loan.interestTimestamp, loan.interestMaxWindow));
                }
                internalAddInterest(index, safeAdd(loan.interestTimestamp, remainder));
            }
        }
    }

    function addInterestBlocks(uint index, uint256 blocks) {
        Loan storage loan = loans[index];
        addInterestUpTo(index, safeAdd(loan.interestTimestamp, safeMult(loan.interestMaxWindow, blocks)));
    }

    function addInterest(uint index) {
        addInterestUpTo(index, block.timestamp);
    }
    
    function pay(uint index, uint256 _amount, address _from) returns (bool) {
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
        PartialPayment(index, msg.sender, _from, toPay);

        return true;
    }

    function withdrawal(uint index, address to) returns (uint256) {
        Loan storage loan = loans[index];
        require(to != address(0));
        if (msg.sender == loan.lender) {
            uint256 balance = loan.lenderBalance;
            require(token.transfer(to, balance));
            loan.lenderBalance = 0;
            return balance;
        }
    }

    function changeOwner(address to) {
        require(msg.sender == owner);
        require(to != address(0));
        owner = to;
    }

    function setDeprecated(bool _deprecated) {
        require(msg.sender == owner);
        deprecated = _deprecated;
    }

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
}
