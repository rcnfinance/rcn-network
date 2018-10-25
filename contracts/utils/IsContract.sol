pragma solidity ^0.4.24;

library IsContract {
    function _isContract(address _addr) internal view returns (bool) {
        uint size;
        assembly { size := extcodesize(_addr) }
        return size > 0;
    }
}