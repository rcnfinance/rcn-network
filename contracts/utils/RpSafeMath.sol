pragma solidity ^0.4.10;

/* taking ideas from FirstBlood token */
contract RpSafeMath {
    function safeAdd(uint256 x, uint256 y) internal returns(uint256) {
      uint256 z = x + y;
      assert((z >= x) && (z >= y));
      return z;
    }

    function safeSubtract(uint256 x, uint256 y) internal returns(uint256) {
      assert(x >= y);
      uint256 z = x - y;
      return z;
    }

    function safeMult(uint256 x, uint256 y) internal returns(uint256) {
      uint256 z = x * y;
      assert((x == 0)||(z/x == y));
      return z;
    }

    function min(uint256 a, uint256 b) internal returns(uint256) {
        if (a < b) { 
          return a;
        } else { 
          return b; 
        }
    }
    
    function max(uint256 a, uint256 b) internal returns(uint256) {
        if (a > b) { 
          return a;
        } else { 
          return b; 
        }
    }
}
