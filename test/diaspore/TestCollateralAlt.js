const Collateral = artifacts.require('Collateral');
const TestModel = artifacts.require('TestModel');
const LoanManager = artifacts.require('LoanManager');
const DebtEngine = artifacts.require('DebtEngine');
const TestToken = artifacts.require('TestToken');
const TestRateOracle = artifacts.require('TestRateOracle');
const TestConverter = artifacts.require('TestConverter');

const { tryCatchRevert, address0x, toBytes32 } = require('../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function b (number) {
    return web3.utils.toBN(number);
}

const MAX_UINT64 = b(2).pow(b(64)).sub(b(1));
// const BASE = bn(10000);

contract('Test Collateral cosigner Diaspore', function ([_, stub, owner, user, anotherUser, hacker]) {
    let rcn;
    let debtEngine;
    let loanManager;
    let model;
    let collateral;
    let converter;

    beforeEach(async () => {
        rcn = await TestToken.new({ from: owner });
        debtEngine = await DebtEngine.new(rcn.address, { from: owner });
        loanManager = await LoanManager.new(debtEngine.address, { from: owner });
        model = await TestModel.new({ from: owner });
        await model.setEngine(debtEngine.address, { from: owner });
        // Collateral deploy
        collateral = await Collateral.new(loanManager.address, { from: owner });
        converter = await TestConverter.new({ from: owner });
        await collateral.setConverter(converter.address, { from: owner });
    });

    describe('Request collateral', () => {
        it('Should request a loan with collateral', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(2000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(13000),         // Balance ratio
                b(7),             // Burn fee
                b(5),             // Reward fee
                {
                    from: user,
                }
            );

            // Inspect entry
            const entry = await collateral.entries(b(1));
            expect(entry.oracle).to.be.equal(address0x);
            expect(entry.token).to.be.equal(rcn.address);
            expect(entry.debtId).to.be.equal(debtId);
            expect(entry.amount).to.eq.BN(b(2500));
            expect(entry.liquidationRatio).to.eq.BN(b(12000));
            expect(entry.balanceRatio).to.eq.BN(b(13000));
            expect(entry.burnFee).to.eq.BN(b(7));
            expect(entry.rewardFee).to.eq.BN(b(5));

            // Inspect balances
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(2500));

            // Inspect ERC721 ownership
            expect(await collateral.balanceOf(user)).to.eq.BN(b(1));
            expect(await collateral.ownerOf(b(1))).to.be.equal(user);
            expect(await collateral.tokenOfOwnerByIndex(user, b(0))).to.eq.BN(b(1));
        });
        it('Should request a loan with collateral and Oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                b(2000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                oracle.address,   // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(13000),         // Balance ratio
                b(7),             // Burn fee
                b(5),             // Reward fee
                {
                    from: user,
                }
            );

            // Inspect entry
            const entry = await collateral.entries(b(1));
            expect(entry.oracle).to.be.equal(oracle.address);
            expect(entry.token).to.be.equal(dai.address);
            expect(entry.debtId).to.be.equal(debtId);
            expect(entry.amount).to.eq.BN(b(2500));
            expect(entry.liquidationRatio).to.eq.BN(b(12000));
            expect(entry.balanceRatio).to.eq.BN(b(13000));
            expect(entry.burnFee).to.eq.BN(b(7));
            expect(entry.rewardFee).to.eq.BN(b(5));

            // Inspect balances
            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(2500));

            // Inspect ERC721 ownership
            expect(await collateral.balanceOf(user)).to.eq.BN(b(1));
            expect(await collateral.ownerOf(b(1))).to.be.equal(user);
            expect(await collateral.tokenOfOwnerByIndex(user, b(0))).to.eq.BN(b(1));
        });
        it('Should create oracle if loan was never created ???', async () => {
            // Random non-existent ID
            const debtId = '0x8b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            // Inspect entry
            const entry = await collateral.entries(b(1));
            expect(entry.oracle).to.be.equal(address0x);
            expect(entry.token).to.be.equal(rcn.address);
            expect(entry.debtId).to.be.equal(debtId);
            expect(entry.amount).to.eq.BN(b(2500));
            expect(entry.liquidationRatio).to.eq.BN(b(10500));
            expect(entry.balanceRatio).to.eq.BN(b(10600));
            expect(entry.burnFee).to.eq.BN(b(9));
            expect(entry.rewardFee).to.eq.BN(b(1));

            // Inspect balances
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(2500));

            // Inspect ERC721 ownership
            expect(await collateral.balanceOf(user)).to.eq.BN(b(1));
            expect(await collateral.ownerOf(b(1))).to.be.equal(user);
            expect(await collateral.tokenOfOwnerByIndex(user, b(0))).to.eq.BN(b(1));
        });
    });
    describe('Fail Request Collateral', () => {
        it('Should fail to create oracle with no balance', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                b(2000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                oracle.address,   // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, b(2499));
            await dai.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await tryCatchRevert(
                collateral.create(
                    debtId,           // Debt ID
                    oracle.address,   // Oracle address
                    b(2500),          // Token Amount
                    b(12000),         // Liquidation Ratio
                    b(13000),         // Balance ratio
                    b(7),             // Burn fee
                    b(5),             // Reward fee
                    {
                        from: user,
                    }
                ),
                'Error pulling tokens'
            );
        });
        it('Should fail to create oracle if liquidation ratio is below BASE', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                b(2000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                oracle.address,   // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, b(2499));
            await dai.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await tryCatchRevert(
                collateral.create(
                    debtId,           // Debt ID
                    oracle.address,   // Oracle address
                    b(2500),          // Token Amount
                    b(500),           // Liquidation Ratio
                    b(600),           // Balance ratio
                    b(7),             // Burn fee
                    b(5),             // Reward fee
                    {
                        from: user,
                    }
                ),
                'The liquidation ratio should be greater than BASE'
            );
        });
        it('Should fail to create oracle if fee sum is above BASE', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                b(2000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                oracle.address,   // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await tryCatchRevert(
                collateral.create(
                    debtId,           // Debt ID
                    oracle.address,   // Oracle address
                    b(2500),          // Token Amount
                    b(10500),         // Liquidation Ratio
                    b(10700),         // Balance ratio
                    b(9602),             // Burn fee
                    b(3402),             // Reward fee
                    {
                        from: user,
                    }
                ),
                'Fee should be lower than BASE'
            );
        });
        it('Should fail to create oracle if base ratio is below liquidation ratio', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                b(2000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                oracle.address,   // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, b(2499));
            await dai.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await tryCatchRevert(
                collateral.create(
                    debtId,           // Debt ID
                    oracle.address,   // Oracle address
                    b(2500),          // Token Amount
                    b(10700),         // Liquidation Ratio
                    b(10600),         // Balance ratio
                    b(9),             // Burn fee
                    b(1),             // Reward fee
                    {
                        from: user,
                    }
                ),
                'The balance ratio should be greater than liquidation ratio'
            );
        });
        it('Should fail to create oracle if fee is above ratios delta', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Request a loan
            const modelData = await model.encodeData(
                b(2000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                oracle.address,   // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData         // Model data
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            await dai.setBalance(user, b(2499));
            await dai.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await tryCatchRevert(
                collateral.create(
                    debtId,           // Debt ID
                    oracle.address,   // Oracle address
                    b(2500),          // Token Amount
                    b(10599),         // Liquidation Ratio
                    b(10600),         // Balance ratio
                    b(9),             // Burn fee
                    b(1),             // Reward fee
                    {
                        from: user,
                    }
                ),
                'The fee should be less than the difference between balance ratio and liquidation ratio'
            );
        });
        // it('Should fail to create collateral if loan was canceled', async () => {
        //     // Create oracle and alt token
        //     const dai = await TestToken.new();
        //     const oracle = await TestRateOracle.new();
        //     await oracle.setToken(dai.address);

        //     // Request a loan
        //     const modelData = await model.encodeData(
        //         b(2000),
        //         MAX_UINT64
        //     );

        //     // Request loan
        //     const requestReceipt = await loanManager.requestLoan(
        //         b(1000),          // Requested amount
        //         model.address,    // Debt model
        //         oracle.address,   // Oracle
        //         user,             // Borrower
        //         address0x,        // Callback
        //         b(0),             // Salt
        //         MAX_UINT64,       // Expiration
        //         modelData         // Model data
        //     );

        //     const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

        //     // Cancel loan
        //     await loanManager.cancel(debtId);

        //     await dai.setBalance(user, b(2500));
        //     await dai.approve(collateral.address, b(2500), { from: user });

        //     // Create collateral entry
        //     await tryCatchRevert(
        //         collateral.create(
        //             debtId,           // Debt ID
        //             oracle.address,   // Oracle address
        //             b(2500),          // Token Amount
        //             b(10500),         // Liquidation Ratio
        //             b(10600),         // Balance ratio
        //             b(9),             // Burn fee
        //             b(1),             // Reward fee
        //             {
        //                 from: user,
        //             }
        //         ),
        //         'Debt request should be open'
        //     );
        // });
    });
    describe('Add Deposit to collateral', () => {
        it('Should add deposit to rcn collateral', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            // Deposit more RCN
            const entryId = b(1);
            await rcn.setBalance(user, b(100));
            await rcn.approve(collateral.address, b(100), { from: user });
            await collateral.deposit(entryId, b(100), { from: user });

            // Check balances
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(2600));
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(2600));
        });
        it('Should add deposit to rcn collateral, from another user', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            // Deposit more RCN
            const entryId = b(1);
            await rcn.setBalance(anotherUser, b(100));
            await rcn.approve(collateral.address, b(100), { from: anotherUser });
            await collateral.deposit(entryId, b(100), { from: anotherUser });

            // Check balances
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(2600));
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(2600));
        });
        it('Should add deposit to dai collateral, from another user', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);

            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            // Deposit more RCN
            const entryId = b(1);
            await dai.setBalance(anotherUser, b(100));
            await dai.approve(collateral.address, b(100), { from: anotherUser });
            await collateral.deposit(entryId, b(100), { from: anotherUser });

            // Check balances
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(2600));
            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(2600));
        });
    });
    describe('Fail Deposit to Collateral', () => {
        it('Should fail to deposit if user has no balance', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            // Deposit more RCN
            const entryId = b(1);
            await rcn.setBalance(user, b(99));
            await rcn.approve(collateral.address, b(100), { from: user });
            await tryCatchRevert(
                collateral.deposit(entryId, b(100), { from: user }),
                'Error pulling tokens'
            );

            // Check balances
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(2500));
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(2500));
        });
    });
    describe('Should withdraw collateral', () => {
        it('Should partial withdraw from a non lent loan', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);
            await collateral.withdraw(entryId, anotherUser, b(1000), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(1500));
            expect(await rcn.balanceOf(anotherUser)).to.eq.BN(b(1000));
            expect(await rcn.balanceOf(user)).to.eq.BN(b(0));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(1500));
        });
        it('Should total withdraw from a non lent loan', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);
            await collateral.withdraw(entryId, user, b(2500), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(0));
            expect(await rcn.balanceOf(user)).to.eq.BN(b(2500));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(0));
        });
        it('Should withdraw zero from a non lent loan', async () => {
            // Random non-existent ID
            const debtId = '0x1b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);
            await collateral.withdraw(entryId, user, b(0), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(2500));
            expect(await rcn.balanceOf(user)).to.eq.BN(b(0));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(2500));
        });
        it('Should withdraw rcn collateral from a lent loan without Oracle', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await collateral.withdraw(entryId, anotherUser, b(1000), [], { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(1500));
            expect(await rcn.balanceOf(user)).to.eq.BN(b(1000));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(1500));
        });
        it('Should withdraw collateral from a lent loan with Oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await collateral.withdraw(entryId, user, b(1750), [], { from: user });

            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(750));
            expect(await dai.balanceOf(user)).to.eq.BN(b(1750));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(750));
        });
        it('Should withdraw zero collateral from a lent loan with Oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await collateral.withdraw(entryId, user, b(0), [], { from: user });

            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(2500));
            expect(await dai.balanceOf(user)).to.eq.BN(b(0));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(2500));
        });
        it('Should withdraw token collateral from a lent loan with Oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // Create loan oracle
            const loanOracle = await TestRateOracle.new();
            await loanOracle.setEquivalent(b('4000000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),             // Requested amount
                model.address,       // Debt model
                loanOracle.address,  // Oracle
                user,                // Borrower
                address0x,           // Callback
                b(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(250));
            await rcn.approve(loanManager.address, b(250), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await collateral.withdraw(entryId, user, b(2312), [], { from: user });

            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(188));
            expect(await dai.balanceOf(user)).to.eq.BN(b(2312));
            const entry = await collateral.entries(entryId);
            expect(entry.amount).to.eq.BN(b(188));
        });
    });
    describe('Fail withdraw collateral', () => {
        it('Should fail to withdraw rcn collateral from a lent loan without Oracle, below liquidation ratio', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            expect(await loanManager.getCosigner(debtId)).to.be.equal(collateral.address);

            await tryCatchRevert(
                collateral.withdraw(entryId, anotherUser, b(1001), [], { from: user }),
                'Dont have collateral to withdraw'
            );
        });
        it('Should fail to withdraw rcn collateral from a lent loan with Oracle, below liquidation ratio', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request  loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await tryCatchRevert(
                collateral.withdraw(entryId, user, b(1751), [], { from: user }),
                'Dont have collateral to withdraw'
            );
        });
        it('Should fail to withdraw token collateral from a lent loan with Oracle, below liquidation ratio', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // Create loan oracle
            const loanOracle = await TestRateOracle.new();
            await loanOracle.setEquivalent(b('4000000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),             // Requested amount
                model.address,       // Debt model
                loanOracle.address,  // Oracle
                user,                // Borrower
                address0x,           // Callback
                b(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(250));
            await rcn.approve(loanManager.address, b(250), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            await tryCatchRevert(
                collateral.withdraw(entryId, user, b(2313), [], { from: user }),
                'Dont have collateral to withdraw'
            );
        });
    });
    describe('Redeem collateral', () => {
        it('Should redeem a non lent loan', async () => {
            // Random non-existent ID
            const debtId = '0x8b8086ead1ced389ee1840a086fe6cd914bad57f064d4e176b29a830685dfc0a';

            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });

            // Create collateral entry
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(10500),         // Liquidation Ratio
                b(10600),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Redeem entry
            await collateral.redeem(entryId, { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(0));
            expect(await rcn.balanceOf(user)).to.eq.BN(b(2500));

            // Inspect entry
            const entry = await collateral.entries(entryId);
            expect(entry.oracle).to.be.equal(address0x);
            expect(entry.token).to.be.equal(address0x);
            expect(entry.amount).to.eq.BN(b(0));
            expect(entry.liquidationRatio).to.eq.BN(b(0));
            expect(entry.balanceRatio).to.eq.BN(b(0));
            expect(entry.burnFee).to.eq.BN(b(0));
            expect(entry.rewardFee).to.eq.BN(b(0));
        });
        it('Should redeem a paid loan', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Pay loan
            await rcn.setBalance(user, b(1000));
            await rcn.approve(debtEngine.address, b(1000), { from: user });
            await debtEngine.pay(
                debtId,
                b(1000),
                user,
                [],
                {
                    from: user,
                }
            );

            // Redeem entry
            await collateral.redeem(entryId, { from: user });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(0));
            expect(await rcn.balanceOf(user)).to.eq.BN(b(2500));

            // Inspect entry
            const entry = await collateral.entries(entryId);
            expect(entry.oracle).to.be.equal(address0x);
            expect(entry.token).to.be.equal(address0x);
            expect(entry.amount).to.eq.BN(b(0));
            expect(entry.liquidationRatio).to.eq.BN(b(0));
            expect(entry.balanceRatio).to.eq.BN(b(0));
            expect(entry.burnFee).to.eq.BN(b(0));
            expect(entry.rewardFee).to.eq.BN(b(0));
        });
        it('Should emergency redeem a loan with an error', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Simulate an error
            await model.setErrorFlag(debtId, b(3), { from: owner });

            // Redeem entry
            await collateral.emergencyRedeem(entryId, anotherUser, { from: owner });

            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(0));
            expect(await rcn.balanceOf(anotherUser)).to.eq.BN(b(2500));

            // Inspect entry
            const entry = await collateral.entries(entryId);
            expect(entry.oracle).to.be.equal(address0x);
            expect(entry.token).to.be.equal(address0x);
            expect(entry.amount).to.eq.BN(b(0));
            expect(entry.liquidationRatio).to.eq.BN(b(0));
            expect(entry.balanceRatio).to.eq.BN(b(0));
            expect(entry.burnFee).to.eq.BN(b(0));
            expect(entry.rewardFee).to.eq.BN(b(0));
        });
    });
    describe('Fail redeem collateral', () => {
        it('Should fail to redeem if loan is not paid', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Redeem entry
            await tryCatchRevert(
                collateral.redeem(entryId, { from: user }),
                'Debt not request or paid'
            );
        });
        it('Should fail emergency redeem a loan if status is not error', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Redeem entry
            await tryCatchRevert(
                collateral.emergencyRedeem(entryId, anotherUser, { from: owner }),
                'Debt is not in error'
            );
        });
        it('Should fail emergency redeem a loan if caller is not the owner', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1000),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Simulate an error
            await model.setErrorFlag(debtId, b(3), { from: owner });

            // Redeem entry
            await tryCatchRevert(
                collateral.emergencyRedeem(entryId, anotherUser, { from: user }),
                'The owner should be the sender'
            );
        });
    });
    describe('Pay off debt', () => {
        it('Should pay debt using rcn collateral, without oracle', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1100),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),          // Requested amount
                model.address,    // Debt model
                address0x,        // Oracle
                user,             // Borrower
                address0x,        // Callback
                b(0),             // Salt
                MAX_UINT64,       // Expiration
                modelData,        // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Pay debt using RCN collateral
            await collateral.payOffDebt(entryId, [], { from: user });
            expect(await loanManager.getStatus(debtId)).to.eq.BN(b(2));

            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN(b(1100));
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(1400));
            const entry = await collateral.entries(b(1));
            expect(entry.amount).to.eq.BN(b(1400));
        });
        it('Should pay debt using rcn collateral, with loan oracle', async () => {
            // Request a loan
            const modelData = await model.encodeData(
                b(1100),
                MAX_UINT64
            );

            // Create loan oracle
            const loanOracle = await TestRateOracle.new();
            await loanOracle.setEquivalent(b('4000000000000000000'));

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),             // Requested amount
                model.address,       // Debt model
                loanOracle.address,  // Oracle
                user,                // Borrower
                address0x,           // Callback
                b(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await rcn.setBalance(user, b(2500));
            await rcn.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                address0x,        // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(250));
            await rcn.approve(loanManager.address, b(250), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Pay debt using RCN collateral
            await collateral.payOffDebt(entryId, [], { from: user });
            expect(await loanManager.getStatus(debtId)).to.eq.BN(b(2));

            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN(b(275));
            expect(await rcn.balanceOf(collateral.address)).to.eq.BN(b(2225));
            const entry = await collateral.entries(b(1));
            expect(entry.amount).to.eq.BN(b(2225));
        });
        it('Should pay debt using token collateral, without loan oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // configure converter
            await rcn.setBalance(converter.address, b(2).pow(b(64)));
            await dai.setBalance(converter.address, b(2).pow(b(64)));
            await converter.setRate(dai.address, rcn.address, b('2000000000000000000'));
            await converter.setRate(rcn.address, dai.address, b('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1100),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),             // Requested amount
                model.address,       // Debt model
                address0x,           // Oracle
                user,                // Borrower
                address0x,           // Callback
                b(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Pay debt using RCN collateral
            await collateral.payOffDebt(entryId, [], { from: user });
            expect(await loanManager.getStatus(debtId)).to.eq.BN(b(2));

            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN(b(1100));
            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(1950));
            const entry = await collateral.entries(b(1));
            expect(entry.amount).to.eq.BN(b(1950));
        });
        it('Should pay debt using token collateral, with loan oracle', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // Create loan oracle
            const loanOracle = await TestRateOracle.new();
            await loanOracle.setEquivalent(b('4000000000000000000'));

            // configure converter
            await rcn.setBalance(converter.address, b(2).pow(b(64)));
            await dai.setBalance(converter.address, b(2).pow(b(64)));
            await converter.setRate(dai.address, rcn.address, b('2000000000000000000'));
            await converter.setRate(rcn.address, dai.address, b('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1100),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),             // Requested amount
                model.address,       // Debt model
                loanOracle.address,  // Oracle
                user,                // Borrower
                address0x,           // Callback
                b(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Pay debt using RCN collateral
            await collateral.payOffDebt(entryId, [], { from: user });
            expect(await loanManager.getStatus(debtId)).to.eq.BN(b(2));

            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN(b(275));
            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(2362));
            const entry = await collateral.entries(b(1));
            expect(entry.amount).to.eq.BN(b(2362));
        });
        it('Should pay debt using token collateral, without loan oracle, using all the collateral', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // configure converter
            await rcn.setBalance(converter.address, b(2).pow(b(64)));
            await dai.setBalance(converter.address, b(2).pow(b(64)));
            await converter.setRate(dai.address, rcn.address, b('2000000000000000000'));
            await converter.setRate(rcn.address, dai.address, b('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1100),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),             // Requested amount
                model.address,       // Debt model
                address0x,           // Oracle
                user,                // Borrower
                address0x,           // Callback
                b(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Increase the debt a lot
            await model.setTotal(debtId, b(100000), { from: owner });

            // Pay debt using RCN collateral
            await collateral.payOffDebt(entryId, [], { from: user });
            expect(await loanManager.getStatus(debtId)).to.eq.BN(b(1));

            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN(b(5000));
            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(0));
            const entry = await collateral.entries(b(1));
            expect(entry.amount).to.eq.BN(b(0));
        });
        it('Should pay debt using token collateral, with loan oracle, using all the collateral', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // Create loan oracle
            const loanOracle = await TestRateOracle.new();
            await loanOracle.setEquivalent(b('4000000000000000000'));

            // configure converter
            await rcn.setBalance(converter.address, b(2).pow(b(64)));
            await dai.setBalance(converter.address, b(2).pow(b(64)));
            await converter.setRate(dai.address, rcn.address, b('2000000000000000000'));
            await converter.setRate(rcn.address, dai.address, b('500000000000000000'));

            // Request a loan
            const modelData = await model.encodeData(
                b(1100),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),             // Requested amount
                model.address,       // Debt model
                loanOracle.address,  // Oracle
                user,                // Borrower
                address0x,           // Callback
                b(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Increase the debt a lot
            await model.setTotal(debtId, b(100000), { from: owner });

            // Pay debt using RCN collateral
            await collateral.payOffDebt(entryId, [], { from: user });
            expect(await loanManager.getStatus(debtId)).to.eq.BN(b(1));

            expect(await rcn.balanceOf(debtEngine.address)).to.eq.BN(b(5000));
            expect(await dai.balanceOf(collateral.address)).to.eq.BN(b(0));
            const entry = await collateral.entries(b(1));
            expect(entry.amount).to.eq.BN(b(0));
        });
    });
    describe('Fail payoff debt', () => {
        it('Should fail payoff debt if converter rate is off', async () => {
            // Create oracle and alt token
            const dai = await TestToken.new();
            const oracle = await TestRateOracle.new();
            await oracle.setToken(dai.address);
            await oracle.setEquivalent(b('500000000000000000'));

            // configure converter
            await rcn.setBalance(converter.address, b(2).pow(b(64)));
            await dai.setBalance(converter.address, b(2).pow(b(64)));
            await converter.setRate(dai.address, rcn.address, b('2500000000000000000'));
            await converter.setRate(rcn.address, dai.address, b('600000000000000000'));
            await collateral.setMaxSpreadRatio(dai.address, b(10000), { from: owner });

            // Request a loan
            const modelData = await model.encodeData(
                b(1100),
                MAX_UINT64
            );

            // Request loan
            const requestReceipt = await loanManager.requestLoan(
                b(1000),             // Requested amount
                model.address,       // Debt model
                address0x,           // Oracle
                user,                // Borrower
                address0x,           // Callback
                b(0),                // Salt
                MAX_UINT64,          // Expiration
                modelData,           // Model data
                {
                    from: user,
                }
            );

            const debtId = requestReceipt.receipt.logs.find((e) => e.event === 'Requested').args._id;

            // Create collateral entry
            await dai.setBalance(user, b(2500));
            await dai.approve(collateral.address, b(2500), { from: user });
            await collateral.create(
                debtId,           // Debt ID
                oracle.address,   // Oracle address
                b(2500),          // Token Amount
                b(12000),         // Liquidation Ratio
                b(15000),         // Balance ratio
                b(9),             // Burn fee
                b(1),             // Reward fee
                {
                    from: user,
                }
            );

            const entryId = b(1);

            // Lend loan
            await rcn.setBalance(anotherUser, b(1000));
            await rcn.approve(loanManager.address, b(1000), { from: anotherUser });
            await loanManager.lend(
                debtId,             // Debt ID
                [],                 // Oracle data
                collateral.address, // Collateral cosigner
                b(0),               // Cosigner limit
                toBytes32(entryId), // Cosigner data
                [],                 // Callback data
                {
                    from: anotherUser,
                }
            );

            // Pay debt using RCN collateral
            await tryCatchRevert(
                collateral.payOffDebt(entryId, [], { from: user }),
                'converter return below minimun required'
            );
        });
    });
});
