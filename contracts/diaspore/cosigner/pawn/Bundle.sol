pragma solidity ^0.4.24;

import "./../../../interfaces/IERC721Base.sol";

import "./../../../utils/BytesUtils.sol";
import "./../../../utils/Ownable.sol";
import "./../../../utils/ERC721Base.sol";


contract Events {
    event Created(
        address owner,
        uint256 id
    );

    event Deposit(
        address sender,
        uint256 bundle,
        address token,
        uint256 id
    );

    event Withdraw(
        address retriever,
        uint256 bundle,
        address token,
        uint256 id
    );
}


contract Bundle is ERC721Base, Events, BytesUtils {
    uint256 private constant MAX_UINT256 = uint256(0) - uint256(1);

    Package[] private packages;

    struct Package {
        address[] tokens;
        uint256[] ids;
        mapping(address => mapping(uint256 => uint256)) order;
    }

    constructor() public {
        packages.length++;
    }

    modifier canWithdraw(uint256 packageId) {
        require(_isAuthorized(msg.sender, packageId), "Not authorized for withdraw");
        _;
    }

    function canDeposit(uint256 packageId) public view returns (bool) {
        return _isAuthorized(msg.sender, packageId);
    }

    /**
        @notice Get the content of a package
    */
    function content(uint256 id) external view returns (address[] tokens, uint256[] ids) {
        Package memory package = packages[id];
        tokens = package.tokens;
        ids = package.ids;
    }

    // create package
    /**
    @notice Create a empty Package in packages array
    */
    function create() public returns (uint256 id) {
        id = packages.length;
        packages.length++;
        emit Created(msg.sender, id);
        _generate(id, msg.sender);
    }

    /**
        @notice Deposit a non fungible token on a package

        @param _packageId Index of package in packages array
        @param token Token address (IERC721Base)
        @param tokenId Token identifier

        @return true If the operation was executed
    */
    function deposit(
        uint256 _packageId,
        IERC721Base token,
        uint256 tokenId
    ) external returns (bool) {
        uint256 packageId = _packageId == 0 ? create() : _packageId;
        require(canDeposit(packageId), "Not authorized for deposit");
        return _deposit(packageId, token, tokenId);
    }

    /**
        @notice Deposit a batch of non fungible tokens on a package

        @dev The length of tokens and ids should be equal

        @param _packageId Index of package in packages array
        @param tokens Token addresses (IERC721Base) array
        @param ids Token identifiers array

        @return true If the operation was executed
    */
    function depositBatch(
        uint256 _packageId,
        IERC721Base[] tokens,
        uint256[] ids
    ) external returns (bool) {
        uint256 packageId = _packageId == 0 ? create() : _packageId;
        require(canDeposit(packageId), "Not authorized for deposit");

        require(tokens.length == ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            require(_deposit(packageId, tokens[i], ids[i]));
        }

        return true;
    }

    /**
        @notice Withdraw a non fungible token from a packag

        @param packageId Index of package in packages array
        @param token Token address (IERC721Base)
        @param tokenId Token identifier
        @param to address beneficiary

        @return true If the operation was executed
    */
    function withdraw(
        uint256 packageId,
        IERC721Base token,
        uint256 tokenId,
        address to
    ) external canWithdraw(packageId) returns (bool) {
        return _withdraw(packageId, token, tokenId, to);
    }

    /**
        @notice Withdraw a batch of non fungible tokens from a package

        @dev The length of tokens and ids should be equal

        @param packageId Index of package in packages array
        @param tokens Token addresses (IERC721Base) array
        @param ids Token identifiers array
        @param to address beneficiary

        @return true If the operation was executed
    */
    function withdrawBatch(
        uint256 packageId,
        IERC721Base[] tokens,
        uint256[] ids,
        address to
    ) external canWithdraw(packageId) returns (bool) {
        for (uint256 i = 0; i < tokens.length; i++) {
            require(_withdraw(packageId, tokens[i], ids[i], to));
        }

        return true;
    }

    /**
        @notice Withdraw all non fungible tokens from a package

        @param packageId Index of package in packages array
        @param to address beneficiary

        @return true If the operation was executed
    */
    function withdrawAll(
        uint256 packageId,
        address to
    ) external canWithdraw(packageId) returns (bool) {
        Package storage package = packages[packageId];
        uint256 i = package.ids.length - 1;

        for (; i != MAX_UINT256; i--) {
            require(_withdraw(packageId, IERC721Base(package.tokens[i]), package.ids[i], to));
        }

        return true;
    }

    //
    // Internal functions
    //

    function _deposit(
        uint256 packageId,
        IERC721Base token,
        uint256 tokenId
    ) internal returns (bool) {
        token.transferFrom(msg.sender, address(this), tokenId);
        require(token.ownerOf(tokenId) == address(this), "ERC721Base transfer failed");

        Package storage package = packages[packageId];
        _add(package, token, tokenId);

        emit Deposit(msg.sender, packageId, token, tokenId);

        return true;
    }

    function _withdraw(
        uint256 packageId,
        IERC721Base token,
        uint256 tokenId,
        address to
    ) internal returns (bool) {
        Package storage package = packages[packageId];
        _remove(package, token, tokenId);
        emit Withdraw(msg.sender, packageId, token, tokenId);

        token.transferFrom(this, to, tokenId);
        require(token.ownerOf(tokenId) == to, "ERC721Base transfer failed");

        return true;
    }

    function _add(
        Package storage package,
        IERC721Base token,
        uint256 id
    ) internal {
        uint256 position = package.order[token][id];
        require(!_isAsset(package, position, token, id), "Already exist");
        position = package.tokens.length;
        package.tokens.push(token);
        package.ids.push(id);
        package.order[token][id] = position;
    }

    function _remove(
        Package storage package,
        IERC721Base token,
        uint256 id
    ) internal {
        uint256 delPosition = package.order[token][id];
        require(_isAsset(package, delPosition, token, id), "The token does not exist inside the package");

        // Replace item to remove with last item
        // (make the item to remove the last one)
        uint256 lastPosition = package.tokens.length - 1;
        if (lastPosition != delPosition) {
            address lastToken = package.tokens[lastPosition];
            uint256 lastId = package.ids[lastPosition];
            package.tokens[delPosition] = lastToken;
            package.ids[delPosition] = lastId;
            package.order[lastToken][lastId] = delPosition;
        }

        // Remove last position
        package.tokens.length--;
        package.ids.length--;
        delete package.order[token][id];
    }

    function _isAsset(
        Package memory package,
        uint256 position,
        address token,
        uint256 id
    ) internal pure returns (bool) {
        return position != 0 ||
            (package.ids.length != 0 && package.tokens[position] == token && package.ids[position] == id);
    }
}
