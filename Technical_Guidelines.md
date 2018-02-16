# <img src="https://github.com/c0chi/rcn-network/blob/master/images/logo_simple.png" width=auto height="28"> RCN

RCN​ is a global p2p lending protocol based on smart contracts and
blockchain technology, which brings enhanced transparency and
reliability in credit and lending. The protocol enables connections
between lenders and borrowers located anywhere in the world, regardless
of currency.

This repository contains the contracts that integrate the network, the
current status of the project is alpha, and we are in the first stages
of development.

## Members of the network

### Engines

Engines hosts the logic and the state of all the loans using them; they
can implement any custom rules about interest, due times, cancelable
timestamp, or more parameters. However, we recommend following a
standard interface and specifications.

### Oracle

Oracles provide equivalencies between RCN and other currencies; they
should implement the oracle.sol interface to be compatible with other
members of the Network.

Maintaining a Oracle could be a relatively costly task, so it's a
suggested practice add a little fee to deliver the rate.

## Contracts

### NanoLoanEngine

An RCNB_ca *NanoLoan* is an RCN Loan whose entire principal value is
paid all at once on the maturity date *dueDate*, as opposed to
amortizing the bond over its lifetime.

The RCNB_ca lifetime is divided in two periods by a parameterizable date
called *cancelableAt*. Before that date, the Borrower must pay the
nominal value of the credit to cancel the obligation. After that date
and until the expiration, the amount to be paid for redeem the
obligation is composed of the principal value and interest accrued
between the origination date and the due date.

From issuance to maturity, interest grows linearly at the "X" rate.
After maturity, the balance continues to grow linearly but at the "YY"
rate, which is expected to be higher.

The flow of the loan creation is the following:

1. Any user in the network can create a new loan, setting the desired
   params: Cosigner, Oracle, Borrower, interest rates, expiration time
   and cancelable date.

2. All members that are assuming a responsibility (Borrower & Cosigner)
   must call the method *approve*, showing that they comply with the
   terms of the loan.

3. At this point in the lifecycle of the loan any member of the RCN
   network could become the lender, an RCN Holder calls the method
   *lend* of the engine; that transfers from the user to the borrower
   the amount request in RCN, and transform the user in the new lender.

4. In any moment anyone can pay partially or entirely the debt, if the
   payment time is after the *cancelableAt* delta time, the payment
   discounts interests.

### BasicOracle

The BasicOracle implements a generic version of the Oracle interface, it
allows the implementation of an arbitrary number of symbols. The owner
has the responsibility of maintaining the rates updated.

### BasicCosigner

The BasicCosigner is a sample that shows how cosigners can be
implemented to the network. This sample defines the part of the loan
covered and builds a liability. This means that, if the borrower
defaults, the cosigner pays the compensation in exchange for the
defaulted loan.

BasicCosigner.sol is only the first implementation on the role of a
cosigner agent in RCN. The concept itself is flexible, which means that
any combination of rules and conditions could be used to implement a
cosigner.

We believe that the most transparent way of running a cosigner is to
imprint that logic on a smart contract, but it's not required by the
network.



## Git References

1. [**README** ](/README.md):
   * It contains the context of the project and raises the problem of
     the current system.
   * An example is used to illustrate the problem and think about the
     solution
   * RCN emerges as a possible solution. Its main agents and their
     interaction are described.
   * It shows the operation of the network with a use case.

2. [**Technical Guidelines** ](/Technical_Guidelines.md): **_This document !_**

   * It contains the general guidelines of the project and its status.
   * Provides a explanation of the main smart contracts that will be
     developed and their purposes
   * Inform the Ethereum address for those already deployed

3. [**Technical Documentation**](/Technical_Documentation.md)

   * Describe in detail each of the developed contracts and expose your
     Ethereum address and how to use them
   * Describe the correct use of the RCN SDK for easy integration into
     the network