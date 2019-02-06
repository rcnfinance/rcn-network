pragma solidity ^0.5.0;

import "./../../../interfaces/Token.sol";
import "./interfaces/IPoach.sol";

import "./../../../utils/ERC721Base.sol";


contract Poach is ERC721Base, IPoach {
    using SafeMath for uint256;

    struct Pair {
        Token token;
        uint256 balance;
    }

    Pair[] public poaches;

    constructor() public ERC721Base("ERC20 ETH Poach", "EEP") { }

    function canDeposit(uint256 _packageId) external view returns (bool) {
        return _isAuthorized(msg.sender, _packageId);
    }

    function getPair(uint256 _id) external view returns(Token, uint256) {
        Pair storage pair = poaches[_id];
        return (pair.token, pair.balance);
    }

    /**
        @notice Create a pair and push into the poaches array

        @param _token Token address (ERC20)
        @param _amount Token amount

        @return _id Index of pair in the poaches array
    */
    function create(
        Token _token,
        uint256 _amount
    ) external payable returns (uint256 _id) {
        _deposit(_token, _amount);

        _id = poaches.push(Pair(_token, _amount)) - 1;

        _generate(_id, msg.sender);

        emit Created(_id, msg.sender, _token, _amount);
    }

    /**
        @notice Deposit an amount of token in a pair

        @dev If the currency its ether and the destiny its a contract, execute the payable deposit()

        @param _id Index of pair in poaches array
        @param _amount Token amount

        @return true If the operation was executed
    */
    function deposit(
        uint256 _id,
        uint256 _amount
    ) external payable returns (bool) {
        Pair storage pair = poaches[_id];
        _deposit(pair.token, _amount);

        pair.balance += _amount;

        emit Deposit(_id, msg.sender, _amount);

        return true;
    }

    /**
        @notice Destroy a pair and return the funds

        @param _id Index of pair in poaches array
        @param _to The beneficiary of returned funds

        @return true If the operation was executed
    */
    function destroy(
        uint256 _id,
        address payable _to
    ) external onlyAuthorized(_id) returns (bool) {
        require(_to != address(0), "_to should not be 0x0");
        Pair storage pair = poaches[_id];
        require(pair.token != Token(0), "The pair not exists");

        uint256 balance = pair.balance;

        if (pair.token != Token(ETH))
            require(pair.token.transfer(_to, balance), "Error transfer tokens");
        else
            _to.transfer(balance);

        delete (pair.token);
        delete (pair.balance);

        emit Destroy(_id, msg.sender, _to, balance);

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
