
pragma solidity ^0.5.7;

import "../../commons/Ownable.sol";

contract RcnRegistry is Ownable {

    mapping (bytes32 => address) public storedAddresses;
    string[] public keys;

    event AddOrChangeAddress(string _nameKey, address indexed _oldAddress, address indexed _newAddress);

    /**
     * @notice Gets the contract address
     * @param _nameKey is the key for the contract address mapping
     * @return address
     */
    function getAddress(string calldata _nameKey) external view returns(address) {
        bytes32 key = keccak256(bytes(_nameKey));
        require(storedAddresses[key] != address(0), "Invalid address key");
        return storedAddresses[key];
    }
    
    /**
     * @notice New contract address
     * @param _nameKey is the key for the contract address mapping
     * @param _newAddress is the new contract address
     */
    function newAddress(string calldata _nameKey, address _newAddress) external onlyOwner {
        keys.push(_nameKey);
        _addOrChangeAddress(_nameKey, _newAddress);
    }

    /**
     * @notice Changes the contract address
     * @param _nameKey is the key for the contract address mapping
     * @param _newAddress is the new contract address
     */
    function changeAddress(string calldata _nameKey, address _newAddress) external onlyOwner {
       _addOrChangeAddress(_nameKey, _newAddress);
    }
    
    /**
     * @notice Internal method for add or change the contract address 
     * @param _nameKey is the key for the contract address mapping
     * @param _newAddress is the new contract address
     */
    function _addOrChangeAddress(string memory _nameKey, address _newAddress) internal {
        bytes32 key = keccak256(bytes(_nameKey));
        emit AddOrChangeAddress(_nameKey, storedAddresses[key], _newAddress);
        storedAddresses[key] = _newAddress;
    }

}