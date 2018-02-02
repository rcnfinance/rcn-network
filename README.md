<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/logo_rcn.png" title="RCN Logo">
</p>

# RCN


## Abstract

Credit has always had several advantages for society. However, the
credit industry still has several problems waiting for solutions. Both
traditional banking institutions and recent p2p alternatives have huge
problems and opportunities for improvement.

We propose **RCN, a protocol based on smart contracts and blockchain
technology, which brings enhanced transparency and reliability in credit
and lending.**

RCN defines a set of rules for the integration of several agents
participating in the credit lifetime, allowing connections between
lenders and borrowers located anywhere in the world, regardless of
currency.

The protocol that we propose seeks to provide an objective measure of
the credit risk assumed by the lenders, diminish that risk or even
neutralize it totally and, in case of default, it provides an
alternative mechanism for managing the debt collection in the borrower’s
country of residence decreasing losses throughout the network.

By making use of blockchain technology and uncluding a special agent
called "Cosigner", RCN manages to reduce the traditional banking
brokerage costs and management fees, allowing better conditions for both
sides, lenders and borrowers, with the consequent **significant
improvement in financial inclusion.**


## Context

### The traditional banking system

The financial system has been one of the main actors of the global
economy for hundreds of years. Credit, one of its essential functions,
consists of managing the savings of a population by channeling these
savings from agents with surplus funds (lenders) to others with
insufficient funds (borrowers). [See Figure 1.]

In a hypothetical scenario in which no bank existed as an intermediary
agent, for a credit transaction to take place both borrowers and lenders
would need to: (1) become aware of each other’s existence, (2) agree on
how to value the risk involved in the credit transaction, (3) agree on
time-limits, amounts, and related terms, and finally, (4) manage the
logistics necessary to actually transfer the money during the lifetime
of the loan.

Today, bank intermediation reduces these transaction and information
costs, but with certain limitations. Generally, banks focus their
operations in determined geographic locations, which makes it difficult
for people in different areas to connect for purposes of credit
transactions. Additionally, a large amount of the world’s population is
unbanked or underbanked, and the rest are plainly excluded from the
financial system. [See Figure 2.] Banks give loans and credit according
to their risk capacities, and as a result, some credit projects are too
expensive to undertake relative to the would-be borrower’s
creditworthiness, and some are simply un-creditable under local banks’
risk capacities. As a further limitation to bank intermediation of
credit, the standard credit-granting process involves inherent
bureaucracy in the collection and dispersion of information, which adds
costs and ultimately excludes even larger segments of the population.
[See Figure 3.]

<p> &nbsp;</p>
<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/map_1.png" width="768" title="map_1">
</p>
<p align="center"; style="font-size:8px">[Figure 1: formal saving around the world ]</p>
<p> &nbsp;</p>
<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/map_2.png" width="768"  title="map_2">
</p>
<p align="center"; style="font-size:8px">[Figure 2: bank account penetration around the world ]</p>
<p> &nbsp;</p>

<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/map_2.png" width="768" title="map_3">
</p>
<p align="center"; style="font-size:8px">  [Figure 3: origination of new formal loans around the world ]</p>


<p align="right"; style="font-size:8px">(*) figure 1, figure 2, figure 3 [1] </p>
<p> &nbsp;</p>


### Internet and the Rise of P2P Loans

During the last 15 years, the Internet has produced a radical shift in
terms of information and communication, setting off an accelerated
democratization process on both for the people who have access to it.

The new social technologies of the Internet have also helped to expand
the boundaries of the traditional banking system by offering novel
credit alternatives, such as peer-to-peer (“P2P”) loans. These
technologies helped the credit system to move forward on some key
points: (1) interest in modernizing the whole credit-granting process
revved up; (2) the segment of the population covered by the
internet-based credit system increased; (3) the localization issue was
mitigated, to some extent; (4) the intermediation costs were reduced,
and thus the P2P interest rates were less than most traditional bank
lending rates; and (5) the shift brought better conditions for both
lenders and borrowers in terms of evaluating a project’s
creditworthiness.

The Internet-driven shift was significant, but there are some structural
problems still to solve. First, the credit risk is generally still
assumed by the lender, and not by the P2P platform. Second, the credit
risk evaluation process, though improved, remains asymmetric. Third, the
lender has only a few management tools to manage their assets. Finally,
if the company behind the P2P platform defaults or declares bankruptcy,
the lender has limited recourse with respect to the borrower. [2]

In this context, the lender is confronted with a practically binary
scenario: its counterpart (the borrower) either meets its obligations or
does not. In other words, the risk may be too big and not diversifiable
enough for a given lender to participate in the P2P lending platform.

<p> &nbsp;</p>


## The Network:


RCN is a protocol based on smart contracts that standardizes credit
lending through blockchain technology. The protocol set some rules to
facilitates connections among several agents, each of whom interacts
with a smart contract to ultimately connect lender and borrower. The
network can connect borrowers, lenders, and other network agents all
over the world, allowing each one of them to manage the credit in their
local currencies, as long as they have Internet access.

Following, we will see the role of the different agents of the network,
then we will emphasize the role of the Cosigner and finally we will
exemplify it with a case.


### The Agents

These are the agents that are part of the network and interact with each
other through the Smart Contract:

* **The Borrower** who makes a credit request from its wallet provider.
* **The Lender** who invests by lending funds via a Credit Exchange.
* **The Wallet Provider** who generates a smart contract to: (i) specify
  the terms of the loan, (ii) receive funds from the Lenders via Credit
  Exchanges, and (iii) distribute these funds to Borrowers and other
  agents, as applicable and as specified by the terms of the smart
  contract.
* **The Scoring Agent** provides a credit score for each Borrower.
* **The Oracle** sets the price feed of the RCN Token according to the
  Wallet Provider’s local currency, which is used to determine the
  exchange rate between local currency and RCN Tokens at the time the
  loan is executed and when subsequent repayments are made.
* **The ID Verifier** verifies the Borrower's identity.
* **The Cosigner** who acts as a guarantor for Borrowers, and who may
  act as an intermediary agent between the Borrower and the local legal
  system in the event a Borrower defaults.
* **The Credit Exchange** allows the Lender’s offer to extend credit to
  match with a Borrower’s request for credit via a smart contract
  generated by the Wallet Provider.


<p>&nbsp;</p>

We can symbolize it like this:

<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/01.png" width=auto height="300">
</p>

<p align="center"; style="font-size:8px">
[Diagram: the RCN network ]
</p>
<p>&nbsp;</p>

### The Token

Although Borrowers and Lenders will likely prefer to denominate credit
transactions in a local currency, RCN Tokens will be required to
facilitate transactions among the other agents in the RCN, as further
described below. RCN Tokens will be required to access the RCN network
given that agents' fees and obligations – plus the corresponding
distribution expenses within the network – are driven by the use of
these tokens. RCN Tokens also act as an incentive to each one of its
participant agents to continue to participate in the network.

<p>&nbsp;</p>

### The Smart _"Loan"_

The _Smart Contract_ generated by the _Wallet Provider_ and executed
when matched by the _Credit Exchange_, contains the relevant credit
terms, _Borrower_ obligations, events of default, and signatures or
verifications from each of the other agents, as applicable. RCN Tokens
will facilitate interaction with the smart contract among agents within
the RCN. Each credit flow starts with the _Borrower_ who makes a credit
request. The _Borrower_ performs the request from its _Wallet Provider_,
which has already integrated to the RCN protocol, and then the
_Borrower_ waits for an approval.

**The Wallet Provider**( i.e. , any entity that wants to offer credit
services to its users via the RCN) adds information about the _Borrower_
and its credit request, generates a smart contract, and then broadcasts
it to the network. _Borrowers_ will only connect with the RCN through a
_Wallet Provider_.

An **Oracle** provides the service of informing the exchange rate
between any given currency used by a _Wallet Provider_, _Credit
Exchange_, _Borrower_, or _Lender_, and _RCN Tokens_, at any time it is
consulted. _The Oracle_ will most frequently be consulted at the time a
loan is originated, and during the credit life time in order to
determine its installments.

An **ID Verifier** identifies each _Borrower_ and verifies that he/she
is who he/she claims to be; this will prevent most fraud or scam
attempts and provide the _Borrower’s_ identification information in case
of a default.

A **Scoring Agent** then analyzes available information to statistically
evaluate the probabilities of a default linked to a certain ID. This
same _Scoring Agent_ could eventually gather the transactional
information from the RCN blockchain (which is open to anyone on day one)
to build a credit ledger and track a _Borrower’s_ instances of default
or non-default over time.

**The Cosigner** uses information provided by the _ID Verifier_ and the
_Scoring Agent_ to establish the terms under which it will operate on a
loan. The default terms, under which the cosigner takes responsibility
for the _Borrower’s_ debt, will be clearly specified in the same smart
contract. _The Cosigner_ terms will be added to the smart contract,
along with the terms provided by the _ID Verifier_ and _Scoring Agent_,
and the smart contract will be then generated and broadcasted by the
_Wallet Provider_. In the event of a default, the Cosigner acts on
behalf of the Borrower by taking responsibility for the debt amount as
specified in the smart contract. The smart contract also determines if
the Cosigner is obliged to make a unique payment to the _Lender_ or if
it will continue to bear the expense of the periodic installments under
the original conditions.

<p>&nbsp;</p>
<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/02.png" height="373" weight=271 title="diagram_2">
</p>

<p align="center"; style="font-size:8px">
  [Diagram: the Cosigned smart contract ]
</p>
<p>&nbsp;</p>

Then a **Credit Exchange** lists smart contract including the
information gathered up to this point. That is: amount, currency,
Borrower ID, Borrower credit score, co-signature insurance options, and
any other agent or Borrower input permitted.

Finally, a **Lender** that holds _RCN Tokens_ can create a trading order
through the _Credit Exchange_. When these orders match the conditions on
the cosigned smart contract, **the loan will take place and the smart
contract will execute accordingly**. The _RCN Tokens_ involved will be
transferred to the corresponding _Wallet Provider_, who will, in turn,
grant credit to the _Borrower_, upon turning the _RCN Tokens_ into local
currency.


An **RCN Directory** will lists all network agents that comply with the
good practices set by RCN and go through the onboarding process in
compliance with the RCN “Know Your Partner” (KYP) policy.


Thus as a condition to be part of this _RCN Directory_, each _Credit
Exchange_ and _Wallet Provider_ must warrant its compliance with all
applicable regulatory frameworks for the jurisdiction(s) in which these
agents offers its services, including any applicable lending laws.

<p>&nbsp;</p>


**Once the cosigned smart contract is generated**, the _Borrower_ is
bound to the _Lender_ under a payment obligation. The _Borrower_ has
committed to return the funds borrowed, plus interest, in periodic
installments or in a single installment. The _Wallet Provider_ is also
obliged to inform the due dates and installment amounts to the
_Borrower_.

The total amount of_RCN Tokens_ used in each payment will depend on the
exchange rate(s) set by the _Oracle_, which will oversee the market
conditions and inform the smart contract of exchange rates at each
particular moment of payment. The repayment of funds will flow as
follows: (i) the _Borrower_ will pay in local currency terms the amount
due to the _Wallet Provider_; (ii) _Wallet Provider_ will trade the
_Borrower’s_ payment amount for _RCN Tokens_ at the rate set by the
_Oracle_; (iii) the _Wallet Provider_ will then send the _RCN Tokens_ to
the _Lender_; and finally, (iv) the _Lender_ can decide whether to hold
the _RCN Tokens_ or trade them for another currency.

<p>&nbsp;</p>


## Importance of the Cosigner

The _Cosigner_ will act as a guarantor for _Borrowers_, and may act as
an intermediary agent between the _Borrower_ and the local legal system
in the event a _Borrower_ defaults.

The _Cosigner_ uses information from the _Identity Verifier_ and
_Scoring Agent_ to determine the terms by which the _Cosigner_ is
willing to cosign on a loan. A _Cosigner_ may group the
smart-contract-based loans in homogeneous risk portfolios in order to
diversify them. This way, the _Cosigner_ will be able to estimate and
predict an expected loss for a portfolio of similar credit rates and use
this information to assign its fee to cosign the smart-contract-based
loan and/or add credit information to the smart contract under various
conditions. The default terms, under which the cosigner takes
responsibility for the Borrower’s, will be clearly specified in the same
smart contract. These terms from the Cosigner will be added to the smart
contract, along with the terms provided by the ID Verifier and Scoring
Agent, and the smart contract will be generated and broadcast by the
Wallet Provider. In the case of a default, the Cosigner acts on behalf
of the Borrower by taking responsibility for the debt amount, according
to the insurance conditions noted on the smart contract. The smart
contract also determines if the Cosigner is obliged to make a unique
payment to the Lender or if it will continue to bear the expense of the
periodic installments under the original conditions.

**The _Cosigner_ is intended to be one of the key agents of RCN. It is
intended to act as a reinsurer that distributes and reduces the
_Lender’s_ risk and, perhaps most importantly, to also help improve the
contract conditions on the _Borrower_ side by retaining access to the
_Borrower’s_ local legal system.**

### Regular P2P Loans

In the case of a regular P2P loan, the lender doesn’t know whether the
borrower will have enough payment capacity in the future to pay off the
loan or not. If the lender gets a certain number of borrowers sharing
the same characteristics, he will learn that eventually some of them pay
off the debt and some of them don’t. In other words, in a regular P2P
loan, the lender faces a random phenomenon, statistically speaking; by
taking the exact same action in apparently similar conditions, he gets
different results.

In the following table, we have 10 borrowers that – according to a
trusted credit score assumption – each bear a 10% chance of default. The
lenders are listed in rows, the crosses represent the default events,
and the columns represent different scenarios and / or successive loans
of the same lender.

<p>&nbsp;</p>
<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/03.png" height="300" weight=auto title="03">
</p>

<p align="center"; style="font-size:8px">
[Table 1: loans scenarios ]
</p>
<p>&nbsp;</p>

As Table #1 shows, every column has 9 successful payments and 1 case of
default, which means that the 10% default assumption is correct in each
of the 10 scenarios. However, the entire loss is borne by just one
lender, who loses potentially all of the funds invested.


In the last column ( &sum; ), some lenders haven’t lost funds in any of
the 10 scenarios (lenders 2, 5, and 10) and some lost their funds in
more than one opportunity (lenders 7 and 9).

This example simply reveals one of the main problems of most P2P loans:
**the single lender cannot diversify the credit risk**. By following the
trajectory of a single lender on many scenarios (i.e. a single row on
infinite columns), we would notice that the default rate would stay at
10%, but there would still be no guarantee for the lender that the loss
would be as expected.

On an individual level, there’s very little utility in talking about the
difference between a borrower’s expected chance of default and the
lender’s expected position. What the credit system needs is an agent
with enough credit volume to use the statistics to diversify exposure
and thereby neutralize the default risk.

In order to neutralize default risks by credit diversification, the
lender’s risk on each loan should be:

- [x] **Finite** : the parameters of the event of default must be
      clearly defined.
- [x] **Accidental by nature** : the lender should not have control of
      the event of default in order to avoid manipulation and
      anti-selection.
- [x] **Measureable** : the economic value of the loss should be
      determinable. There must be enough data available in order to
      evaluate the risk with a high degree of confidence.
- [x] **Independent** : exposure units should be spatially and
      temporally separate from each other (i.e. if one lender has a
      claim, this should not affect another lender’s claim).

<p>&nbsp;</p>

### RCN: the inclusion of The Cosigner

RCN seeks to solve the risk neutralization problem by adding the figure
of the Cosigner. In order to explain the role of this agent, let’s
review scenario #2 on the previous graphic and add the cosigner:

<p>&nbsp;</p>

|        |        |
|-------:|-------:|
| loan = | mu 180 |
|   pd = |    10% |
|   pp = |  mu 18 |

```
where :
    mu = monetary units
    pd = probability of default
    pp = pure premium
```

|     #     |  loans   | pure premium | paid by borrower | paid by cosigner | received by lender |
|:---------:|:--------:|:------------:|:----------------:|:----------------:|:------------------:|
|     1     |   180    |     - 18     |       180        |        0         |        162         |
|     2     |   180    |     - 18     |       180        |        0         |        162         |
|     3     |   180    |     - 18     |       180        |        0         |        162         |
|     4     |   180    |     - 18     |       180        |        0         |        162         |
|     5     |   180    |     - 18     |       180        |        0         |        162         |
|     6     |   180    |     - 18     |        0         |       180        |        162         |
|     7     |   180    |     - 18     |       180        |        0         |        162         |
|     8     |   180    |     - 18     |       180        |        0         |        162         |
|     9     |   180    |     - 18     |       180        |        0         |        162         |
|    10     |   180    |     - 18     |       180        |        0         |        162         |
| **&sum;** | **1800** |  **- 180**   |     **1620**     |     **180**      |      **1620**      |

![equation](http://latex.codecogs.com/gif.latex?\fn_cm&space;pp&space;=&space;\sum_{i=1}^{10}&space;\frac{expected~loss_i}{amount~exposed_i})

<p align="center"; style="font-size:10px">
[Table 2: risk neutralization by the Cosigner]
</p>
<p>&nbsp;</p>


As Table #2 reveals, a default occurs regardless of the Cosigner’s
intervention, but the risk has been neutralized. The Lenders have traded
higher but uncertain profit for lower but more certain profit. The risk
and the surplus are transferred to the Cosigner, who collects a
predefined premium to guarantee the loan. Let’s review a second example,
where the Cosigner undertakes a smaller part of the obligation. In this
case, the Cosigner stands for the 60%:

<p>&nbsp;</p>

|           |        |
|----------:|-------:|
|    loan = | mu 180 |
|      pd = |    10% |
|      pp = | mu 7.2 |
| % cosig = |    40% |

```
where :
    cosig: % of risk retained by cosigner
```

|     #     |  loans   | pure premium | paid by borrower | paid by cosigner | received by lender |
|:---------:|:--------:|:------------:|:----------------:|:----------------:|:------------------:|
|     1     |   180    |    - 7.2     |       180        |        0         |       172.8        |
|     2     |   180    |    - 7.2     |       180        |        0         |       172.8        |
|     3     |   180    |    - 7.2     |       180        |        0         |       172.8        |
|     4     |   180    |    - 7.2     |       180        |        0         |       172.8        |
|     5     |   180    |    - 7.2     |       180        |        0         |       172.8        |
|     6     |   180    |    - 7.2     |        0         |        72        |        64.8        |
|     7     |   180    |    - 7.2     |       180        |        0         |       172.8        |
|     8     |   180    |    - 7.2     |       180        |        0         |       172.8        |
|     9     |   180    |    - 7.2     |       180        |        0         |       172.8        |
|    10     |   180    |    - 7.2     |       180        |        0         |       172.8        |
| **&sum;** | **1800** |  **- 72.0**  |     **1620**     |      **72**      |     **1620.0**     |


<p align="center"; style="font-size:10px">
[Table 3 : risk neutralization by the Cosigner (with lower premium) ]
</p>
<p>&nbsp;</p>

As we can see on Table #3, the Lender will lose a larger amount of his
investment in the case of a default, but his profit will be higher if
there’s no default event. In other words, the risk transferred to the
Cosigner is smaller, but the cost (pure premium) is lower on the Lender
side. In fact, there can (and will) be more complex scenarios. The
Cosigner will evaluate his participation on the loss and ponder that
participation when iterating and estimating his pure premium when he
undertakes his next responsibility.

<p>&nbsp;</p>

```
Pure Premium (PP) estimation by the Cosigner:
```

![equation](http://latex.codecogs.com/gif.latex?\fn_cm&space;PP&space;=&space;Frequency&space;*&space;Severity&space;*&space;(&space;1-&space;LER&space;))

<p>&nbsp;</p>


```
Loss Elimination Ratio (LER) :
```

![equation](http://latex.codecogs.com/gif.latex?\fn_cm&space;LER&space;=&space;\frac{amount~of~lossess~eliminated}{total~amount~of~losses})

<p>&nbsp;</p>


The previous examples are simplified to explain the role of the Cosigner
agent in basic terms. In practice, the loan amount ("_amount exposed"_)
will be quite different, and, in the case of a default, the Borrower may
have already paid a few installments, so the debt for which the Cosigner
is responsible would be just a proportion of the initial amount
(_referred to as “EAD,” or exposure at default_).

In the RCN, we intend for the Cosigner to be able to manage the debt as
a local agent in the Borrower’s country of residence, which enables
robust opportunities for collection that may consist of:

1. **Contacting the Borrower** via email, sms, phone, social media, or
   any other means, to inform the Borrower of the default amount now
   due.
2. **Offering a repayment reschedule plan**. The Cosigner might
   incentivize the Borrower to make repayments ( i.e. , by agreeing to
   not report the Borrower’s default to a credit bureau) if a new
   payment schedule is accepted and the repayments are made on time.
3. **Reporting the debt to the local credit bureau** (such as
   Equifax/Veraz in Argentina and Peru, CIFIN in Colombia, etc). This
   report enables local collection agencies to intervene.
4. **Taking legal action**. If the Borrower ignores alternate means of
   contact, the Cosigner could send a demand letter, noting an intention
   to proceed with legal action. If this demand letter meets no
   response, legal action or a collection process can be initiated.


Collection strategies, as described above, usually result in recovery
curves such as the following:

<p>&nbsp;</p>
<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/plot1.png" height="300" weight=auto title="03">
</p>

<p align="center"; style="font-size:8px">
[Chart 1: loss given default vs. recovery rate]
</p>
<p>&nbsp;</p>


The inclusion of a Cosigner can substantially reduce the loss in the
whole network – not just the loss attributed to the Cosigner himself (
_referred to as loss given default, or “LGD”_ [6] ) – but also the loss
sustained by the Lender.

Consequently, the Cosigner should then be able to estimate a pure
premium, just like the traditional banking system does to predict a loss
(_“EL,” or expected loss_):

<p>&nbsp;</p>

```
Expacted Loss (EL) :
```

![equation](http://latex.codecogs.com/gif.latex?\fn_cm&space;PP&space;=&space;EL)

![equation](http://latex.codecogs.com/gif.latex?\fn_cm&space;PP&space;=&space;EL&space;=&space;PD&space;*&space;EAD&space;*&space;LGD&space;*&space;Amount&space;Exposed)

<p>&nbsp;</p>


Furthermore, the Cosigner likely has more capacity than the Lender to
undertake any estimation deviation. The Cosigner can use his know-how to
estimate the score that will be included in the smart contract and
assesses an estimated loss beforehand (that may or may not be exactly
the same in the future). This is why the Cosigner adds a statistic
safety margin ( risk charge ) in order to cover unfavorable / unexpected
scenarios; the more homogenous the risk, the lower the margin.


Finally, the Cosigner should be able to add an amount over the pure
premium to cover his expenses and a desired profit. As such, we can
rethink the Cosigner premium this way:

<p>&nbsp;</p>

```
Cosigner full premium components :
```

![equation](http://latex.codecogs.com/gif.latex?\fn_cm&space;premium&space;=&space;pure~premium&space;&plus;&space;risk~charge&space;&plus;&space;expense~of~doing~bussines&plus;profit&space;})

<p>&nbsp;</p>


This formula explains how the Cosigner collects his premium and reveals
the components that factor into the premium. The same formula also works
to reveal how the Cosigner might (i) deal with future default events in
unexpected or worse scenarios, (ii) undertake the expenses of his work,
and (iii) leave a profit margin to participate in the RCN.

Summing up graphically:

<p> &nbsp;</p>
<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/04.png" height="214.9"  width="auto">
</p>
<p> &nbsp;</p>
<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/05.png" height="290.5"  width="auto" >
</p>

<p align="center"; style="font-size:10px">
[Diagram 2: a P2P loan with Cosigner]
</p>
<p>&nbsp;</p>

<p> &nbsp;</p>

## The Vision of an RCN Use Case

**_Pedro, a student from Rio de Janeiro, wants to buy a car_** so he can more
easily go from his workplace in Leblon to the Federal University of Rio
de Janeiro in Maracaña, where he studies. Pedro requests a loan from
his Wallet Provider for BRL 9,799 (USD $2,978). The Wallet Provider
generates, fills, and signs a smart contract with an amount request in
RCN equivalent to BRL 9,799 and broadcasts it to the network, including
terms such as the interest rate and the number of installment payments
Pedro will make. The smart contract is then completed with data from the
ID Verifier, Scoring Agent, and Cosigner.

**_Wang, a Juneyao Airlines employee from Shanghai, has CNY 20,000 (USD
$2,996) in savings_**, and he is not planning to spend these funds for
awhile. He decides to invest that money in a P2P loan, so he makes an
order with a few requirements (interest rate, due date, etc.) via a
Credit Exchange.

**_The smart contract is then settled in RCN_**, however, the value of
settlement is represented in US dollars (“USD”) in accordance with the
data supplied by the Oracle. The equivalent to USD $0.85 in RCN goes to
the ID Verifier, USD $1.10 in RCN goes to the Scoring Agent, USD $111.69
in RCN goes to the Cosigner, and USD $2,978 in RCN are transferred to
Pedro’s Wallet Provider. Then, the Wallet Provider trades those RCN for
the amount in BRL that Pedro requested as a loan to buy his car.

Pedro is now committed to return a debt of USD $2,979.95 in 24 monthly
installments of USD $136.14. Thus, Pedro agrees to return an amount that
includes the commissions of the ID-Verifier and the Score Provider and
Wang pays the Cosigner fee. The internal rate of return for Wang is
slightly lower than 9% and the interest rate paid by Pedro is slightly
higher than 9%.

<p> &nbsp;</p>

<p align="center">
  <img src="https://github.com/c0chi/rcn-network/blob/master/images/06.png" width="768" height="auto" >
</p>

<p align="center"; style="font-size:10px">
[Diagram 3: RCN use case]
</p>
<p>&nbsp;</p>




**Summing Up :**

**ID Verifiers get RCN Tokens in exchange for verifying the
Borrower’s identity. Scoring Agents receive RCN Tokens in exchange for
providing data related to, and rating, the Borrower’s creditworthiness.
Cosigners collect a premium in RCN Tokens in exchange for cosigning the
smart contract along with the Borrowers. When a Lender agrees to the
smart contract listed on the Credit Exchange, RCN Tokens that have, per
the Oracle, a corresponding funds value in a specified currency in the
amount of the loan, are sent from the Credit Exchange to the Wallet
Provider through the smart contract. Finally, the Wallet Provider trades
RCN Tokens for the Borrower’s local currency and provides the Borrower
with the funds accordingly.**
<p> &nbsp;</p>

<p> &nbsp;</p>

## Conclusion

The importance of the credit system as one of society’s most
accomplished collaborative efforts is unquestionable. Most great ideas
would have never seen the light without sharing funds from different
people.

In this line, the longstanding contribution of traditional banks in the
worldwide economy must be acknowledged. However, due to traditional
banks’ credit selectiveness, renowned bureaucracy, and high-brokerage
costs, the question now presented is whether this system can be
improved.

In recent years, new credit and lending alternatives have emerged based
on the Internet and P2P technologies. These alternative solutions
improve most traditional banking services by covering a larger segment
of the population and offering new project viabilities. Still, they
present a structural problem in that it remains difficult for a lender
to have a diversified portfolio in order to mitigate default risks.

**RCN** aims to strengthen the solution provided by most P2P platforms
and magnify its potential. Based on the Ethereum blockchain’s ERC20
protocol, **RCN** connects borrowers, lenders, and cosigning
agents. The cosigning agent undertakes insuring a sufficient volume of
credit transactions to predict its own return on investment, to manage
the debt, and to collect the funds in case of borrower default.

**RCN** sets the stage for a decentralized, trustworthy, predictable,
and more efficient P2P global credit network that can make it possible
for many ideas and projects all over the world come to fruition.


## References


1. A. Demirguc-Kunt, L. Klapper, D. Singer, P. Van Oudheusden. Measuring
   Financial Inclusion around the World. The World Bank,2014. [Online].
   Available:
   http://documents.worldbank.org/curated/en/187761468179367706/pdf/WPS7255.pdf

2. Global speculative-grade default rate up slightly in January; energy
   woes continue to abate. Moody’s, 2017. [Online]. Available:
   https://www.moodys.com/research/Moodys-Global-speculative-grade-default-rate-up-slightly-in-January--PR_361939

3. A. Chaia, A. Dalal, T. Goland, M.J. Gonzalez, J. Morduch, R. Schiff.
   Half the World is Unbanked. Financial Access Initiative, 2009.
   [Online]. Available:
   http://mckinseyonsociety.com/downloads/reports/Economic-Development/Half_the_world_is_unbanked.pdf

4. Funding change. Interbrand, 2017. [Online]. Available:
   http://interbrand.com/best-brands/interbrand-breakthrough-brands/2017/sector-overviews/funding-change

5. BitPagos uses the blockchain to enable credit for online payments in
   emerging markets. TechCrunch, 2016. [Online]. Available:
   https://techcrunch.com/2016/05/10/bitpagos-uses-the-blockchain-to-enable-credit-for-online-payments-in-emerging-markets

6. Loss given default. Shareholders Information Report. BBVA, 2013.
   [Online]. Available:
   http://shareholdersandinvestors.bbva.com/TLBB/micros/bbvain2013/en/R/c3.html


## Git References

1. [**README** ](/README.md): **_This document !_**
   * It contains the context of the project and raises the problem of
     the current system.
   * An example is used to illustrate the problem and think about the
     solution
   * RCN emerges as a possible solution. Its main agents and their
     interaction are described.
   * It shows the operation of the network with a use case.

2. [**Technical Guidelines** ](/Technical_Guidelines.md):

   * It contains the general guidelines of the project and its status.
   * Provides a explanation of the main smart contracts that will be
     developed and their purposes
   * Inform the Ethereum address for those already deployed

3. [**Technical Documentation**](/Technical_Documentation.md)

   * Describe in detail each of the developed contracts and expose your
     Ethereum address and how to use them
   * Describe the correct use of the RCN SDK for easy integration into
     the network


## About us


 *  <p> David García : Partner & SVP at RCN
      <a href="https://www.linkedin.com/in/gdavideh/">
      <img src="https://github.com/c0chi/rcn-network/blob/master/images/linkedin.svg" width=auto height="18"></a>
    </p>

 *  <p> Eugenio Cocimano : Actuary Data Scientist
      <a href="https://www.linkedin.com/in/eugeniococimano/">
      <img src="https://github.com/c0chi/rcn-network/blob/master/images/linkedin.svg" width=auto height="18"></a>
    </p>

 *  <p> Agustín Aguilar : Smart contracts developer
      <a href="https://www.linkedin.com/in/agustin-esteban-aguilar-57637047/">
      <img src="https://github.com/c0chi/rcn-network/blob/master/images/linkedin.svg" width=auto height="18"></a>
    </p>

 *  <p> Nicolás Collebechi: Head of Marketing
      <a href="https://www.linkedin.com/in/ncollebechi/">
      <img src="https://github.com/c0chi/rcn-network/blob/master/images/linkedin.svg" width=auto height="18"></a>
    </p>


