RCN - Ripio Credit Network
==================================
Ripio Credit Network (“RCN​”) is a protocol based on smart contracts and blockchain technology, which brings enhanced transparency and reliability in credit and lending. The protocol enables connections between lenders and borrowers located anywhere in the world, regardless of currency.

This repository contains the contracts that integrate the network, the current status of the project is alpha, and we are in the first stages of development.

## Members of the network

### Engines

Engines hosts the logic and the state of all the loans using them; they can implement any custom rules about interest, due times, cancelable timestamp, or more parameters. 
However, we recommend following a standard interface and specifications.

### Oracle

Oracles provide equivalencies between RCN and other currencies; they should implement the oracle.sol interface to be compatible with other members of the Network. 

Maintaining a cosigner could be a relatively costly task, so it's a suggested practice add a little fee to deliver the rate.

## Contracts

### NanoLoanEngine

The NanoLoan it is what we consider the most basic loan on the RCN.



The flow of the loan creation is the following:

1. Any user in the network can create a new loan, setting the desired params: Cosigner, Oracle, Borrower, interest rates, expiration time and cancelable date.

2. All members that are assuming a responsibility (Borrower & Cosigner) must call the method *approve*, showing that they comply with the terms of the loan.

3. At this point in the lifecycle of the loan any member of the RCN network could become the lender, an RCN Holder calls the method *lend* of the engine; that transfers from the user to the borrower the amount request in RCN, and transform the user in the new lender.

4. In any moment anyone can pay partially or entirely the debt, if the payment time is after the *cancelableAt* delta time, the payment discounts interests.

### BasicOracle

The BasicOracle implements a generic version of the Oracle interface, it allows the implementation of an arbitrary number of symbols. The owner has the responsibility of maintaining the rates updated.