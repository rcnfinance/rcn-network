pragma solidity ^0.4.15;

import './../utils/RpSafeMath.sol';
import './../interfaces/Oracle.sol';

contract NanoLoanEngine {
    enum Status { initial, lent, paid, destroyed }
    function transfer(uint index, address _to) returns (bool);
    function getLender(uint index) constant returns (address);
    function getOracle(uint index) constant returns (address);
    function getDueTime(uint index) constant returns (uint256);
    function getStatus(uint index) constant returns (Status);
    function withdrawal(uint index, address to, uint256 amount) public returns (bool);
    function getCosigner(uint index) constant returns (address);
    function getInterest(uint index) constant returns (uint256);
    function approve(uint index) constant returns (bool);
    function getCurrencyLength(uint index) constant returns (uint256);
    function getCurrencyByte(uint index, uint cindex) constant returns (bytes1);
    function addInterest(uint index) public;
    function getAmount(uint index) constant returns (uint256);
    function getPaid(uint index) constant returns (uint256);
    function destroy(uint index) public returns (bool);
}


contract Token {
	function totalSupply() public constant returns (uint);
	function balanceOf(address tokenOwner) public constant returns (uint balance);
	function allowance(address tokenOwner, address spender) public constant returns (uint remaining);
	function transfer(address to, uint tokens) public returns (bool success);
	function approve(address spender, uint tokens) public returns (bool success);
	function transferFrom(address from, address to, uint tokens) public returns (bool success);

	event Transfer(address indexed from, address indexed to, uint tokens);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
}

contract BasicCosigner is RpSafeMath {
    NanoLoanEngine public engine;
    Token public token;

    address public owner;

    struct Liability {
        uint256 coverage;
        uint256 requiredArrears;
        bool claimed;
    }

    mapping(uint256 => Liability) public liabilities;

    function BasicCosigner(Token _token, NanoLoanEngine _engine) {
        owner = msg.sender;
        token = _token;
        engine = _engine;
    }

    /**
        @dev Creates a liability to pay a loan if the borrower defaults.

        @param index Index of the loan
        @param coverage Portion of the pending payment covered, between 0 and 100.
        @param requiredArrears Time passed after the loan dueTime required to be considered a default.

        @return true if the liability was created
    */
    function createLiability(uint256 index, uint256 coverage, uint256 requiredArrears) public returns (bool) {
        require(msg.sender == owner);
        require(engine.getCosigner(index) == address(this));
        require(coverage != 0 && coverage <= 100);
        require(liabilities[index].coverage == 0);
        require(engine.approve(index));
        liabilities[index] = Liability(coverage, requiredArrears, false);
        return true;
    }

    /**
        @dev Destroys a previously created liability, also destroys the associated loan on the engine

        @param index Index of the loan

        @return true if the liability was destroyed
    */
    function destroyLiability(uint256 index) public returns (bool) {
        require(msg.sender == owner);
        require(engine.destroy(index));
        delete liabilities[index];
        return true;
    }

    /**
        @dev Withdraws tokens from the smart contract.

        @param _token Token contract address
        @param _to Destination address
        @param _amount Amount to send

        @return true if the withdrawal was done successfully
    */
    function withdrawal(Token _token, address to, uint256 amount) public returns (bool) {
        require(msg.sender == owner);
        require(to != address(0));
        require(_token.transfer(to, amount));
        return true;
    }

    /**
        @dev Transfers the ownership of the smart contract
        
        @param to New owner of the cosigner
    */
    function transferOwnership(address to) public returns (bool) {
        require(msg.sender == owner);
        require(to != address(0));
        owner = to;
        return true;
    }

    /**
        @dev Withdraws funds from a loan

        @param index Index of the loan
        @param to Destination of the withdrawed tokens
        @param amount Amount to withdraw

        @return true if the withdraw was done successfully
    */
    function withdrawalFromLoan(uint256 index, address to, uint256 amount) public returns (bool) {
        require(msg.sender == owner);
        return engine.withdrawal(index, to, amount);
    }

    /**
        @dev Transfers a loan to a new owner

        @index Index of the loan

        @param index Index of the loan
        @param to New owner of the loan

        @returns true if the loan was transfered
    */
    function transferLoan(uint256 index, address to) public returns (bool) {
        require(liabilities[index].claimed || liabilities[index].coverage == 0);
        require(msg.sender == owner);
        return engine.transfer(index, to);
    }

    /**
        @dev Claims the coverage of a defaulted loan

        The lender owning the defaulted loan must call this method to claim his compensation; before it must
        call "approveTransfer" on the engine, passing the index of the defaulted loan and the address of the cosigner.

        When this method is called, the loan is transferred from the lender to this contract, and the tokens
        corresponding to the compensation are transferred from this contract to the lender, this contract has to have
        enough tokens to pay to the lender.

        @index Index of the loan

        @returns true if the compensation was claimed
    */
    function claim(uint256 index) public returns (bool) {
        Liability storage liability = liabilities[index];
        require(engine.getCosigner(index) == address(this));
        require(isDefaulted(index));
        require(!liability.claimed);
        require(liability.coverage > 0);
        require(engine.getLender(index) == msg.sender);
        liability.claimed = true;
        engine.addInterest(index);
        uint debt = safeSubtract(safeAdd(engine.getAmount(index), engine.getInterest(index)), engine.getPaid(index));
        uint amount = safeMult(debt, liability.coverage) / 100;
        require(engine.transfer(index, this));
        require(token.transfer(msg.sender, safeMult(getOracleRate(index), amount)));
        return true;
    }

    /**
        @dev Defines a custom logic that determines if a loan is defaulted or not.

        @index Index of the loan

        @returns true if the loan is considered defaulted
    */
    function isDefaulted(uint256 index) constant returns (bool) {
        Liability storage liability = liabilities[index];
        return engine.getStatus(index) == NanoLoanEngine.Status.lent &&
            safeAdd(engine.getDueTime(index), liability.requiredArrears) <= block.timestamp;
    }

    /**
        @dev Retrieves the rate of the loan's currency in RCN, provided by the oracle;
        if the loan has no oracle, returns 1.

        @param index Index of the loan
        @return Equivalent of the currency in RCN
    */
    function getOracleRate(uint index) internal returns (uint256) {
        var oracle = Oracle(engine.getOracle(index));
        if (oracle == address(0))
            return 1;

        string memory currency = readCurrency(index);
        uint256 costOracle = oracle.getCost(currency);
        require(token.approve(oracle, costOracle));
        uint256 rate = oracle.getRateFor(currency);
        require(rate != 0);
        return rate;
    }

    /**
        @dev Retrieves the currency parameter of a loan

        @param index Index of the loan
        @return currency parameter of a loan, in string format.
    */
    function readCurrency(uint index) internal returns (string) {
        bytes memory result = new bytes(engine.getCurrencyLength(index));
        for (uint i = 0; i < result.length; i++) {
            result[i] = engine.getCurrencyByte(index, i);
        }
        return string(result);
    }
}
