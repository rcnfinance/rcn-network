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
    function withdrawal(uint index, address _to) returns (uint256);
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
    mapping(uint256 => bool) public lockedLoans;

    function BasicCosigner(Token _token, NanoLoanEngine _engine) {
        owner = msg.sender;
        token = _token;
        engine = _engine;
    }

    function createLiability(uint256 index, uint256 coverage, uint256 requiredArrears) public returns (bool) {
        require(msg.sender == owner);
        require(engine.getCosigner(index) == address(this));
        require(coverage != 0 && coverage <= 100);
        require(liabilities[index].coverage == 0);
        require(engine.approve(index));
        liabilities[index] = Liability(coverage, requiredArrears, false);
        lockedLoans[index] = true;
        return true;
    }

    function destroyLiability(uint256 index) public returns (bool) {
        require(msg.sender == owner);
        require(engine.destroy(index));
        delete liabilities[index];
        lockedLoans[index] = false;
        return true;
    }

    function withdrawal(Token _token, address to, uint256 amount) public returns (bool) {
        require(msg.sender == owner);
        require(to != address(0));
        require(_token.transfer(to, amount));
        return true;
    }

    function transferOwnership(address to) public returns (bool) {
        require(msg.sender == owner);
        require(to != address(0));
        owner = to;
        return true;
    }

    function withdrawalFromLoan(uint256 index, address to) public returns (uint256) {
        require(msg.sender == owner);
        return engine.withdrawal(index, to);
    }

    function transferLoan(uint256 index, address to) public returns (bool) {
        require(!lockedLoans[index]);
        require(msg.sender == owner);
        return engine.transfer(index, to);
    }

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
        lockedLoans[index] = false;
        return true;
    }

    function isDefaulted(uint256 index) constant returns (bool) {
        Liability storage liability = liabilities[index];
        return engine.getStatus(index) == NanoLoanEngine.Status.lent &&
            safeAdd(engine.getDueTime(index), liability.requiredArrears) <= block.timestamp;
    }

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

    function readCurrency(uint index) internal returns (string) {
        bytes memory result = new bytes(engine.getCurrencyLength(index));
        for (uint i = 0; i < result.length; i++) {
            result[i] = engine.getCurrencyByte(index, i);
        }
        return string(result);
    }
}
