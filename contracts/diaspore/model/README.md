# <img src="https://github.com/ripio/rcn-network/tree/diaspore_doc/images/logo_simple.png" width=auto height="28"> RCN


## Intro

The objective of this document is to provide cases that exemplify the
logic of credit contracts.

First, it shows how the credit amortization schedule is defined based on
the conditions agreed between Lender and Borrower at the time of the
creation of the contract.

Then, different examples ordered by complexity show how the original
conditions are modified by the flow of payments made by the Borrower.

In order to simplify, the different payment flows are shown on the same
fixed installment contract.

Then, later, examples of credits with other conditions are shown.

<br />

## Examples

In these examples it is used the following notation:

Loan table:
* *'t'* : time. Is the number of installment or period
* *'date_t'* : due date of installment *'t'* (mm-dd-yyyy)
* *'Int_t'* : interest amount of installment 't'
* *'Amort_t'* : amortization or principal amount of installment 't'
* *'FixP_t'* : fix payment 't'
* *'IB_t'* : outstanding balance (or principal) after each of those
  payments is made
* *'FB_t'* : final outstanding balance (or principal) after each of
  those payments is made

Payments table:
* *n_paym* : number of payment made (*'t'*)
* *date* : date of payment
* *n_inst_paid* : number of installment paid with a payment
* *Int_real_t*: amount paid on payment 't' imputed to financial interest
* *Amort_real_t*: amount paid on payment 't' imputed to principal
* *IM_real_t*: amount paid on payment 't' imputed to financial interest
* *Total_real_t*: total amount paid on payment 't'

User actions:
* *pay ( am, dt )* : payment of amount *'am'* realized the date *'dt'*

<br />


### Base Example

#### Loans details


These are the conditions agreed between the Borrower and the Lender at
the time of loan origination.

* Amount of loan: 10000
* First payment date: 02-24-2018
* Payment frequency: 30 days
* Loan term: 12
* Interest rate: 35.00%
* Punitory Interest rate: 52.50%

<br />


Amortization schedule:

| t  |  date_t  |    IB_t |  Int_t | Amort_t | FixP_t |    FB_t |
|:--:|:--------:|--------:|-------:|--------:|-------:|--------:|
| 0  | 1/25/18  |       0 |      0 |       0 |      0 |   10000 |
| 1  | 2/24/18  |   10000 | 291.67 |  707.97 | 999.63 | 9292.03 |
| 2  | 3/26/18  | 9292.03 | 271.02 |  728.61 | 999.63 | 8563.42 |
| 3  | 4/25/18  | 8563.42 | 249.77 |  749.87 | 999.63 | 7813.56 |
| 4  | 5/25/18  | 7813.56 |  227.9 |  771.74 | 999.63 | 7041.82 |
| 5  | 6/24/18  | 7041.82 | 205.39 |  794.25 | 999.63 | 6247.57 |
| 6  | 7/24/18  | 6247.57 | 182.22 |  817.41 | 999.63 | 5430.16 |
| 7  | 8/23/18  | 5430.16 | 158.38 |  841.25 | 999.63 | 4588.91 |
| 8  | 9/22/18  | 4588.91 | 133.84 |  865.79 | 999.63 | 3723.12 |
| 9  | 10/22/18 | 3723.12 | 108.59 |  891.04 | 999.63 | 2832.08 |
| 10 | 11/21/18 | 2832.08 |   82.6 |  917.03 | 999.63 | 1915.05 |
| 11 | 12/21/18 | 1915.05 |  55.86 |  943.78 | 999.63 |  971.27 |
| 12 | 1/20/19  |  971.27 |  28.33 |   971.3 | 999.63 |       0 |
<br />


#### Example 1

Some payments are made a few days before their due date.

Payment Flow:

1. pay(999.63 , 02/24/18)
2. pay(999.63 , 03/26/18)
3. pay(999.63 , 04/25/18) (*)
4. pay(999.63 , 05/20/18)
5. pay(999.63 , 06/24/18)
6. pay(999.63 , 07/24/18)
7. pay(999.63 , 08/13/18) (*)
8. pay(999.63 , 09/22/18)
9. pay(999.63 , 10/19/18) (*)
10. pay(999.63 , 11/21/18)
11. pay(999.63 , 12/21/18)
12. pay(999.63 , 01/01/19)

<br />


This is how the payments are imputed. It is possible to see that there
is no difference with respect to the original schedule.

| n_paym |    date    | n_inst_paid | Total_real_t | PInt_real_t | Int_real_t | Amort_real_t |
|:------:|:----------:|:-----------:|-------------:|------------:|-----------:|-------------:|
|   1    | 2/24/2018  |      1      |       999.63 |           0 |     291.67 |       707.96 |
|   2    | 3/26/2018  |      2      |       999.63 |           0 |     271.02 |       728.61 |
|   3    | 4/25/2018  |      3      |       999.63 |           0 |     249.77 |       749.86 |
|   4    | 5/20/2018  |      4      |       999.63 |           0 |      227.9 |       771.73 |
|   5    | 6/24/2018  |      5      |       999.63 |           0 |     205.39 |       794.24 |
|   6    | 7/24/2018  |      6      |       999.63 |           0 |     182.22 |       817.41 |
|   7    | 8/13/2018  |      7      |       999.63 |           0 |     158.38 |       841.25 |
|   8    | 9/22/2018  |      8      |       999.63 |           0 |     133.84 |       865.79 |
|   9    | 10/19/2018 |      9      |       999.63 |           0 |     108.59 |       891.04 |
|   10   | 11/21/2018 |     10      |       999.63 |           0 |       82.6 |       917.03 |
|   11   | 12/21/2018 |     11      |       999.63 |           0 |      55.86 |       943.77 |
|   12   |  1/1/2019  |     12      |       999.63 |           0 |      28.33 |        971.3 |
<br />


The following chart shows the evolution of the debt balance after the
expiration of each installment:

![1_plot.png](images/1_plot.png)

<br />

Loan status to date 1/20/2019.

| Loan Status                   |         |
|:------------------------------|--------:|
| To date                       | 1/20/19 |
| Status                        | Paid    |
| Last installment totally paid | 12      |
| Actual debt                   | 0       |
| Payments realized             | 12      |
| Total punitory paid           | 72.89   |
| Total interest paid           | 1995.57 |
| Total amortized               | 9999.99 |

<br />




#### Example 2

Some payments are made with arrears less than 30 days.


Payment Flow:

1. pay(999.63 , 02/24/18)
2. pay(999.63 , 03/26/18)
3. pay(999.63 , 04/25/18)
4. pay(999.63 , 05/20/18)
5. pay(999.63 , 07/14/18) (*)
6. pay(999.63 , 07/29/18) (*)
7. pay(999.63 , 08/13/18)
8. pay(999.63 , 09/22/18)
9. pay(999.63 , 11/16/18) (*)
10. pay(999.63 , 11/21/18)
11. pay(999.63 , 12/21/18)
12. pay(999.63 , 01/01/19)

<br />


This is how the payments are imputed. The original schedule has changed.

| n_paym |   date   | n_inst_paid | Total_real_t | IM_real_t | Int_real_t | Amort_real_t |
|:-------|:---------|:------------|:-------------|:----------|:-----------|:-------------|
| 1      | 2/24/18  | 1           | 999.63       | 0         | 291.67     | 707.96       |
| 2      | 3/26/18  | 2           | 999.63       | 0         | 271.02     | 728.61       |
| 3      | 4/25/18  | 3           | 999.63       | 0         | 249.77     | 749.86       |
| 4      | 5/25/18  | 4           | 999.63       | 0         | 227.9      | 771.73       |
| 5      | 7/14/18  | 5           | 1028.79      | 29.16     | 205.39     | 794.24       |
| 6      | 7/29/18  | 6           | 1006.92      | 7.29      | 182.22     | 817.41       |
| 7      | 8/23/18  | 7           | 999.63       | 0         | 158.38     | 841.25       |
| 8      | 9/22/18  | 8           | 999.63       | 0         | 133.84     | 865.79       |
| 9      | 11/16/18 | 9           | 1036.07      | 36.44     | 108.59     | 891.04       |
| 10     | 11/21/18 | 10          | 999.63       | 0         | 82.6       | 917.03       |
| 11     | 12/21/18 | 11          | 999.63       | 0         | 55.86      | 943.77       |
| 12     | 1/20/19  | 12          | 999.63       | 0         | 28.33      | 971.3        |
<br />


The following chart shows the evolution of the debt balance after the
expiration of each installment:

![2_plot.png](images/2_plot.png)

<br />
Loan status to date 1/20/2019.

| Loan Status                   |         |
|:------------------------------|--------:|
|                               |         |
| To date                       | 1/20/19 |
| Status                        | Paid    |
| Last installment totally paid | 12      |
| Actual debt                   | 0       |
| Payments realized             | 12      |
| Total punitory paid           | 72.89   |
| Total interest paid           | 1995.57 |
| Total amortized               | 9999.99 |


<br />

#### Example 3

Case of default with no payments. The portion interest and principal
were recalculated up to '04/20/2019'.

| t  | due_t       | PInt_t | Int_rec_t | Amort_rec_t | FP_rec_t |
|:---|:------------|:-------|:----------|:------------|:---------|
| 0  | 25-Jan-2018 | 0      | 0         | 0           | 0        |
| 1  | 24-Feb-2018 | 612.27 | 291.67    | 707.97      | 1611.91  |
| 2  | 26-Mar-2018 | 568.54 | 271.02    | 728.61      | 1568.17  |
| 3  | 25-Apr-2018 | 524.81 | 249.77    | 749.87      | 1524.44  |
| 4  | 25-May-2018 | 481.07 | 227.9     | 771.74      | 1480.7   |
| 5  | 24-Jun-2018 | 437.34 | 205.39    | 794.25      | 1436.97  |
| 6  | 24-Jul-2018 | 393.61 | 182.22    | 817.41      | 1393.24  |
| 7  | 23-Aug-2018 | 349.87 | 158.38    | 841.25      | 1349.5   |
| 8  | 22-Sep-2018 | 306.14 | 133.84    | 865.79      | 1305.77  |
| 9  | 22-Oct-2018 | 262.4  | 108.59    | 891.04      | 1262.04  |
| 10 | 21-Nov-2018 | 218.67 | 82.6      | 917.03      | 1218.3   |
| 11 | 21-Dec-2018 | 174.94 | 55.86     | 943.78      | 1174.57  |
| 12 | 20-Jan-2019 | 131.2  | 28.33     | 971.3       | 1130.83  |
<br />


The following chart shows the evolution of the debt balance even after
the expiration of the contract:

![3_plot.png](images/3_plot.png)

<br />
Loan status to date 4/20/2019.

| Loan Status                   |         |
|:------------------------------|--------:|
| To date                       | 4/20/19  |
| Status                        | Pending  |
| Last installment totally paid | 0        |
| Actual debt                   | 16456.44 |
| Payments realized             | 0        |
| Total punitory paid           | 0        |
| Total interest paid           | 0        |
| Total amortized               | 0        |

<br />


#### Example 4

Case of default with some payments. The portion interest and principal
were recalculated up to '04/20/2019'.

Payment Flow:

1. pay(999.63 , 02/24/18)
2. pay(999.63 , 03/26/18)
3. pay(999.63 , 04/25/18)

<br />

| t  |    due_t    | PInt_t | Int_rec_t | Amort_rec_t | FP_rec_t |
|:--:|:-----------:|-------:|----------:|------------:|---------:|
| 0  | 25-01-2018 | 0      | 0         | 0           | 0        |
| 1  | 24-02-2018 | 0      | 0         | 0           | 0        |
| 2  | 26-03-2018 | 0      | 0         | 0           | 0        |
| 3  | 25-04-2018 | 0      | 0         | 0           | 0        |
| 4  | 25-05-2018 | 481.07 | 227.9     | 771.74      | 1480.7   |
| 5  | 24-06-2018 | 437.34 | 205.39    | 794.25      | 1436.97  |
| 6  | 24-07-2018 | 393.61 | 182.22    | 817.41      | 1393.24  |
| 7  | 23-08-2018 | 349.87 | 158.38    | 841.25      | 1349.5   |
| 8  | 22-09-2018 | 306.14 | 133.84    | 865.79      | 1305.77  |
| 9  | 22-10-2018 | 262.4  | 108.59    | 891.04      | 1262.04  |
| 10 | 21-11-2018 | 218.67 | 82.6      | 917.03      | 1218.3   |
| 11 | 21-12-2018 | 174.94 | 55.86     | 943.78      | 1174.57  |
| 12 | 20-01-2019 | 131.2  | 28.33     | 971.3       | 1130.83  |
<br />


The following chart shows the evolution of the debt balance even after
the expiration of the contract:

![4_plot.png](images/4_plot.png)

<br />

Loan status to date 4/20/2019.

| Loan Status                   |          |
|:------------------------------|---------:|
| To date                       | 4/20/19  |
| Status                        | Pending  |
| Last installment totally paid | 3        |
| Actual debt                   | 11751.92 |
| Payments realized             | 3        |
| Total punitory paid           | 0        |
| Total interest paid           | 812.46   |
| Total amortized               | 2186.43  |

<br />


#### Example 5

A more complex example with more than one payment for the same
installment, some after the due date.

Payment Flow:

1. pay(200.00 , 03/01/18) (*)
2. pay(300.00 , 03/11/18) (*)
3. pay(523.98 , 03/18/18) (*)
4. pay(999.63 , 03/26/18) (*)
5. pay(1500.00 , 04/25/18) (*)
6. pay(502.90 , 05/30/18) (*)
7. pay(999.63 , 06/24/18)
8. pay(999.63 , 07/24/18)
9. pay(999.63 , 08/23/18)
10. pay(999.63 , 09/22/18)
11. pay(999.63 , 10/22/18)
12. pay(999.63 , 11/21/18)
13. pay(999.63 , 12/21/18)
14. pay(999.63 , 01/01/19)

<br />


The following table shows how the imputation of payments changes
depending on the amount and the date of payment.

| n_paym |    date    | n_inst_paid | Total_real_t | PInt_real_t | Int_real_t | Amort_real_t |
|:------:|:----------:|:-----------:|-------------:|------------:|-----------:|-------------:|
| 1      | 1-03-2018  | 1           | 200          | 7.29        | 192.71     | 0            |
| 2      | 11-03-2018 | 1           | 300          | 11.77       | 98.96      | 189.28       |
| 3      | 18-03-2018 | 1           | 523.98       | 5.29        | 0          | 518.69       |
| 4      | 26-03-2018 | 2           | 999.63       | 0           | 271.02     | 728.61       |
| 5      | 25-04-2018 | 3           | 1500         | 0           | 249.77     | 749.87       |
| 5      | 25-04-2018 | 4           | 1500         | 0           | 227.9      | 272.47       |
| 6      | 30-05-2018 | 4           | 502.9        | 3.64        | 0          | 499.26       |
| 7      | 24-06-2018 | 5           | 999.63       | 0           | 205.39     | 794.24       |
| 8      | 24-07-2018 | 6           | 999.63       | 0           | 182.22     | 817.41       |
| 9      | 23-08-2018 | 7           | 999.63       | 0           | 158.38     | 841.25       |
| 10     | 22-09-2018 | 8           | 999.63       | 0           | 133.84     | 865.79       |
| 11     | 22-10-2018 | 9           | 999.63       | 0           | 108.59     | 891.04       |
| 12     | 21-11-2018 | 10          | 999.63       | 0           | 82.6       | 917.03       |
| 13     | 21-12-2018 | 11          | 999.63       | 0           | 55.86      | 943.77       |
| 14     | 1-01-2019  | 12          | 999.63       | 0           | 28.33      | 971.3        |
<br />


The following chart shows the evolution of the debt balance:

![5_plot.png](images/5_plot.png)

<br />

Loan status to date 1/20/2019.

| Loan Status                   |          |
|:------------------------------|---------:|
| To date                       | 1/20/19  |
| Status                        | Paid     |
| Last installment totally paid | 12       |
| Actual debt                   | 0        |
| Payments realized             | 14       |
| Total punitory paid           | 27.99    |
| Total interest paid           | 1995.57  |
| Total amortized               | 10000.01 |

<br />



#### Example 6

Another complex case with regular, anticipated, delayed, total and
partial payments.

Payment Flow:

1. pay(999.63 , 02/24/18)
2. pay(999.63 , 03/26/18)
3. pay(999.63 , 04/25/18)
4. pay(1017.12 , 06/06/18) (*)
5. pay(2500.00 , 08/25/18) (*)
6. pay(1671.72 , 09/25/18) (*)
7. pay(999.63 , 10/22/18)
8. pay(999.63 , 11/11/18) (*)
9. pay(999.63 , 12/21/18)
10. pay(999.63 ,01/20/19)

<br />


The following table shows how the imputation of payments changes
depending on the amount and the date of payment.

| n_paym |    date     | n_inst_paid | Total_real_t | PInt_real_t | Int_real_t | Amort_real_t |
|:------:|:-----------:|:-----------:|-------------:|------------:|-----------:|-------------:|
| 1      | 24-02-2018 | 1           | 999.63       | 0           | 291.67     | 707.96       |
| 2      | 26-03-2018 | 2           | 999.63       | 0           | 271.02     | 728.61       |
| 3      | 25-04-2018 | 3           | 999.63       | 0           | 249.77     | 749.86       |
| 4      | 6-06-2018  | 4           | 1017.12      | 17.49       | 227.9      | 771.73       |
| 5      | 25-08-2018 | 5           | 2500         | 90.38       | 205.39     | 794.25       |
| 5      | 25-08-2018 | 6           | 2500         | 46.65       | 182.22     | 817.41       |
| 5      | 25-08-2018 | 7           | 2500         | 2.92        | 158.38     | 202.41       |
| 6      | 25-09-2018 | 7           | 1671.72      | 28.88       | 0          | 638.84       |
| 6      | 25-09-2018 | 8           | 1671.72      | 4.37        | 133.84     | 865.78       |
| 7      | 22-10-2018 | 9           | 999.63       | 0           | 108.59     | 891.04       |
| 8      | 11-11-2018 | 10          | 999.63       | 0           | 82.6       | 917.03       |
| 9      | 21-12-2018 | 11          | 999.63       | 0           | 55.86      | 943.77       |
| 10     | 20-01-2019 | 12          | 999.63       | 0           | 28.33      | 971.3        |
<br />


The following chart shows the evolution of the debt balance:

![6_plot.png](images/6_plot.png)

<br />

Loan status to date 1/20/2019.

| Loan Status                   |          |
|:------------------------------|---------:|
| To date                       | 1/20/19 |
| Status                        | Paid    |
| Last installment totally paid | 12      |
| Actual debt                   | 0.02    |
| Payments realized             | 10      |
| Total punitory paid           | 190.69  |
| Total interest paid           | 1995.57 |
| Total amortized               | 9999.99 |


<br />


### Diferent Examples

##### Example 7

Loans details:

* Amount of loan: 67000
* First payment date: 05-03-2019
* Payment frequency: 30 days
* Loan term: 6
* Interest rate: 23.00%
* Punitory Interest rate: 34.50%

<br />


Amortization schedule:



| t |   due_t    |     IB_t |   Int_t |  Amort_t |   FixP_t |     FB_t |
|:-:|:----------:|---------:|--------:|---------:|---------:|---------:|
| 0 | 5-Mar-2019 |        0 |       0 |        0 |        0 |    67000 |
| 1 | 4-Apr-2019 |    67000 | 1284.17 | 10643.46 | 11927.63 | 56356.54 |
| 2 | 4-May-2019 | 56356.54 | 1080.17 | 10847.46 | 11927.63 | 45509.08 |
| 3 | 3-Jun-2019 | 45509.08 |  872.26 | 11055.37 | 11927.63 | 34453.71 |
| 4 | 3-Jul-2019 | 34453.71 |  660.36 | 11267.26 | 11927.63 | 23186.45 |
| 5 | 2-Aug-2019 | 23186.45 |  444.41 | 11483.22 | 11927.63 | 11703.23 |
| 6 | 1-Sep-2019 | 11703.23 |  224.31 | 11703.31 | 11927.63 |        0 |

<br />


Payment Flow:

1. pay(11927.63 ,04/04/19)
2. pay(11927.63 ,05/04/19)
3. pay(23855.25 ,07/03/19) (*)
4. pay(12280.40 ,08/02/19) (*)
5. pay(11927.63 ,09/01/19)

<br />

Evolution of the debt balance:

![7_plot.png](images/7_plot.png)

<br />

Loan status to date 9/1/2019.

| Loan Status                   |          |
|:------------------------------|---------:|
| To date                       | 9/1/2019 |
| Status                        | Paid     |
| Last installment totally paid | 6        |
| Actual debt                   | 0        |
| Payments realized             | 5        |
| Total punitory paid           | 352.78   |
| Total interest paid           | 4565.68  |
| Total amortized               | 67000.00 |

<br />


#### Example 8

Loans details:

NanoLoan - TODO


<br />

#### Example 9

Loans details:

With payments after a long time without - TODO

<br />


#### Example 10

Loans details:

Another delta time between installments - TODO

<br />
