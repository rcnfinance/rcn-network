pragma solidity ^0.5.0;

import "./../../../interfaces/IERC721Base.sol";
import "./interfaces/IBundle.sol";

import "./../../../utils/Ownable.sol";
import "./../../../utils/ERC721Base.sol";


contract Bundle is ERC721Base, IBundle {
    Package[] private packages;

    struct Package {
        IERC721Base[] erc721s;
        uint256[] erc721Ids;
        // erc721 to erc721Id to position on erc721s
        mapping(address => mapping(uint256 => uint256)) order;
    }

    constructor() public ERC721Base("ERC721 Bundle", "EB") { }

    function canDeposit(uint256 _packageId) external view returns (bool) {
        return _isAuthorized(msg.sender, _packageId);
    }

    /**
        @notice Get the content of a package
    */
    function content(uint256 _id) external view returns (IERC721Base[] memory, uint256[] memory) {
        Package memory package = packages[_id];
        return (package.erc721s, package.erc721Ids);
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
        @param _erc721 erc721 address
        @param _erc721Id erc721 identifier

        @return true If the operation was executed
    */
    function deposit(
        uint256 _packageId,
        IERC721Base _erc721,
        uint256 _erc721Id
    ) external returns (bool) {
        return _deposit(_packageId == 0 ? create() : _packageId, _erc721, _erc721Id);
    }

    /**
        @notice Deposit a batch of non fungible tokens on a package

        @dev The length of tokens and ids should be equal

        @param _packageId Index of package in packages array
        @param _erc721s erc721 addresses array
        @param _erc721Ids erc721 identifiers array

        @return true If the operation was executed
    */
    function depositBatch(
        uint256 _packageId,
        IERC721Base[] calldata _erc721s,
        uint256[] calldata _erc721Ids
    ) external returns (bool) {
        uint256 packageId = _packageId == 0 ? create() : _packageId;
        require(_erc721s.length == _erc721Ids.length, "The _erc721s length and _erc721Ids length must be equal");
        for (uint256 i = 0; i < _erc721Ids.length; i++) {
            _deposit(packageId, _erc721s[i], _erc721Ids[i]);
        }

        return true;
    }

    /**
        @notice Withdraw a non fungible token from a package

        @param _packageId Index of package in packages array
        @param _erc721 erc721 address
        @param _erc721Id erc721 identifier
        @param _to address beneficiary

        @return true If the operation was executed
    */
    function withdraw(
        uint256 _packageId,
        IERC721Base _erc721,
        uint256 _erc721Id,
        address _to
    ) external onlyAuthorized(_packageId) returns (bool) {
        return _withdraw(_packageId, _erc721, _erc721Id, _to);
    }

    /**
        @notice Withdraw a batch of non fungible tokens from a package

        @dev The length of tokens and ids should be equal

        @param _packageId Index of package in packages array
        @param _erc721s erc721 addresses array
        @param _erc721Ids erc721 identifiers array
        @param _to address beneficiary

        @return true If the operation was executed
    */
    function withdrawBatch(
        uint256 _packageId,
        IERC721Base[] calldata _erc721s,
        uint256[] calldata _erc721Ids,
        address _to
    ) external onlyAuthorized(_packageId) returns (bool) {
        for (uint256 i = 0; i < _erc721s.length; i++)
            _withdraw(_packageId, _erc721s[i], _erc721Ids[i], _to);

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
    ) external onlyAuthorized(_packageId) returns (bool) {
        Package storage package = packages[_packageId];

        for (uint256 i = package.erc721Ids.length - 1; i > 0; i--) {
            _withdraw(_packageId, IERC721Base(package.erc721s[i]), package.erc721Ids[i], _to);
        }

        return true;
    }

    //
    // Internal functions
    //

    function _deposit(
        uint256 _packageId,
        IERC721Base _erc721,
        uint256 _erc721Id
    ) internal returns (bool) {
        require(_isAuthorized(msg.sender, _packageId), "Not authorized for deposit");

        _erc721.transferFrom(msg.sender, address(this), _erc721Id);

        Package storage package = packages[_packageId];
        package.order[address(_erc721)][_erc721Id] = package.erc721s.push(_erc721) - 1;
        package.erc721Ids.push(_erc721Id);

        emit Deposit(msg.sender, _packageId, _erc721, _erc721Id);

        return true;
    }

    function _withdraw(
        uint256 _packageId,
        IERC721Base _erc721,
        uint256 _erc721Id,
        address _to
    ) internal returns (bool) {
        Package storage package = packages[_packageId];
        _remove(package, _erc721, _erc721Id);
        emit Withdraw(msg.sender, _packageId, _erc721, _erc721Id);

        _erc721.transferFrom(address (this), _to, _erc721Id);
        require(_erc721.ownerOf(_erc721Id) == _to, "IERC721Base transfer failed");

        return true;
    }

    function _remove(
        Package storage _package,
        IERC721Base _erc721,
        uint256 _erc721Id
    ) internal {
        require(_hasAsset(_package, _erc721, _erc721Id), "The package dont has the asset");

        // Replace item to remove with last item
        // (make the item to remove the last one)
        uint256 delPosition = _package.order[address(_erc721)][_erc721Id];
        uint256 lastPosition = _package.erc721s.length - 1;

        if (lastPosition != delPosition) {
            IERC721Base lastErc721 = _package.erc721s[lastPosition];
            uint256 lastErc721Id = _package.erc721Ids[lastPosition];
            _package.erc721s[delPosition] = lastErc721;
            _package.erc721Ids[delPosition] = lastErc721Id;
            _package.order[address(lastErc721)][lastErc721Id] = delPosition;
        }

        // Remove last position
        delete _package.erc721s[delPosition] ;
        _package.erc721s.length--;
        delete _package.erc721Ids[delPosition];
        _package.erc721Ids.length--;
        delete _package.order[address(_erc721)][_erc721Id];
    }

    function _hasAsset(
        Package storage _package,
        IERC721Base _erc721,
        uint256 _erc721Id
    ) internal returns (bool) {
        uint256 position = _package.order[address(_erc721)][_erc721Id];
        return position != 0 ||
            (_package.erc721Ids.length != 0 &&
                _package.erc721s[position] == _erc721 &&
                _package.erc721Ids[position] == _erc721Id);
    }
}
