pragma solidity ^0.5.0;

import "./../../../interfaces/Token.sol";
import "./interfaces/IPouch.sol";

import "./../../../utils/ERC721Base.sol";


contract Pouch is ERC721Base, IPouch {
    using SafeMath for uint256;

    struct Pair {
        Token token;
        uint256 balance;
    }

    Pair[] public pouches;

    constructor() public ERC721Base("ERC20 ETH Pouch", "EEP") { }

    function canDeposit(uint256 _packageId) external view returns (bool) {
        return _isAuthorized(msg.sender, _packageId);
    }

    function pouchesLength() external view returns (uint256) {
        return pouches.length;
    }

    function getPair(uint256 _id) external view returns(Token, uint256) {
        Pair storage pair = pouches[_id];
        return (pair.token, pair.balance);
    }

    /**
        @notice Create a pair and push into the pouches array

        @param _token Token address (ERC20)
        @param _amount Token amount

        @return _id Index of pair in the pouches array
    */
    function create(
        Token _token,
        uint256 _amount
    ) external payable returns (uint256 _id) {
        _deposit(_token, _amount);

        _id = pouches.push(Pair(_token, _amount)) - 1;

        _generate(_id, msg.sender);

        emit Created(_id, msg.sender, _token, _amount);
    }

    /**
        @notice Deposit an amount of token in a pair

        @dev If the currency its ether and the destiny its a contract, execute the payable deposit()

        @param _id Index of pair in pouches array
        @param _amount Token amount

        @return true If the operation was executed
    */
    function deposit(
        uint256 _id,
        uint256 _amount
    ) external payable onlyAuthorized(_id) returns (bool) {
        Pair storage pair = pouches[_id];
        _deposit(pair.token, _amount);

        pair.balance += _amount;

        emit Deposit(_id, msg.sender, _amount);

        return true;
    }

    /**
        @notice Withdraw all funds of a pair

        @param _id Index of pair in pouches array
        @param _to The beneficiary of returned funds

        @return true If the operation was executed
    */
    function withdraw(
        uint256 _id,
        address payable _to
    ) external onlyAuthorized(_id) returns (bool) {
        require(_to != address(0), "_to should not be 0x0");
        Pair storage pair = pouches[_id];

        uint256 balance = pair.balance;

        if (pair.token != Token(ETH))
            require(pair.token.transfer(_to, balance), "Error transfer tokens");
        else
            _to.transfer(balance);

        delete (pair.balance);

        emit Withdraw(_id, msg.sender, _to, balance);

        return true;
    }

    /**
        @notice Withdraw a partial amount of funds of a pair

        @param _id Index of pair in pouches array
        @param _to The beneficiary of returned funds
        @param _amount The amount of returned funds

        @return true If the operation was executed
    */
    function withdrawPartial(
        uint256 _id,
        address payable _to,
        uint256 _amount
    ) external onlyAuthorized(_id) returns (bool) {
        require(_to != address(0), "_to should not be 0x0");
        Pair storage pair = pouches[_id];

        require(pair.balance >= _amount, "The balance of pouch its to low");
        pair.balance -= _amount;

        if (pair.token != Token(ETH))
            require(pair.token.transfer(_to, _amount), "Error transfer tokens");
        else
            _to.transfer(_amount);


        emit Withdraw(_id, msg.sender, _to, _amount);

        return true;
    }

    function _deposit(
        Token _token,
        uint256 _amount
    ) internal {
        require(_token != Token(0), "The Token should not be the address 0x0");

        if (_amount != 0)
            if (msg.value == 0)
                require(_token.transferFrom(msg.sender, address(this), _amount), "Error pulling tokens");
            else
                require(_amount == msg.value && _token == Token(ETH), "The amount should be equal to msg.value and the _token should be ETH");
        else
            require(msg.value == 0, "The msg.value should be 0");
    }
}
