pragma solidity ^0.4.15;

/**
    @dev Defines the interface of a standard RCN cosigner.

    The cosigner is an agent that gives an insurance to the lender in the event of a defaulted loan, the confitions
    of the insurance and the cost of the given are defined by the cosigner. 

    The lender will decide what cosigner to use, if any; the address of the cosigner and the valid data provided by the
    agent should be passed as params when the lender calls the "lend" method on the engine.
    
    When the default conditions defined by the cosigner aligns with the status of the loan, the lender of the engine
    should be able to call the "claim" method to receive the benefit; the cosigner can define aditional requirements to
    call this method, like the transfer of the ownership of the loan.
*/
contract Cosigner {
    uint256 public constant VERSION = 2;
    
    /**
        @return the url of the endpoint that exposes the insurance offers.
    */
    function url() constant returns (string);
    
    /**
        @dev Retrieves the cost of a given insurance, this amount should be exact, if when called the "cosign" method
        the cosigner does not withdraw this exact amount of RCN from the engine, the whole operation will fail.

        @return the cost of the cosign, in RCN wei
    */
    function getCost(address engine, uint256 index, bytes data) constant returns (uint256);
    
    /**
        @dev The engine calls this method for confirmation of the conditions, if the cosigner accepts the liability of
        the insurance; and the paremeters passed in the data field this method should return true.

        @return true if the cosigner accepts the liability
    */
    function cosign(address engine, uint256 index, bytes data) returns (bool);
    
    /**
        @dev Claims the benefit of the insurance if the loan is defaulted, this method should be only calleable by the
        current lender of the loan.

        @return true if the claim was done correctly.
    */
    function claim(address engine, uint256 index, bytes oracleData) public returns (bool);
}