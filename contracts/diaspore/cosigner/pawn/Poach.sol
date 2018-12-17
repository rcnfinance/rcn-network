pragma solidity ^0.4.24;

import "./../../../interfaces/Token.sol";

import "./../../../utils/ERC721Base.sol";


contract Events {
    event Created(
        address owner,
        uint256 pairId,
        address erc20,
        uint256 amount
    );

    event Deposit(
        address sender,
        uint256 pairId,
        uint256 amount
    );

    event Destroy(
        address retriever,
        uint256 pairId,
        uint256 amount
    );
}


contract Poach is ERC721Base, Events {
    using SafeMath for uint256;

    address constant internal ETH = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;

    struct Pair {
        Token token;
        uint256 amount;
        bool alive;
    }

    Pair[] public poaches;

    constructor() public {
        poaches.length++;
    }

    modifier alive(uint256 id) {
        require(poaches[id].alive, "the pair its not alive");
        _;
    }

    function getPair(uint poachId) public view returns(address, uint, bool) {
        Pair storage poach = poaches[poachId];
        return (poach.token, poach.amount, poach.alive);
    }

    /**
        @notice Create a pair and push into the poaches array

        @param token Token address (ERC20)
        @param amount Token amount

        @return id Index of pair in the poaches array
    */
    function create(
        Token token,
        uint256 amount
    ) external payable returns (uint256 id) {
        if (msg.value == 0)
            require(token.transferFrom(msg.sender, this, amount));
        else
            require(msg.value == amount && address(token) == ETH);

        id = poaches.length;
        poaches.push(Pair(token, amount, true));
        emit Created(msg.sender, id, token, amount);
        _generate(id, msg.sender);
    }

    /**
        @notice Deposit an amount of token in a pair

        @dev If the currency its ether and the destiny its a contract, execute the payable deposit()

        @param id Index of pair in poaches array
        @param amount Token amount

        @return true If the operation was executed
    */
    function deposit(
        uint256 id,
        uint256 amount
    ) external payable alive(id) returns (bool) {
        Pair storage pair = poaches[id];

        if (msg.value == 0)
            require(pair.token.transferFrom(msg.sender, this, amount));
        else
            require(msg.value == amount && address(pair.token) == ETH);

        pair.amount = (pair.amount).add(amount);
        emit Deposit(msg.sender, id, amount);

        return true;
    }

    /**
        @notice Destroy a pair and return the funds to the owner

        @param id Index of pair in poaches array

        @return true If the operation was executed
    */
    function destroy(uint256 id) external onlyAuthorized(id) alive(id) returns (bool) {
        Pair storage pair = poaches[id];

        if (address(pair.token) != ETH)
            require(pair.token.transfer(msg.sender, pair.amount));
        else
            msg.sender.transfer(pair.amount);

        pair.alive = false;
        pair.amount = 0;

        emit Destroy(msg.sender, id, pair.amount);

        return true;
    }
}
