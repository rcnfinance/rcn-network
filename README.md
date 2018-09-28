
# RCN

RCN is a protocol based on smart contracts that standardizes credit lending through blockchain technology. The network can connect borrowers, lenders, and other network agents all over the world, allowing each one of them to manage the credit in their local currencies.

More information on the  [Whitepaper](./WHITEPAPER.md) page.

# **V2 Basalt** - 233

The Basalt is the last stable version of the RCN protocol, currently working on the Ethereum mainnet allows borrowers, lender, and cosigners to request, lend and pay bullet loans.  These loans are configured defining an interest rate, a punitive interest rate, a duration, and a first payment date; all the accrued interests are calculated on-chain.

### Deployed contracts

RCN Token: [0xf970b8e36e23f7fc3fd752eea86f8be8d83375a6](https://etherscan.io/token/0xf970b8e36e23f7fc3fd752eea86f8be8d83375a6)

NanoLoanEngine: [0xba5a17f8ad40dc2c955d95c0547f3e6318bd72e7](https://etherscan.io/address/0xba5a17f8ad40dc2c955d95c0547f3e6318bd72e7)

The activity of the network can be monitored on the [dApp](https://github.com/ripio/rcn.loans) https://rcn.loans/

# Quick start

## Setup Web3

Web3 is a library used to interact with an Ethereum node, in this case, we will use it to interact with the contracts of RCN on the Ethereum mainnet.

We will be using the Javascript implementation of the library for this example.

### Setup engine connector

```javascript
const web3 = new Web3(new HttpProvider("https://main.node.rcn.loans:8545/"));
const engine_address = "0xba5a17f8ad40dc2c955d95c0547f3e6318bd72e7";
const engine = web3.eth.contract(engineAbi).at(engine_address);
```

With the *engine* object we are going to interact with the NanoLoanEngine contract, the *engineAbi* is a json that specifies all the contract methods and their signature, a copy can be found here [NanoLoanEngine.json](#)

**Notice:** This setup will be able to read information on the RCN network, to write new transactions additional steps to create an account and fund it with ETH must be taken.
<!-- TODO: Add link to configure account on web3 -->

## Request a loan

On the Basalt engine loans are requested strictly on-chain and initiated by the borrower or a third address called the *creator*, the creator gives context on the loan creation, usually is provided by the wallet of the borrower.


Calling createLoan on the NanoLoanEngine creates a new loan request; this loan request is only valid right away if the caller of the method is the borrower.

```solidity
    function createLoan(
        address _oracle,
        address _borrower,
        bytes32 _currency,
        uint256 _amount,
        uint256 _interestRate,
        uint256 _penaltyInterestRate,
        uint256 _duesIn,
        uint256 _firstPayment,
        uint256 _expiration,
        string _metadata
    ) public returns (uint256 id) {
```

#### Example

Loan configuration

| Field                 	| Value                   	| Encoded                                             	| Notes                                                                                                                                                     	|
|-----------------------	|-------------------------	|-----------------------------------------------------	|-----------------------------------------------------------------------------------------------------------------------------------------------------------	|
| Oracle                	| Ripio ARS Oracle        	| address: 0x33332025ad35a821eec5f1e10459222c8e4c62c3 	| The contract should implement the getRate method                                                                                                          	|
| Currency              	| ARS                     	| bytes32: 0x41525300 ... 000                         	| The encoded value is the hex of the UTF-8 encoded string, with leading 0                                                                                  	|
| Borrower              	| Address of the borrower 	| address: 0x7d7cfefb91c8bb2c330ec66d99c225d47c9131c0 	| The borrower can be any EOA or Contract, if the caller of the method is not the borrower, the loan is not approved until the approveLoan method is called 	|
| Amount                	| 2000.00                 	| 200000                                              	| The amount should be expressed on its minimum unit, this unit is specified by the Oracle                                                                  	|
| Interest rate         	| 20 %                    	| 15552000000000                                      	| The interest rate is encoded as the divisor of 10.000.000 and it's expresed by second                                                                     	|
| Penalty interest rate 	| 47.3 %                  	| 6575898520084                                       	| The interest rate is encoded as the divisor of 10.000.000 and it's expresed by second                                                                     	|
| Dues in               	| 60 days                 	| 5184000                                             	| Time after the lent when the debt is going to be considered overdue, seconds                                                                              	|
| First payment         	| 40 days                 	| 3456000                                             	| Time after the lent when payment will start to discount interest, on seconds                                                                              	|
| Expiration            	| 01/01/2060 12:00am      	| 2840140800                                          	| Timestamp of the expiration of this request                                                                                                               	|
| Metadata              	| Hello EVM!              	| Hello EVM!                                          	| Metadata with information for the dApp, no specific format required                                                                                       	|

Javascript create request:

```javascript
const r_create = await engine.createLoan(
                    "0x33332025ad35a821eec5f1e10459222c8e4c62c3",                         // Oracle
                    "0x7d7cfefb91c8bb2c330ec66d99c225d47c9131c0",                         // Borrower
                    "0x4152530000000000000000000000000000000000000000000000000000000000", // Currency
                    200000,                                                               // Amount
                    15552000000000,                                                       // Interest rate
                    6575898520084,                                                        // Punitive interest rate
                    5184000,                                                              // Duration
                    3456000,                                                              // First payment
                    2840140800,                                                           // Expiration
                    "Hello EVM!",                                                         // Metadata
                    { 
                        from: "0x263231ed9b51084816a44e18d16c0f6d0727491f"                // Creator
                    }
                );

const loan_id = ...; // TODO: Read loan id
```

## Approve a request

Requests are by-default non-ready to be lent (unless the creator of the loan is the borrower itself). To change the status of a loan to approved the approveLoan **or** approveLoanIdentifier methods must be called.

#### Direct approval

The method **approveLoan** approves the request if the caller is the Borrower, any other address could call this method, but it will not affect the request.

```javascript
const r_approve = await engine.approveLoan(loan_id);
```

#### Settle offline approval

The method **approveLoanIdentifier** approves the request using a message signed by the borrower; this allows the borrower to request a loan without needing to have ETH in advance.

```javascript
// Calculate the request identifier/hash using the method provided by the contract
const loan_identifier = await engine.buildIdentifier(
                            "0x33332025ad35a821eec5f1e10459222c8e4c62c3",                         // Oracle
                            "0x7d7cfefb91c8bb2c330ec66d99c225d47c9131c0",                         // Borrower
                            "0x263231ed9b51084816a44e18d16c0f6d0727491f",                         // Creator
                            "0x4152530000000000000000000000000000000000000000000000000000000000", // Currency
                            200000,                                                               // Amount
                            15552000000000,                                                       // Interest rate
                            6575898520084,                                                        // Punitive interest rate
                            5184000,                                                              // Duration
                            3456000,                                                              // First payment
                            2840140800,                                                           // Expiration
                            "Hello EVM!"                                                          // Metadata
                        );

// Sign the hash with the borrower address
const signature = await web3.eth.sign("0x7d7cfefb91c8bb2c330ec66d99c225d47c9131c0", loan_identifier).slice(2)

// Split the signature
let r = `0x${signature.slice(0, 64)}`
let s = `0x${signature.slice(64, 128)}`
let v = web3.toDecimal(signature.slice(128, 130)) + 27

// Register the approve
await engine.registerApprove(loan_identifier, v, r, s)
```
**Notice:** Contracts can't sign messages, this method only works if the Borrower is an EOA

---

One the request is approved it's ready to be filled! The loan request now should be visible on https://rcn.loans/

## Lend a loan

Any EOA or Contract can fill a request; the only requisite is to have RCN to transfer the money and ETH to pay the gas. The application must be non-expired, approved and non-filled or destroyed to be able to be lent.

The lender should transfer the RCN amount equivalent to the requested amount/currency; the conversion rate can be retrieved using the **getRate** method of the Oracle. If there is no Oracle, the lender should send the amount directly on RCN.

For perming this operation the **oracleData** will be required, this can be retrieved from the URL provided on the Oracle, if not available it will be assumed that the oracle data is not needed.

```javascript
// Load the oracle contract
const oracle_address = await engine.getOracle(loan_id);
const oracle = web3.eth.contract(oracleAbi).at(oracle_address);

// Load oracle data
const oracle_url = await oracle.url();
const response = await (await fetch("https://oracle.ripio.com/rate/")).json();
const oracle_data = response.find(i => i.currency == "0x4554480000000000000000000000000000000000000000000000000000000000")["data"];

// Get rate estimation
const rate_response = await oracle.getRate("0x4554480000000000000000000000000000000000000000000000000000000000", oracle_data);
const rate = rate_response[0];
const decimals = rate_response[1];

// Get amount to lend
const amount_currency = await engine.getAmount(loan_id);
const amount_tokens =  amount_currency * rate * 10 ** (18 - decimals) / 10 ** 18;

// Approve the RCN tokens debit
const rcn_address = "0xf970b8e36e23f7fc3fd752eea86f8be8d83375a6";
const rcn_token = web3.eth.contract(tokenAbi).at(rcn_address);
await rcn_token.approve(engine_address, amount_tokens);

// Lend!
await engine.lend(
    loan_id,     // Loan id
    oracle_data, // Oracle data
    0x0,         // Cosigner address
    [],          // Cosigner data
    {
        from: "0x09274ac7c07687ceb108a392b26affc3e5723670" // Lender address
    }
);
```

**Notice**: This loan has no Cosigner, in case of having a Cosigner the address should be provided along with the Cosigner data.

## Paying a loan

Loans in the RCN protocol can be paid and fully paid at any moment, similarly to the lender; the payer has to send the equivalent RCN to the amount desired to pay. The payer can be any address.

Not all loans will discount interest on early payments, that depends on the configuration of the debt.

**Notice:** Some loans increment their accrued interest seconds by seconds, so to fully pay a debt an amount larger than the current remaining should be paid. The exceeding amount will never be pulled from the payer

```javascript
// User input (full payment)
const pay_amount = 2200;

// Load the updated oracle data
const response = await (await fetch("https://oracle.ripio.com/rate/")).json();
const oracle_data = response.find(i => i.currency == "0x4554480000000000000000000000000000000000000000000000000000000000")["data"];

// Get rate estimation
const rate_response = await oracle.getRate("0x4554480000000000000000000000000000000000000000000000000000000000", oracle_data);
const rate = rate_response[0];
const decimals = rate_response[1];

// Get amount to lend
const amount_tokens =  pay_amount * rate * 10 ** (18 - decimals) / 10 ** 18;

// Approve the RCN tokens debit
await rcn_token.approve(engine_address, amount_tokens);

// Pay!
await engine.pay(
    loan_id,                                               // Loan id
    pay_amount,                                            // Amount to pay in the loan currency
    "0x09274ac7c07687ceb108a392b26affc3e5723670",          // Symbolic payer
    oracle_data,                                           // Oracle data
    {
        from: "0x09274ac7c07687ceb108a392b26affc3e5723670" // Sender of the payment
    }
);
```

## Withdraw payments

The tokens used to pay the loan don't go directly to the Lender address, they stay on the NanoLoanEngine until the withdrawal method is called.

This behavior is designed to allow lenders to keep track of the payments, as pushing tokens to a smart contract can't be detected from itself.

**Notice:** The funds will remain tied to the Loan and no to the lender account, if the loan is transferred the funds not withdrawn will also be transferred.

```javascript
// Read funds on the loan
const funds = await engine.getLenderBalance(loan_id);

// Withdraw!
await engine.withdrawal(
    loan_id,                                               // Loan id
    "0x09274ac7c07687ceb108a392b26affc3e5723670",          // Destination of the funds
    funds,                                                 // Amount to withdraw
    {
        from: "0x09274ac7c07687ceb108a392b26affc3e5723670" // Address of the current owner
    }
);
```