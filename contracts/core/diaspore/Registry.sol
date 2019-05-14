
pragma solidity ^0.5.7;

import "../../commons/Ownable.sol";

contract Registry is Ownable {

    struct Entry  {
        bool saved;
        address storedAddress;
    }
    
    mapping (bytes32 => Entry) public storedAddresses;
    string[] public keys;

    event NewAddress(string _nameKey, address indexed _newAddress);
    event ChangedAddress(string _nameKey, address indexed _oldAddress, address indexed _newAddress);

    /**
     * @notice Gets the entry
     * @param _index is the position in keys array
     * @return key, address
     */
    function getEntry(uint _index) external view returns(string memory key, address value) {
        key = keys[_index];
        value = storedAddresses[keccak256(bytes(key))].storedAddress;
    }

    /**
     * @notice Gets the contract address
     * @param _nameKey is the key for the contract address mapping
     * @return address
     */
    function getAddress(string calldata _nameKey) external view returns(address) {
        bytes32 key = keccak256(bytes(_nameKey));
        require(storedAddresses[key].storedAddress != address(0), "Invalid address key");
        return storedAddresses[key].storedAddress;
    }
    
    /**
     * @notice New contract address
     * @param _nameKey is the key for the contract address mapping
     * @param _newAddress is the new contract address
     */
    function newAddress(string calldata _nameKey, address _newAddress) external onlyOwner {
        bytes32 key = keccak256(bytes(_nameKey));
        require(!storedAddresses[key].saved, "The key exist in addresses mapping");
        keys.push(_nameKey);
        storedAddresses[key] = Entry(_newAddress, true);
        emit NewAddress(_nameKey, _newAddress);
    }

    /**
     * @notice Changes the contract address
     * @param _nameKey is the key for the contract address mapping
     * @param _newAddress is the new contract address
     */
    function changeAddress(string calldata _nameKey, address _newAddress) external onlyOwner {
        bytes32 key = keccak256(bytes(_nameKey));
        require(storedAddresses[key].saved, "The key already exist in addresses mapping");
        storedAddresses[key].storedAddress = _newAddress;
        emit ChangedAddress(_nameKey, storedAddresses[key].storedAddress, _newAddress);
    }

}