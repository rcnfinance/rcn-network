const Collateral = artifacts.require('Collateral');
const TestModel = artifacts.require('TestModel');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestRateOracle = artifacts.require('TestRateOracle');
const CollateralDebtPayer = artifacts.require('CollateralDebtPayer');
const TestCollateralAuction = artifacts.require('TestCollateralAuction');
const TestCollateralHandler = artifacts.require('TestCollateralHandler');

const {
    expect,
    bn,
    tryCatchRevert,
    address0x,
    toBytes32,
    balanceSnap,
    searchEvent,
} = require('../Helper.js');

function e (number) {
    return bn(number).mul(bn(10).pow(bn(18)));
}

function ratio (num) {
    return bn(num).mul(bn(2).pow(bn(32))).div(bn(100));
}

const MAX_UINT64 = bn(2).pow(bn(64)).sub(bn(1));

contract('Test Collateral cosigner Diaspore Alt', function ([_, stub, owner, user, anotherUser, burner]) {
    let rcn;
    let debtEngine;
    let loanManager;
    let model;
    let collateral;
    let debtPayer;
    let auction;

    async function withFee (amount) {
        return amount.add(await toFee(amount));
    }

    async function toFee (amount) {
        const feePerc = await debtEngine.fee();
        const BASE = await debtEngine.BASE();

        return amount.mul(feePerc).div(BASE);
    }

    function toTotal (amount, perc) {
        return amount.mul(perc).div(bn(10000));
    }

    beforeEach(async () => {
        rcn = await TestToken.new({ from: owner });
        debtEngine = await DebtEngine.new(rcn.address, burner, 100, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        auction = await TestCollateralAuction.new(rcn.address, { from: owner });
        collateral = await Collateral.new(loanManager.address, auction.address, { from: owner });
        await auction.transferOwnership(collateral.address, { from: owner });
        debtPayer = await CollateralDebtPayer.new();
    });
    describe('Metadata', () => {
        it('Should update the URL', async () => {
            expect(await collateral.url()).to.be.equal('');

            await collateral.setUrl('https://api.rcn.loans/', { from: owner });
            expect(await collateral.url()).to.be.equal('https://api.rcn.loans/');
        });
        it('Should return contant zero cost', async () => {
            expect(await collateral.cost(user, 0, [], [])).to.eq.BN(bn(0));
        });
        it('Entries length should start at one', async () => {
            expect(await collateral.getEntriesLength()).to.eq.BN(bn(1));
        });
    });
    describe('Request collateral', () => {
        it('Should request a loan with collateral', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                bn(2000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(130),       // Balance ratio
                {
                    from: user,
                }
            );

            // Inspect entry
            const entry = await collateral.entries(bn(1));
            expect(entry.oracle).to.be.equal(address0x);
            expect(entry.token).to.be.equal(rcn.address);
            expect(entry.debtId).to.be.equal(debtId);
            expect(entry.amount).to.eq.BN(bn(2500));
            expect(entry.liquidationRatio).to.eq.BN(ratio(120));
            expect(entry.balanceRatio).to.eq.BN(ratio(130));

            // Inspect balances
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(2500));

            // Inspect ERC721 ownership
            expect(await collateral.balanceOf(user)).to.eq.BN(bn(1));
            expect(await collateral.ownerOf(bn(1))).to.be.equal(user);
        });
        it('Should request a loan with collateral and Oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                bn(2000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                oracle.address,   // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, bn(2500));
            await dai.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(130),       // Balance ratio
                {
                    from: user,
                }
            );

            // Inspect entry
            const entry = await collateral.entries(bn(1));
            expect(entry.oracle).to.be.equal(oracle.address);
            expect(entry.token).to.be.equal(dai.address);
            expect(entry.debtId).to.be.equal(debtId);
            expect(entry.amount).to.eq.BN(bn(2500));
            expect(entry.liquidationRatio).to.eq.BN(ratio(120));
            expect(entry.balanceRatio).to.eq.BN(ratio(130));

            // Inspect balances
            expect(await dai.balanceOf(collateral.address)).to.eq.BN(bn(2500));

            // Inspect ERC721 ownership
            expect(await collateral.balanceOf(user)).to.eq.BN(bn(1));
            expect(await collateral.ownerOf(bn(1))).to.be.equal(user);
        });
        it('Should create collateral even if loan was never created ???', async () => {
            // Random non-existent ID
            const debtId = '0x8b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            // Inspect entry
            const entry = await collateral.entries(bn(1));
            expect(entry.oracle).to.be.equal(address0x);
            expect(entry.token).to.be.equal(rcn.address);
            expect(entry.debtId).to.be.equal(debtId);
            expect(entry.amount).to.eq.BN(bn(2500));
            expect(entry.liquidationRatio).to.eq.BN(ratio(105));
            expect(entry.balanceRatio).to.eq.BN(ratio(106));

            // Inspect balances
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(2500));

            // Inspect ERC721 ownership
            expect(await collateral.balanceOf(user)).to.eq.BN(bn(1));
            expect(await collateral.ownerOf(bn(1))).to.be.equal(user);
        });
    });
    describe('Cosign a loan', () => {
        context('With regular loan', () => {
            let debtId;

            beforeEach(async () => {
                // Request a loan
                const modelData = await model.encodeData(
                    bn(2000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(1000),          // Requested amount
                    model.address,    // Debt model
                    address0x,        // Oracle
                    user,             // Borrower
                    address0x,        // Callback
                    bn(0),             // Salt
                    MAX_UINT64,       // Expiration
                    modelData,        // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await rcn.setBalance(user, bn(2500));
                await rcn.approve(collateral.address, bn(2500), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,             // Owner of entry
                    debtId,           // Debt ID
                    address0x,        // Oracle address
                    bn(2500),          // Token Amount
                    ratio(120),       // Liquidation Ratio
                    ratio(130),       // Balance ratio
                    {
                        from: user,
                    }
                );
            });

            it('Should fail to cosign if provided with wrong entryId', async () => {
                // Create a collateral entry to use in-place of the real one
                // but using a different debtId
                await collateral.create(
                    user,
                    '0x8b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a',
                    address0x,
                    bn(0),
                    ratio(101),
                    ratio(103),
                );

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await tryCatchRevert(
                    loanManager.lend(
                        debtId,               // Debt ID
                        [],                   // Oracle data
                        collateral.address,   // Collateral cosigner
                        bn(0),                 // Cosigner limit
                        toBytes32(bn(2)),      // Cosigner data
                        [],                   // Callback data
                        {
                            from: anotherUser,
                        }
                    ),
                    'collateral: incorrect debtId or the entry does not exists'
                );
            });

            it('Should fail if loan is under-collateralized', async () => {
                const entryId = bn(1);

                // Remove almost all the collateral
                await collateral.withdraw(
                    entryId,
                    user,
                    bn(2400),
                    [],
                    {
                        from: user,
                    }
                );

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await tryCatchRevert(
                    loanManager.lend(
                        debtId,               // Debt ID
                        [],                   // Oracle data
                        collateral.address,   // Collateral cosigner
                        bn(0),                 // Cosigner limit
                        toBytes32(entryId),   // Cosigner data
                        [],                   // Callback data
                        {
                            from: anotherUser,
                        }
                    ),
                    'collateral: entry not collateralized'
                );
            });
        });
    });
    describe('Fail Request Collateral', () => {
        it('Should fail to create collateral with not enough balance', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                bn(2000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),       // Requested amount
                model.address,  // Debt model
                oracle.address, // Oracle
                user,           // Borrower
                address0x,      // Callback
                bn(0),          // Salt
                MAX_UINT64,     // Expiration
                modelData       // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, bn(2499));
            await dai.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await tryCatchRevert(
                collateral.create(
                    user,           // Owner of entry
                    debtId,         // Debt ID
                    oracle.address, // Oracle address
                    bn(2500),       // Token Amount
                    ratio(120),     // Liquidation Ratio
                    ratio(130),     // Balance ratio
                    {
                        from: user,
                    }
                ),
                'SafeERC20: ERC20 operation did not succeed'
            );
        });
        it('Should fail to create collateral if liquidation ratio is below BASE', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                bn(2000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),       // Requested amount
                model.address,  // Debt model
                oracle.address, // Oracle
                user,           // Borrower
                address0x,      // Callback
                bn(0),          // Salt
                MAX_UINT64,     // Expiration
                modelData       // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, bn(2499));
            await dai.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await tryCatchRevert(
                collateral.create(
                    user,           // Owner of entry
                    debtId,         // Debt ID
                    oracle.address, // Oracle address
                    bn(2500),       // Token Amount
                    ratio(50),      // Liquidation Ratio
                    ratio(60),      // Balance ratio
                    {
                        from: user,
                    }
                ),
                'collateral-lib: _liquidationRatio should be above one'
            );
        });
        it('Should fail to create collateral if base ratio is below liquidation ratio', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                bn(2000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),       // Requested amount
                model.address,  // Debt model
                oracle.address, // Oracle
                user,           // Borrower
                address0x,      // Callback
                bn(0),          // Salt
                MAX_UINT64,     // Expiration
                modelData       // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, bn(2499));
            await dai.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await tryCatchRevert(
                collateral.create(
                    user,           // Owner of entry
                    debtId,         // Debt ID
                    oracle.address, // Oracle address
                    bn(2500),       // Token Amount
                    ratio(107),     // Liquidation Ratio
                    ratio(106),     // Balance ratio
                    {
                        from: user,
                    }
                ),
                'collateral-lib: _liquidationRatio should be below _balanceRatio'
            );
        });
        it('Should fail to create collateral if loan was already lent', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                bn(2000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(debtId, [], address0x, bn(0), [], [], { from: anotherUser });

            // Create collateral entry
            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            await tryCatchRevert(
                collateral.create(
                    user,             // Owner of entry
                    debtId,         // Debt ID
                    address0x,      // Oracle address
                    bn(2500),        // Token Amount
                    ratio(bn(105)),  // Liquidation Ratio
                    ratio(bn(106)),  // Balance ratio
                    {
                        from: user,
                    }
                ),
                'collateral: loan request should be open'
            );
        });
        it('Should fail to request cosign if caller is not the debt engine', async () => {
            await tryCatchRevert(
                collateral.requestCosign(address0x, bn(1), [], []),
                'collateral: only the loanManager can request cosign'
            );
        });
        it('Should fail to request cosign if debtId is zero', async () => {
            await tryCatchRevert(
                collateral.requestCosign(address0x, bn(0), [], []),
                'collateral: invalid debtId'
            );
        });
    });
    describe('Add Deposit to collateral', () => {
        it('Should add deposit to rcn collateral', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            // Deposit more RCN
            const entryId = bn(1);
            await rcn.setBalance(user, bn(100));
            await rcn.approve(collateral.address, bn(100), { from: user });
            await collateral.deposit(entryId, bn(100), { from: user });

            // Entries length should increase
            expect(await collateral.getEntriesLength()).to.eq.BN(bn(2));

            // Check balances
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(2600));
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(2600));
        });
        it('Should add deposit to rcn collateral, from another user', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            // Deposit more RCN
            const entryId = bn(1);
            await rcn.setBalance(anotherUser, bn(100));
            await rcn.approve(collateral.address, bn(100), { from: anotherUser });
            await collateral.deposit(entryId, bn(100), { from: anotherUser });

            // Check balances
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(2600));
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(2600));
        });
        it('Should add deposit to dai collateral, from another user', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await dai.setBalance(user, bn(2500));
            await dai.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            // Deposit more RCN
            const entryId = bn(1);
            await dai.setBalance(anotherUser, bn(100));
            await dai.approve(collateral.address, bn(100), { from: anotherUser });
            await collateral.deposit(entryId, bn(100), { from: anotherUser });

            // Check balances
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(2600));
            expect(await dai.balanceOf(collateral.address)).to.eq.BN(bn(2600));
        });
    });
    describe('Fail Deposit to Collateral', () => {
        it('Should fail to deposit if user has no balance', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),         // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            // Deposit more RCN
            const entryId = bn(1);
            await rcn.setBalance(user, bn(99));
            await rcn.approve(collateral.address, bn(100), { from: user });
            await tryCatchRevert(
                collateral.deposit(entryId, bn(100), { from: user }),
                'SafeERC20: ERC20 operation did not succeed'
            );

            // Check balances
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(2500));
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(2500));
        });
    });
    describe('Should withdraw collateral', () => {
        it('Should partial withdraw from a non lent loan', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);
            await collateral.withdraw(entryId, anotherUser, bn(1000), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(1500));
            expect(await rcn.balanceOf(anotherUser)).to.eq.BN(bn(1000));
            expect(await rcn.balanceOf(user)).to.eq.BN(bn(0));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(1500));
        });
        it('Should total withdraw from a non lent loan', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);
            await collateral.withdraw(entryId, user, bn(2500), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(user)).to.eq.BN(bn(2500));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(0));
        });
        it('Try withdraw zero from a non lent loan', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);
            await tryCatchRevert(
                collateral.withdraw(entryId, user, bn(0), [], { from: user }),
                'collateral: The amount of withdraw not be 0'
            );

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(2500));
            expect(await rcn.balanceOf(user)).to.eq.BN(bn(0));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(2500));
        });
        it('Should withdraw rcn collateral from a lent loan without Oracle', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await collateral.withdraw(entryId, anotherUser, bn(1000), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(1500));
            expect(await rcn.balanceOf(user)).to.eq.BN(bn(1000));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(1500));
        });
        it('Should withdraw collateral from a lent loan with Oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(bn('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, bn(2500));
            await dai.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await collateral.withdraw(entryId, user, bn(1750), [], { from: user });

            expect(await dai.balanceOf(collateral.address)).to.eq.BN(bn(750));
            expect(await dai.balanceOf(user)).to.eq.BN(bn(1750));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(750));
        });
        it('Try withdraw zero collateral from a lent loan with Oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(bn('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, bn(2500));
            await dai.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await tryCatchRevert(
                collateral.withdraw(entryId, user, bn(0), [], { from: user }),
                'collateral: The amount of withdraw not be 0'
            );

            expect(await dai.balanceOf(collateral.address)).to.eq.BN(bn(2500));
            expect(await dai.balanceOf(user)).to.eq.BN(bn(0));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(2500));
        });
        it('Should withdraw token collateral from a lent loan with Oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(bn('500000000000000000'));

            // Create loan oracle
            const loanOracle = await TestRateOracle.new();
            await loanOracle.setEquivalent(bn('4000000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),             // Requested amount
                model.address,       // Debt model
                loanOracle.address,  // Oracle
                user,                // Borrower
                address0x,           // Callback
                bn(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, bn(2500));
            await dai.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(250));
            await rcn.approve(loanManager.address, bn(250), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await collateral.withdraw(entryId, user, bn(2312), [], { from: user });

            expect(await dai.balanceOf(collateral.address)).to.eq.BN(bn(188));
            expect(await dai.balanceOf(user)).to.eq.BN(bn(2312));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(188));
        });
    });
    describe('Fail withdraw collateral', () => {
        it('Should fail to withdraw rcn collateral from a lent loan without Oracle, below liquidation ratio', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            expect(await loanManager.getCosigner(debtId)).to.be.equal(collateral.address);

            await tryCatchRevert(
                collateral.withdraw(entryId, anotherUser, bn(1301), [], { from: user }),
                'collateral: withdrawable collateral is not enough'
            );
        });
        it('Should fail to withdraw rcn collateral from a lent loan with Oracle, below liquidation ratio', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(bn('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            // worth 5000 RCN
            await dai.setBalance(user, bn(2500));
            await dai.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await tryCatchRevert(
                collateral.withdraw(entryId, user, bn(2201), [], { from: user }),
                'collateral: withdrawable collateral is not enough'
            );
        });
        it('Should fail to withdraw token collateral from a lent loan with Oracle, below liquidation ratio', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(bn('500000000000000000'));

            // Create loan oracle
            const loanOracle = await TestRateOracle.new();
            await loanOracle.setEquivalent(bn('4000000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),             // Requested amount
                model.address,       // Debt model
                loanOracle.address,  // Oracle
                user,                // Borrower
                address0x,           // Callback
                bn(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, bn(2500));
            await dai.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(250));
            await rcn.approve(loanManager.address, bn(250), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await tryCatchRevert(
                collateral.withdraw(entryId, user, bn(2351), [], { from: user }),
                'collateral: withdrawable collateral is not enough'
            );
        });
    });
    describe('Redeem collateral', () => {
        it('Should redeem a non lent loan', async () => {
            // Random non-existent ID
            const debtId = '0x8b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(105),       // Liquidation Ratio
                ratio(106),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Redeem entry
            await collateral.withdraw(entryId, user, bn(2500), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(user)).to.eq.BN(bn(2500));

            // Inspect entry
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(0));
        });
        it('Should redeem a paid loan', async () => {
            // Request a loan
            const loanAmount = bn(1000);
            const modelData = await model.encodeData(
                loanAmount,
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                loanAmount,          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),         // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, loanAmount);
            await rcn.approve(loanManager.address, loanAmount, { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Pay loan
            const total = await withFee(loanAmount);
            await rcn.setBalance(user, total);
            await rcn.approve(debtEngine.address, total, { from: user });
            await debtEngine.pay(
                debtId,
                total,
                user,
                [],
                {
                    from: user,
                }
            );

            // Redeem entry
            await collateral.withdraw(entryId, user, bn(2500), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(user)).to.eq.BN(bn(2500));

            // Inspect entry
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(bn(0));
        });
        it('Should emergency redeem a loan with an error', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Simulate an error
            await model.setErrorFlag(debtId, bn(3), { from: owner });

            // Redeem entry
            await collateral.redeem(entryId, anotherUser, { from: owner });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(bn(0));
            expect(await rcn.balanceOf(anotherUser)).to.eq.BN(bn(2500));

            // Inspect entry
            const entry = await collateral.entries(entryId);
            expect(entry.oracle).to.be.equal(address0x);
            expect(entry.token).to.be.equal(address0x);
            expect(entry.amount).to.eq.BN(bn(0));
            expect(entry.liquidationRatio).to.eq.BN(bn(0));
            expect(entry.balanceRatio).to.eq.BN(bn(0));
            expect(entry.burnFee).to.eq.BN(bn(0));
            expect(entry.rewardFee).to.eq.BN(bn(0));
        });
    });
    describe('Fail redeem collateral', () => {
        it('Should fail to redeem if loan is not paid', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Redeem entry
            await tryCatchRevert(
                collateral.withdraw(entryId, user, bn(2500), [], { from: user }),
                'collateral: withdrawable collateral is not enough'
            );
        });
        it('Should fail emergency redeem a loan if status is not error', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Redeem entry
            await tryCatchRevert(
                collateral.redeem(entryId, anotherUser, { from: owner }),
                'collateral: the debt should be in status error'
            );
        });
        it('Should fail emergency redeem a loan if caller is not the owner', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                bn(1000),
                MAX_UINT64,
                0,
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                bn(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                bn(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, bn(2500));
            await rcn.approve(collateral.address, bn(2500), { from: user });
            await collateral.create(
                user,             // Owner of entry
                debtId,           // Debt ID
                address0x,        // Oracle address
                bn(2500),          // Token Amount
                ratio(120),       // Liquidation Ratio
                ratio(150),       // Balance ratio
                {
                    from: user,
                }
            );

            const entryId = bn(1);

            // Lend loan
            await rcn.setBalance(anotherUser, bn(1000));
            await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                bn(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Simulate an error
            await model.setErrorFlag(debtId, bn(3), { from: owner });

            // Redeem entry
            await tryCatchRevert(
                collateral.redeem(entryId, anotherUser, { from: user }),
                'Ownable: caller is not the owner'
            );
        });
    });
    describe('Pay off debt', () => {
        context('without oracle and with rcn collateral', () => {
            let debtId;
            let entryId;

            beforeEach(async () => {
                // Request a loan
                const modelData = await model.encodeData(
                    bn(1000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(1000),          // Requested amount
                    model.address,    // Debt model
                    address0x,        // Oracle
                    user,             // Borrower
                    address0x,        // Callback
                    bn(0),             // Salt
                    MAX_UINT64,       // Expiration
                    modelData,        // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                // Create collateral entry
                await rcn.setBalance(user, bn(2500));
                await rcn.approve(collateral.address, bn(2500), { from: user });
                await collateral.create(
                    user,             // Owner of entry
                    debtId,           // Debt ID
                    address0x,        // Oracle address
                    bn(2500),          // Token Amount
                    ratio(120),       // Liquidation Ratio
                    ratio(150),       // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    [],                 // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),               // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );
            });

            it('Should pay totally the debt', async () => {
                // Pay debt using RCN collateral
                const feeAmount = await toFee(bn(1000));
                await rcn.setBalance(user, feeAmount);
                await rcn.approve(collateral.address, feeAmount, { from: user });
                await collateral.deposit(entryId, feeAmount, { from: user });

                const data = await debtPayer.encode(address0x, bn(1010), bn(0), user, []);
                await collateral.borrowCollateral(entryId, debtPayer.address, data, [], { from: user });

                expect(await loanManager.getStatus(debtId)).to.eq.BN(bn(2));

                // Debt entry should have extra collateral
                // Inspect entry
                const entry = await collateral.entries(entryId);
                expect(entry.oracle).to.be.equal(address0x);
                expect(entry.token).to.be.equal(rcn.address);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(bn(1500));
                expect(entry.liquidationRatio).to.eq.BN(ratio(120));
                expect(entry.balanceRatio).to.eq.BN(ratio(150));
            });

            it('Should pay partially the debt', async () => {
                // Pay debt using RCN collateral
                const feeAmount = await toFee(bn(400));
                const data = await debtPayer.encode(address0x, bn(400).add(feeAmount), bn(0), user, []);
                await collateral.borrowCollateral(entryId, debtPayer.address, data, [], { from: user });

                expect(await loanManager.getStatus(debtId)).to.eq.BN(bn(1));

                // Debt should be paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(400));

                // Debt entry should have extra collateral
                // Inspect entry
                const entry = await collateral.entries(entryId);
                expect(entry.oracle).to.be.equal(address0x);
                expect(entry.token).to.be.equal(rcn.address);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(bn(2100).sub(feeAmount));
                expect(entry.liquidationRatio).to.eq.BN(ratio(120));
                expect(entry.balanceRatio).to.eq.BN(ratio(150));
            });

            it('Should return any extra rcn', async () => {
                const feeAmount = await toFee(bn(1200));

                // Pay debt using RCN collateral
                const data = await debtPayer.encode(address0x, bn(1200).add(feeAmount), bn(0), user, []);

                const userSnap = await balanceSnap(rcn, user, 'user rcn');

                await collateral.borrowCollateral(entryId, debtPayer.address, data, [], { from: user });

                expect(await loanManager.getStatus(debtId)).to.eq.BN(bn(2));

                // Debt should be paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(1000));

                // Extra should be transfered to the user
                await userSnap.requireIncrease(bn(200));

                // Debt entry should have extra collateral
                // Inspect entry
                const entry = await collateral.entries(entryId);
                expect(entry.amount).to.eq.BN(bn(1300).sub(feeAmount));
            });

            it('Should fail if end result is less collateralized', async () => {
                const altHandler = await TestCollateralHandler.new(collateral.address);
                await altHandler.setSkipPayment(true);

                const data = await altHandler.encode(rcn.address, bn(2499));

                // Try keeping the collateral
                await tryCatchRevert(
                    collateral.borrowCollateral(entryId, altHandler.address, data, [], { from: user }),
                    'collateral: ratio should increase'
                );
            });

            it('Should fail if end result took all the collateral', async () => {
                const altHandler = await TestCollateralHandler.new(collateral.address);
                await altHandler.setSkipPayment(true);

                const data = await altHandler.encode(rcn.address, bn(0));

                // Try keeping the collateral
                await tryCatchRevert(
                    collateral.borrowCollateral(entryId, altHandler.address, data, [], { from: user }),
                    'collateral: ratio should increase'
                );
            });
        });
    });
    describe('Should open an auction', () => {
        context('With under-collateralized loan with token collateral', () => {
            let dai;
            let debtId;
            let entryId;

            beforeEach(async () => {
                // Create oracle and alt token
                dai = await TestToken.new();
                const oracle = await TestRateOracle.new();

                await oracle.setToken(dai.address);
                await oracle.setEquivalent(bn('500000000000000000'));

                // Request a loan
                const modelData = await model.encodeData(
                    bn(1000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(1000),          // Requested amount
                    model.address,    // Debt model
                    address0x,        // Oracle
                    user,             // Borrower
                    address0x,        // Callback
                    bn(0),             // Salt
                    MAX_UINT64,       // Expiration
                    modelData,        // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await dai.setBalance(user, bn(2400));
                await dai.approve(collateral.address, bn(2400), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,                   // Owner of entry
                    debtId,                 // Debt ID
                    oracle.address,         // Oracle address
                    await withFee(bn(600)), // Token Amount
                    ratio(120),             // Liquidation Ratio
                    ratio(150),             // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    [],                 // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),               // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );
            });

            it('should not trigger a liquidation', async () => {
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(false);
            });

            it('should trigger a small liquidation', async () => {
                await model.addDebt(debtId, bn(1));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1001)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(603)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(301)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.startOffer).to.eq.BN(await withFee(bn(286)));
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(603)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });

            it('should trigger half liquidation', async () => {
                await model.addDebt(debtId, bn(100));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1100)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(900)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(450)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.startOffer).to.eq.BN(await withFee(bn(427)));
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(900)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });

            it('should trigger a full liquidation', async () => {
                await model.addDebt(debtId, bn(200));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(600)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.startOffer).to.eq.BN(await withFee(bn(570)));
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1200)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });

            it('should trigger a full liquidation under collateral', async () => {
                await model.addDebt(debtId, bn(1000));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(2000)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(600)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.startOffer).to.eq.BN(await withFee(bn(570)));
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1200)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });
        });
        context('With under-collateralized loan with base collateral', () => {
            let debtId;
            let entryId;

            beforeEach(async () => {
                // Request a loan
                const modelData = await model.encodeData(
                    bn(1000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(1000),          // Requested amount
                    model.address,    // Debt model
                    address0x,        // Oracle
                    user,             // Borrower
                    address0x,        // Callback
                    bn(0),             // Salt
                    MAX_UINT64,       // Expiration
                    modelData,        // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await rcn.setBalance(user, await withFee(bn(1200)));
                await rcn.approve(collateral.address, await withFee(bn(1200)), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,                    // Owner of entry
                    debtId,                  // Debt ID
                    address0x,               // Oracle address
                    await withFee(bn(1200)), // Token Amount
                    ratio(120),              // Liquidation Ratio
                    ratio(150),              // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    [],                 // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),               // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );
            });

            it('should not trigger a liquidation', async () => {
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(false);
            });

            it('should trigger a small liquidation', async () => {
                await model.addDebt(debtId, bn(1));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1001)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(603)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(603)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(603)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });

            it('should trigger half liquidation', async () => {
                await model.addDebt(debtId, bn(100));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1100)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(900)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(900)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(900)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });

            it('should trigger a full liquidation', async () => {
                await model.addDebt(debtId, bn(200));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(1200)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1200)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });

            it('should trigger a full liquidation under collateral', async () => {
                await model.addDebt(debtId, bn(1000));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(2000)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(1200)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1200)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });
        });
        context('With under-collateralized loan with base collateral and oracle', () => {
            let debtId;
            let entryId;
            let oracleData;

            beforeEach(async () => {
                const oracle = await TestRateOracle.new();
                oracleData = await oracle.encodeRate(bn('1000000000000000000'), bn('2000000000000000000'));

                // Request a loan
                const modelData = await model.encodeData(
                    bn(2000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(2000),          // Requested amount
                    model.address,    // Debt model
                    oracle.address,   // Oracle
                    user,             // Borrower
                    address0x,        // Callback
                    bn(0),             // Salt
                    MAX_UINT64,       // Expiration
                    modelData,        // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await rcn.setBalance(user, await withFee(bn(1200)));
                await rcn.approve(collateral.address, await withFee(bn(1200)), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,                    // Owner of entry
                    debtId,                  // Debt ID
                    address0x,               // Oracle address
                    await withFee(bn(1200)), // Token Amount
                    ratio(120),              // Liquidation Ratio
                    ratio(150),              // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    oracleData,         // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),               // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );
            });
            it('should not trigger a liquidation', async () => {
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(false);
            });
            it('should trigger a small liquidation', async () => {
                await model.addDebt(debtId, bn(2));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, oracleData);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1001)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(603)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(603)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(603)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });

            it('should trigger half liquidation', async () => {
                await model.addDebt(debtId, bn(200));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, oracleData);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1100)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(900)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(900)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(900)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });

            it('should trigger a full liquidation', async () => {
                await model.addDebt(debtId, bn(400));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, oracleData);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(1200)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1200)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });

            it('should trigger a full liquidation under collateral', async () => {
                await model.addDebt(debtId, bn(2000));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, oracleData);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(2000)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(1200)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1200)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });
        });
        context('With under-collateralized loan with token collateral and oracle', () => {
            let dai;
            let debtId;
            let entryId;
            let oracleData;

            beforeEach(async () => {
                const oracleLoan = await TestRateOracle.new();
                oracleData = await oracleLoan.encodeRate(bn('1000000000000000000'), bn('2000000000000000000'));

                dai = await TestToken.new();
                const oracle = await TestRateOracle.new();
                await oracle.setEquivalent(bn('500000000000000000'));
                await oracle.setToken(dai.address);

                // Request a loan
                const modelData = await model.encodeData(
                    bn(2000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(2000),           // Requested amount
                    model.address,      // Debt model
                    oracleLoan.address, // Oracle
                    user,               // Borrower
                    address0x,          // Callback
                    bn(0),              // Salt
                    MAX_UINT64,         // Expiration
                    modelData,          // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await dai.setBalance(user, await withFee(bn(600)));
                await dai.approve(collateral.address, await withFee(bn(600)), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,                   // Owner of entry
                    debtId,                 // Debt ID
                    oracle.address,         // Oracle address
                    await withFee(bn(600)), // Token Amount
                    ratio(120),             // Liquidation Ratio
                    ratio(150),             // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(2000));
                await rcn.approve(loanManager.address, bn(2000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    oracleData,         // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),              // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );
            });
            it('should not trigger a liquidation', async () => {
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(false);
            });
            it('should trigger a small liquidation', async () => {
                await model.addDebt(debtId, bn(2));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, oracleData);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1001)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(603)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(301)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.startOffer).to.eq.BN(await withFee(bn(286)));
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(603)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });
            it('should trigger half liquidation', async () => {
                await model.addDebt(debtId, bn(200));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, oracleData);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1100)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(900)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(450)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.startOffer).to.eq.BN(await withFee(bn(427)));
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(900)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });

            it('should trigger a full liquidation', async () => {
                await model.addDebt(debtId, bn(400));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, oracleData);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(600)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.startOffer).to.eq.BN(await withFee(bn(570)));
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1200)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });

            it('should trigger a full liquidation under collateral', async () => {
                await model.addDebt(debtId, bn(2000));

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, oracleData)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, oracleData);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._debt).to.eq.BN(await withFee(bn(2000)));
                expect(claimedEvent._required).to.eq.BN(await withFee(bn(1200)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(600)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.startOffer).to.eq.BN(await withFee(bn(570)));
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1200)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });
        });
        context('With undue payments and base collateral', () => {
            let debtId;
            let entryId;

            beforeEach(async () => {
                // Request a loan
                const modelData = await model.encodeData(
                    bn(1000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(1000),          // Requested amount
                    model.address,    // Debt model
                    address0x,        // Oracle
                    user,             // Borrower
                    address0x,        // Callback
                    bn(0),             // Salt
                    MAX_UINT64,       // Expiration
                    modelData,        // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await rcn.setBalance(user, await withFee(bn(1200)));
                await rcn.approve(collateral.address, await withFee(bn(1200)), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,                    // Owner of entry
                    debtId,                  // Debt ID
                    address0x,               // Oracle address
                    await withFee(bn(1200)), // Token Amount
                    ratio(120),              // Liquidation Ratio
                    ratio(150),              // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    [],                 // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),               // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );
            });
            it('should not trigger a liquidation', async () => {
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(false);
            });
            it('should trigger a liquidation for the undue payments', async () => {
                await model.setRelativeDueTime(debtId, true, bn(60));
                const dueTime = await model.getDueTime(debtId);

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(rcn, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(rcn, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(1200)));
                await aucSnap.requireIncrease(await withFee(bn(1200)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedExpired');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._dueTime).to.eq.BN(dueTime);
                expect(claimedEvent._obligation).to.eq.BN(await withFee(bn(1050)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(1050)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(rcn.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1050)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(1200)));
            });
            it('should not trigger a liquidation if already is in liquidation', async () => {
                await model.setRelativeDueTime(debtId, true, bn(60));

                // perform the actual claim and start the auction
                await collateral.claim(user, debtId, []);

                await tryCatchRevert(collateral.claim(user, debtId, []), 'collateral: auction already exists');
            });
        });
        context('With undue payments and token collateral', () => {
            let dai;
            let debtId;
            let entryId;

            beforeEach(async () => {
                // Create oracle and alt token
                dai = await TestToken.new();
                const oracle = await TestRateOracle.new();

                await oracle.setToken(dai.address);
                await oracle.setEquivalent(bn('500000000000000000'));

                // Request a loan
                const modelData = await model.encodeData(
                    bn(1000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(1000),          // Requested amount
                    model.address,    // Debt model
                    address0x,        // Oracle
                    user,             // Borrower
                    address0x,        // Callback
                    bn(0),             // Salt
                    MAX_UINT64,       // Expiration
                    modelData,        // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await dai.setBalance(user, await withFee(bn(600)));
                await dai.approve(collateral.address, await withFee(bn(600)), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,                   // Owner of entry
                    debtId,                 // Debt ID
                    oracle.address,         // Oracle address
                    await withFee(bn(600)), // Token Amount
                    ratio(120),             // Liquidation Ratio
                    ratio(150),             // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    [],                 // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),              // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );
            });
            it('should not trigger a liquidation', async () => {
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(false);
            });
            it('should trigger a liquidation for the undue payments', async () => {
                await model.setRelativeDueTime(debtId, true, bn(60));
                const dueTime = await model.getDueTime(debtId);

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, []);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedExpired');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._dueTime).to.eq.BN(dueTime);
                expect(claimedEvent._obligation).to.eq.BN(await withFee(bn(1050)));
                expect(claimedEvent._obligationTokens).to.eq.BN(await withFee(bn(1050)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(525)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1050)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });
            it('should not trigger a liquidation if already is in liquidation', async () => {
                await model.setRelativeDueTime(debtId, true, bn(60));

                // perform the actual claim and start the auction
                await collateral.claim(user, debtId, []);

                await tryCatchRevert(collateral.claim(user, debtId, []), 'collateral: auction already exists');
            });
        });
        context('With undue payments loan with oracle, and token collateral', () => {
            let dai;
            let debtId;
            let entryId;
            let loanOracledata;

            beforeEach(async () => {
                const oracleLoan = await TestRateOracle.new();
                loanOracledata = await oracleLoan.encodeRate(bn('1000000000000000000'), bn('2000000000000000000'));

                // Create oracle and alt token
                dai = await TestToken.new();
                const oracle = await TestRateOracle.new();

                await oracle.setToken(dai.address);
                await oracle.setEquivalent(bn('500000000000000000'));

                // Request a loan
                const modelData = await model.encodeData(
                    bn(2000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(2000),            // Requested amount
                    model.address,      // Debt model
                    oracleLoan.address, // Oracle
                    user,               // Borrower
                    address0x,          // Callback
                    bn(0),               // Salt
                    MAX_UINT64,         // Expiration
                    modelData,          // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await dai.setBalance(user, await withFee(bn(600)));
                await dai.approve(collateral.address, await withFee(bn(600)), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,                   // Owner of entry
                    debtId,                 // Debt ID
                    oracle.address,         // Oracle address
                    await withFee(bn(600)), // Token Amount
                    ratio(120),             // Liquidation Ratio
                    ratio(150),             // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(2000));
                await rcn.approve(loanManager.address, bn(2000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    loanOracledata,     // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),               // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );
            });
            it('should not trigger a liquidation', async () => {
                expect(await collateral.claim.call(user, debtId, loanOracledata)).to.be.equal(false);
            });
            it('should trigger a liquidation for the undue payments', async () => {
                await model.setRelativeDueTime(debtId, true, bn(60));
                const dueTime = await model.getDueTime(debtId);

                // call claim method, should return true
                expect(await collateral.claim.call(user, debtId, loanOracledata)).to.be.equal(true);

                // perform the actual claim and start the auction
                const colSnap = await balanceSnap(dai, collateral.address, 'collateral');
                const aucSnap = await balanceSnap(dai, auction.address, 'auction');
                const claimTx = await collateral.claim(user, debtId, loanOracledata);

                await colSnap.requireDecrease(await withFee(bn(600)));
                await aucSnap.requireIncrease(await withFee(bn(600)));

                // Started auction event
                const claimedEvent = searchEvent(claimTx, 'ClaimedExpired');
                expect(claimedEvent._entryId).to.eq.BN(entryId);
                expect(claimedEvent._dueTime).to.eq.BN(dueTime);
                expect(claimedEvent._obligation).to.eq.BN(await withFee(bn(2100)));
                expect(claimedEvent._obligationTokens).to.eq.BN(await withFee(bn(1051)));
                expect(claimedEvent._marketValue).to.eq.BN(await withFee(bn(525)));

                const auctionId = claimedEvent._auctionId;

                // validate auction parameters
                const auctionEntry = await auction.auctions(auctionId);
                expect(auctionEntry.fromToken).to.be.equal(dai.address);
                expect(auctionEntry.amount).to.eq.BN(await withFee(bn(1051)));
                expect(auctionEntry.limit).to.eq.BN(await withFee(bn(600)));
            });
            it('should not trigger a liquidation if already is in liquidation', async () => {
                await model.setRelativeDueTime(debtId, true, bn(60));

                // perform the actual claim and start the auction
                await collateral.claim(user, debtId, loanOracledata);

                await tryCatchRevert(collateral.claim(user, debtId, loanOracledata), 'collateral: auction already exists');
            });
        });
        context('During auction', () => {
            let debtId;
            let entryId;
            let auctionId;
            let loanAmount;
            let collateralAmount;

            beforeEach(async () => {
                loanAmount = bn(1000);
                collateralAmount = toTotal(await withFee(loanAmount), bn(12000));

                // Request a loan
                const modelData = await model.encodeData(
                    loanAmount,
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    loanAmount,    // Requested amount
                    model.address, // Debt model
                    address0x,     // Oracle
                    user,          // Borrower
                    address0x,     // Callback
                    bn(0),         // Salt
                    MAX_UINT64,    // Expiration
                    modelData,     // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await rcn.setBalance(user, collateralAmount);
                await rcn.approve(collateral.address, collateralAmount, { from: user });

                // Create collateral entry
                await collateral.create(
                    user,             // Owner of entry
                    debtId,           // Debt ID
                    address0x,        // Oracle address
                    collateralAmount, // Token Amount
                    ratio(120),       // Liquidation Ratio
                    ratio(150),       // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, loanAmount);
                await rcn.approve(loanManager.address, loanAmount, { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    [],                 // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),              // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );

                // Trigger auction
                await model.addDebt(debtId, bn(1));
                loanAmount = loanAmount.add(bn(1));
                const claimTx = await collateral.claim(user, debtId, []);
                const claimedEvent = searchEvent(claimTx, 'ClaimedLiquidation');
                auctionId = claimedEvent._auctionId;
            });

            it('Should fail to deposit collateral', async () => {
                await rcn.setBalance(user, 100);
                await rcn.approve(collateral.address, 100, { from: user });
                await tryCatchRevert(
                    collateral.deposit(entryId, 100, { from: user }),
                    'collateral: can\'t deposit during auction'
                );
            });

            it('Should fail to withdraw collateral', async () => {
                await tryCatchRevert(
                    collateral.withdraw(entryId, user, bn(1), [], { from: user }),
                    'collateral: can\'t withdraw during auction'
                );
            });

            it('Should deposit after auction closes', async () => {
                // Close auction
                await rcn.setBalance(anotherUser, 609);
                await rcn.approve(auction.address, 609, { from: anotherUser });
                await auction.take(auctionId, [], false, { from: anotherUser });

                // Deposit
                await rcn.setBalance(user, 100);
                await rcn.approve(collateral.address, 100, { from: user });
                await collateral.deposit(entryId, 100, { from: user });
            });

            it('Should withdraw after auction closes', async () => {
                // Close auction
                await rcn.setBalance(anotherUser, 0);
                await rcn.approve(auction.address, await withFee(loanAmount), { from: anotherUser });
                await auction.take(auctionId, [], false, { from: anotherUser });

                // Withdraw
                await collateral.withdraw(entryId, user, bn(1), [], { from: user });
            });
        });
    });
    describe('Close an auction', () => {
        context('With partial payment token collateral', () => {
            let dai;
            let debtId;
            let entryId;

            beforeEach(async () => {
                // Create oracle and alt token
                dai = await TestToken.new();
                const oracle = await TestRateOracle.new();

                await oracle.setToken(dai.address);
                await oracle.setEquivalent(bn('500000000000000000'));

                // Request a loan
                const modelData = await model.encodeData(
                    bn(1000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    bn(1000),          // Requested amount
                    model.address,    // Debt model
                    address0x,        // Oracle
                    user,             // Borrower
                    address0x,        // Callback
                    bn(0),             // Salt
                    MAX_UINT64,       // Expiration
                    modelData,        // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                await dai.setBalance(user, bn(2400));
                await dai.approve(collateral.address, bn(2400), { from: user });

                // Create collateral entry
                await collateral.create(
                    user,                   // Owner of entry
                    debtId,                 // Debt ID
                    oracle.address,         // Oracle address
                    await withFee(bn(600)), // Token Amount
                    ratio(120),             // Liquidation Ratio
                    ratio(150),             // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, bn(1000));
                await rcn.approve(loanManager.address, bn(1000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    [],                 // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),               // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );

                // Freeze time of the auction
                await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

                // Generate an action by liquidation
                await model.addDebt(debtId, bn(100));
                await collateral.claim(address0x, debtId, []);

                // Collateral should be in auction
                const auctionId = await collateral.entryToAuction(entryId);
                expect(auctionId).to.not.eq.BN(bn(0));
                expect(await collateral.auctionToEntry(auctionId)).to.eq.BN(entryId);
                expect(await collateral.inAuction(entryId)).to.be.equal(true);
            });

            it('Should close auction above market', async () => {
                await rcn.setBalance(anotherUser, await withFee(bn(900)));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');

                // Pay auction
                await rcn.approve(auction.address, await withFee(bn(900)), { from: anotherUser });
                await auction.take(entryId, [], false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(bn(900));
                await userRcnSnap.requireDecrease(await withFee(bn(900)));
                await userDaiSnap.requireIncrease(await withFee(bn(427)));
                await collateralDaiSnap.requireIncrease(await withFee(bn(174)));
                await auctionDaiSnap.requireDecrease(await withFee(bn(600)));

                // Should no longer be under-collateral
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(false);

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(900));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(await withFee(bn(174)));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });

            it('Should close auction at market rate', async () => {
                await rcn.setBalance(anotherUser, await withFee(bn(900)));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');

                // Move clock 10 minutes
                await auction.increaseTime(bn(60).mul(bn(10)));

                // Pay auction
                await rcn.approve(auction.address, await withFee(bn(900)), { from: anotherUser });
                await auction.take(entryId, [], false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(bn(900));
                await userRcnSnap.requireDecrease(await withFee(bn(900)));
                await userDaiSnap.requireIncrease(await withFee(bn(450)));
                await collateralDaiSnap.requireIncrease(await withFee(bn(151)));
                await auctionDaiSnap.requireDecrease(await withFee(bn(600)));

                // Should no longer be under-collateral
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(false);

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(900));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(await withFee(bn(151)));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });

            it('Should close auction 5% below market rate', async () => {
                await rcn.setBalance(anotherUser, await withFee(bn(900)));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');

                // Move clock 20 minutes
                await auction.increaseTime(bn(60).mul(bn(20)));

                // Pay auction
                await rcn.approve(auction.address, await withFee(bn(900)), { from: anotherUser });
                await auction.take(entryId, [], false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(bn(900));
                await userRcnSnap.requireDecrease(await withFee(bn(900)));
                await userDaiSnap.requireIncrease(await withFee(bn(473)));
                await collateralDaiSnap.requireIncrease(await withFee(bn(128)));
                await auctionDaiSnap.requireDecrease(await withFee(bn(600)));

                // Should no longer be under-collateral
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(false);

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(900));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(await withFee(bn(128)));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });

            it('Should close auction aprox 40% below market rate', async () => {
                await rcn.setBalance(anotherUser, await withFee(bn(900)));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');

                // Move clock aprox 30 minutes
                await auction.increaseTime(bn(1956));

                // Pay auction
                await rcn.approve(auction.address, await withFee(bn(900)), { from: anotherUser });
                await auction.take(entryId, [], false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(bn(900));
                await userRcnSnap.requireDecrease(await withFee(bn(900)));
                await userDaiSnap.requireIncrease(await withFee(bn(500)));
                await collateralDaiSnap.requireIncrease(await withFee(bn(100)));
                await auctionDaiSnap.requireDecrease(await withFee(bn(600)));

                // Should no longer be under-collateral
                expect(await collateral.claim.call(user, debtId, [])).to.be.equal(true);

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(900));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(await withFee(bn(100)));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });

            it('Should close auction using all the collateral', async () => {
                await rcn.setBalance(anotherUser, await withFee(bn(900)));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');

                // Move clock aprox 75 minutes
                await auction.increaseTime(bn(4513));

                // Pay auction
                await rcn.approve(auction.address, await withFee(bn(900)), { from: anotherUser });
                await auction.take(entryId, [], false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(bn(900));
                await userRcnSnap.requireDecrease(await withFee(bn(900)));
                await userDaiSnap.requireIncrease(await withFee(bn(599)));
                await collateralDaiSnap.requireIncrease(bn(2));
                await auctionDaiSnap.requireDecrease(await withFee(bn(600)));

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(900));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(bn(2));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });

            it('Should close auction all the collateral, for half the base', async () => {
                await rcn.setBalance(anotherUser, await withFee(bn(452)));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');

                // Move clock aprox 75 minutes + 12 hours
                await auction.increaseTime(bn(4513).add(bn(43200)));

                // Pay auction
                await rcn.approve(auction.address, await withFee(bn(452)), { from: anotherUser });
                await auction.take(entryId, [], false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(bn(452));
                await userRcnSnap.requireDecrease(await withFee(bn(452)));
                await userDaiSnap.requireIncrease(await withFee(bn(600)));
                await collateralDaiSnap.requireIncrease(await withFee(bn(0)));
                await auctionDaiSnap.requireDecrease(await withFee(bn(600)));

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(452));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(bn(0));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });

            it('Should close auction all the collateral, after looping the base', async () => {
                await rcn.setBalance(anotherUser, await withFee(bn(452)));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');

                // Move clock aprox 75 minutes + 36 hours
                await auction.increaseTime(bn(4513).add(bn(129600)));

                // Pay auction
                await rcn.approve(auction.address, await withFee(bn(452)), { from: anotherUser });
                await auction.take(entryId, [], false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(bn(452));
                await userRcnSnap.requireDecrease(await withFee(bn(452)));
                await userDaiSnap.requireIncrease(await withFee(bn(600)));
                await collateralDaiSnap.requireIncrease(bn(0));
                await auctionDaiSnap.requireDecrease(await withFee(bn(600)));

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(452));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(bn(0));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });

            it('Should close auction and send extra to collateral owner', async () => {
                await rcn.setBalance(anotherUser, await withFee(bn(900)));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const auctionRcnSnap = await balanceSnap(rcn, auction.address, 'auction rcn');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'another user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');
                const collateralOwnerRcnSnap = await balanceSnap(rcn, user, 'user rcn');

                // Move clock 10 minutes
                await auction.increaseTime(bn(60).mul(bn(10)));

                // Lower debt to only 100
                await model.setDebt(debtId, bn(100));

                // Pay auction
                await rcn.approve(auction.address, await withFee(bn(900)), { from: anotherUser });
                await auction.take(entryId, [], false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(bn(100));
                await userRcnSnap.requireDecrease(await withFee(bn(900)));
                await userDaiSnap.requireIncrease(await withFee(bn(450)));
                await collateralDaiSnap.requireIncrease(await withFee(bn(151)));
                await collateralOwnerRcnSnap.requireIncrease(await withFee(bn(800)));
                await auctionDaiSnap.requireDecrease(await withFee(bn(600)));
                await auctionRcnSnap.requireConstant();

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(bn(100));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(await withFee(bn(151)));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });
        });
        context('With partial payment token collateral and loan with oracle', () => {
            let dai;
            let debtId;
            let entryId;
            let loanOracleData;

            let requestedRcn;
            let collateralDai;
            let offeredDai;
            let isUnderCollateral;

            beforeEach(async () => {
                const oracleLoan = await TestRateOracle.new();
                loanOracleData = await oracleLoan.encodeRate(bn('1000000000000000000'), bn('2000000000000000000'));

                // Create oracle and alt token
                dai = await TestToken.new();
                const oracle = await TestRateOracle.new();

                await oracle.setToken(dai.address);
                await oracle.setEquivalent(bn('500000000000000000'));

                // Request a loan
                const modelData = await model.encodeData(
                    e(2000),
                    MAX_UINT64,
                    0,
                    MAX_UINT64
                );

                // Request  loan
                const requestReceipt = await loanManager.requestLoan(
                    e(2000),            // Requested amount
                    model.address,      // Debt model
                    oracleLoan.address, // Oracle
                    user,               // Borrower
                    address0x,          // Callback
                    bn(0),               // Salt
                    MAX_UINT64,         // Expiration
                    modelData,          // Model data
                    {
                        from: user,
                    }
                );

                debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

                const total = await withFee(e(600));
                await dai.setBalance(user, total);
                await dai.approve(collateral.address, total, { from: user });

                // Create collateral entry
                await collateral.create(
                    user,           // Owner of entry
                    debtId,         // Debt ID
                    oracle.address, // Oracle address
                    total,          // Token Amount
                    ratio(120),     // Liquidation Ratio
                    ratio(150),     // Balance ratio
                    {
                        from: user,
                    }
                );

                entryId = bn(1);

                // Lend loan
                await rcn.setBalance(anotherUser, e(1000));
                await rcn.approve(loanManager.address, e(1000), { from: anotherUser });
                await loanManager.lend(
                    debtId,             // Debt ID
                    loanOracleData,     // Oracle data
                    collateral.address, // Collateral cosigner
                    bn(0),               // Cosigner limit
                    toBytes32(entryId), // Cosigner data
                    [],                 // Callback data
                    {
                        from: anotherUser,
                    }
                );

                // Freeze time of the auction
                await auction.setTime(bn(Math.floor(new Date().getTime() / 1000)));

                // Generate an action by liquidation
                await model.addDebt(debtId, e(200));
                await collateral.claim(address0x, debtId, loanOracleData);

                // Collateral should be in auction
                const auctionId = await collateral.entryToAuction(entryId);
                expect(auctionId).to.not.eq.BN(bn(0));
                expect(await collateral.auctionToEntry(auctionId)).to.eq.BN(entryId);
                expect(await collateral.inAuction(entryId)).to.be.equal(true);
            });

            it('Should close auction above market', async () => {
                requestedRcn = e(900);
                collateralDai = e(600);
                offeredDai = e(427).add(bn('500000000000000000'));
                isUnderCollateral = false;
            });

            it('Should close auction at market level', async () => {
                // Advance time 10 minutes
                await auction.increaseTime(bn(10).mul(bn(60)));

                requestedRcn = e(900);
                collateralDai = e(600);
                offeredDai = e(450);
                isUnderCollateral = false;
            });

            it('Should close auction 5% below market rate', async () => {
                // Move clock 20 minutes
                await auction.increaseTime(bn(60).mul(bn(20)));

                requestedRcn = e(900);
                collateralDai = e(600);
                offeredDai = e(472).add(bn('500000000000000000'));
                isUnderCollateral = false;
            });

            it('Should close auction aprox 40% below market rate', async () => {
                // Move clock aprox 30 minutes
                await auction.increaseTime(bn(1956));

                requestedRcn = e(900);
                collateralDai = e(600);
                offeredDai = e(500).add(bn('850000000000000000'));
                isUnderCollateral = true;
            });

            it('Should close auction using all the collateral', async () => {
                // Move clock aprox 75 minutes
                await auction.increaseTime(bn(4600));

                requestedRcn = e(900);
                collateralDai = e(600);
                offeredDai = e(600);
                isUnderCollateral = true;
            });

            it('Should close auction all the collateral, for half the base', async () => {
                // Move clock aprox 75 minutes + 12 hours
                await auction.increaseTime(bn(4600).add(bn(43200)));

                requestedRcn = e(450);
                collateralDai = e(600);
                offeredDai = e(600);
                isUnderCollateral = true;
            });

            it('Should close auction all the collateral, after looping the base', async () => {
                // Move clock aprox 75 minutes + 36 hours
                await auction.increaseTime(bn(4600).add(bn(129600)));

                requestedRcn = e(450);
                collateralDai = e(600);
                offeredDai = e(600);
                isUnderCollateral = true;
            });

            afterEach(async () => {
                const leftoverDai = collateralDai.sub(offeredDai);

                collateralDai = collateralDai.add(await toFee(collateralDai));
                requestedRcn = requestedRcn.add(await toFee(requestedRcn));
                offeredDai = offeredDai.add(await toFee(offeredDai));

                const feeAmount = await toFee(requestedRcn);
                await rcn.setBalance(anotherUser, requestedRcn.add(feeAmount));

                const auctionDaiSnap = await balanceSnap(dai, auction.address, 'auction dai');
                const userDaiSnap = await balanceSnap(dai, anotherUser, 'another user dai');
                const engineRcnSnap = await balanceSnap(rcn, debtEngine.address, 'debt engine rcn');
                const userRcnSnap = await balanceSnap(rcn, anotherUser, 'user rcn');
                const collateralDaiSnap = await balanceSnap(dai, collateral.address, 'collateral dai');

                // Pay auction
                await rcn.approve(auction.address, requestedRcn.add(feeAmount), { from: anotherUser });
                await auction.take(entryId, loanOracleData, false, { from: anotherUser });

                await engineRcnSnap.requireIncrease(requestedRcn.sub(feeAmount));
                await userRcnSnap.requireDecrease(requestedRcn);
                await userDaiSnap.requireIncrease(offeredDai);
                await collateralDaiSnap.requireIncrease(leftoverDai.add(await toFee(leftoverDai)));
                await auctionDaiSnap.requireDecrease(collateralDai);

                // Check if the contract is under collateralized
                try {
                    expect(await collateral.claim.call(user, debtId, loanOracleData)).to.be.equal(isUnderCollateral);
                } catch (e) {
                    expect(isUnderCollateral).to.be.equal(true);
                    expect(leftoverDai).to.eq.BN(bn(0));
                }

                // Loan should be partially paid
                expect(await model.getPaid(debtId)).to.eq.BN(requestedRcn.sub(feeAmount).mul(bn(2)));

                // Collateral should have the leftover tokens
                const entry = await collateral.entries(entryId);
                expect(entry.debtId).to.be.equal(debtId);
                expect(entry.amount).to.eq.BN(leftoverDai.add(await toFee(leftoverDai)));

                // Collateral should not be in auction
                expect(await collateral.entryToAuction(entryId)).to.eq.BN(bn(0));
                expect(await collateral.inAuction(entryId)).to.be.equal(false);
            });
        });
        it('Should fail to try close auction from another address', async () => {
            await tryCatchRevert(
                collateral.auctionClosed(bn(0), bn(0), bn(0), []),
                'collateral: caller should be the auctioner'
            );
        });
        it('Should fail to try close auction if ID does not exists', async () => {
            const collateral = await Collateral.new(loanManager.address, user);

            await tryCatchRevert(
                collateral.auctionClosed(bn(2), bn(0), bn(0), [], { from: user }),
                'collateral: entry does not exists'
            );
        });
    });
});
