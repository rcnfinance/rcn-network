pragma solidity ^0.5.0;

import "./../../../interfaces/IERC721Base.sol";
import "./interfaces/IBundle.sol";

import "./../../../utils/BytesUtils.sol";
import "./../../../utils/Ownable.sol";
import "./../../../utils/ERC721Base.sol";


contract Bundle is ERC721Base, IBundle, BytesUtils {
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

    modifier canWithdraw(uint256 _packageId) {
        require(_isAuthorized(msg.sender, _packageId), "Not authorized for withdraw");
        _;
    }

    function canDeposit(uint256 _packageId) public view returns (bool) {
        return _isAuthorized(msg.sender, _packageId);
    }

    /**
        @notice Get the content of a package
    */
    function content(uint256 _id) external view returns (address[] memory tokens, uint256[] memory ids) {
        Package memory package = packages[_id];
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
        @param _token Token address (IERC721Base)
        @param _tokenId Token identifier

        @return true If the operation was executed
    */
    function deposit(
        uint256 _packageId,
        IERC721Base _token,
        uint256 _tokenId
    ) external returns (bool) {
        uint256 packageId = _packageId == 0 ? create() : _packageId;
        require(canDeposit(packageId), "Not authorized for deposit");
        return _deposit(packageId, _token, _tokenId);
    }

    /**
        @notice Deposit a batch of non fungible tokens on a package

        @dev The length of tokens and ids should be equal

        @param _packageId Index of package in packages array
        @param _tokens Token addresses (IERC721Base) array
        @param _ids Token identifiers array

        @return true If the operation was executed
    */
    function depositBatch(
        uint256 _packageId,
        IERC721Base[] calldata _tokens,
        uint256[] calldata _ids
    ) external returns (bool) {
        uint256 packageId = _packageId == 0 ? create() : _packageId;
        require(canDeposit(packageId), "Not authorized for deposit");

        require(_tokens.length == _ids.length, "The _tokens length and _ids length must be equal");
        for (uint256 i = 0; i < _ids.length; i++) {
            _deposit(packageId, _tokens[i], _ids[i]);
        }

        return true;
    }

    /**
        @notice Withdraw a non fungible token from a packag

        @param _packageId Index of package in packages array
        @param _token Token address (IERC721Base)
        @param _tokenId Token identifier
        @param _to address beneficiary

        @return true If the operation was executed
    */
    function withdraw(
        uint256 _packageId,
        IERC721Base _token,
        uint256 _tokenId,
        address _to
    ) external canWithdraw(_packageId) returns (bool) {
        return _withdraw(_packageId, _token, _tokenId, _to);
    }

    /**
        @notice Withdraw a batch of non fungible tokens from a package

        @dev The length of tokens and ids should be equal

        @param _packageId Index of package in packages array
        @param _tokens Token addresses (IERC721Base) array
        @param _ids Token identifiers array
        @param _to address beneficiary

        @return true If the operation was executed
    */
    function withdrawBatch(
        uint256 _packageId,
        IERC721Base[] calldata _tokens,
        uint256[] calldata _ids,
        address _to
    ) external canWithdraw(_packageId) returns (bool) {
        for (uint256 i = 0; i < _tokens.length; i++) {
            _withdraw(_packageId, _tokens[i], _ids[i], _to);
        }

        return true;
    }

    /**
        @notice Withdraw all non fungible tokens from a package

        @param _packageId Index of package in packages array
        @param _to address beneficiary

        @return true If the operation was executed
    */
    function withdrawAll(
        uint256 _packageId,
        address _to
    ) external canWithdraw(_packageId) returns (bool) {
        Package storage package = packages[_packageId];
        uint256 i = package.ids.length - 1;

        for (; i != MAX_UINT256; i--) {
            _withdraw(_packageId, IERC721Base(package.tokens[i]), package.ids[i], _to);
        }

        return true;
    }

    //
    // Internal functions
    //

    function _deposit(
        uint256 _packageId,
        IERC721Base _token,
        uint256 _tokenId
    ) internal returns (bool) {
        _token.transferFrom(msg.sender, address(this), _tokenId);
        require(_token.ownerOf(_tokenId) == address(this), "ERC721Base transfer failed");

        Package storage package = packages[_packageId];
        _add(package, address(_token), _tokenId);

        emit Deposit(msg.sender, _packageId, _token, _tokenId);

        return true;
    }

    function _withdraw(
        uint256 _packageId,
        IERC721Base _token,
        uint256 _tokenId,
        address _to
    ) internal returns (bool) {
        Package storage package = packages[_packageId];
        _remove(package, address(_token), _tokenId);
        emit Withdraw(msg.sender, _packageId, _token, _tokenId);

        _token.transferFrom(address (this), _to, _tokenId);
        require(_token.ownerOf(_tokenId) == _to, "ERC721Base transfer failed");

        return true;
    }

    function _add(
        Package storage _package,
        address _token,
        uint256 _id
    ) internal {
        uint256 position = _package.order[_token][_id];
        require(!_isAsset(_package, position, _token, _id), "Already exist");
        position = _package.tokens.length;
        _package.tokens.push(_token);
        _package.ids.push(_id);
        _package.order[_token][_id] = position;
    }

    function _remove(
        Package storage _package,
        address _token,
        uint256 _id
    ) internal {
        uint256 delPosition = _package.order[_token][_id];
        require(_isAsset(_package, delPosition, _token, _id), "The token does not exist inside the package");

        // Replace item to remove with last item
        // (make the item to remove the last one)
        uint256 lastPosition = _package.tokens.length - 1;
        if (lastPosition != delPosition) {
            address lastToken = _package.tokens[lastPosition];
            uint256 lastId = _package.ids[lastPosition];
            _package.tokens[delPosition] = lastToken;
            _package.ids[delPosition] = lastId;
            _package.order[lastToken][lastId] = delPosition;
        }

        // Remove last position
        _package.tokens.length--;
        _package.ids.length--;
        delete _package.order[_token][_id];
    }

    function _isAsset(
        Package memory _package,
        uint256 _position,
        address _token,
        uint256 _id
    ) internal pure returns (bool) {
        return _position != 0 ||
            (_package.ids.length != 0 && _package.tokens[_position] == _token && _package.ids[_position] == _id);
    }
}
