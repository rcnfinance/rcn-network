const InstallmentsDebtModel = artifacts.require('./diaspore/model/InstallmentsModel.sol');
const ModelDescriptor = artifacts.require('./diaspore/interfaces/ModelDescriptor.sol');
const Helper = require('../Helper.js');

const BN = web3.utils.BN;

function bn (number) {
    return new BN(number);
}

contract('Installments model', function (accounts) {
    let model;
    const secInDay = 86400;
    const secInMonth = secInDay * 30;
    const secInYear = secInMonth * 12;

    async function ping () {
        try {
            await model.transferTo(await model.owner());
        } catch (ignored) {}
    }

    before('Create the model', async function () {
        model = await InstallmentsDebtModel.new();
        await model.transferTo(accounts[1]);
        await model.setEngine(accounts[0], { from: accounts[1] });
    });

    it('Should fail loans with same id', async function () {
        const id = Helper.toBytes32(7);
        const data = await model.encodeData(
            110,
            Helper.toInterestRate(240),
            10,
            secInMonth,
            1
        );
        await model.create(id, data);
        await Helper.assertThrow(model.create(id, data));
    });

    it('Test pay debt in advance, partially', async function () {
        const id = Helper.toBytes32(6);
        const data = await model.encodeData(
            110,
            Helper.toInterestRate(240),
            10,
            secInMonth,
            1
        );

        assert.isTrue(await model.validate(data), 'Registry data should be valid');

        await model.create(id, data);

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '0', 'First obligation should be 0');
        assert.equal((await model.getDueTime(id)), bn((await Helper.getBlockTime()).toString()).add(bn(secInMonth.toString())).toString(), 'Next due time should be in 1 installments');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '110', 'Obligation on due time should be 110');
        assert.equal((await model.getObligation(id, await model.getDueTime(id) - 1))[0], '0', 'Obligation before due time should be 0');

        await model.addPaid(id, 330);

        assert.equal(await model.getPaid(id), 330, 'Paid amount should be 330');
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], 0, 'Current obligation should be 0');
        await Helper.almostEqual(model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth, 'Next due time should be in 4 installments');
    });

    it('Test pay in advance', async function () {
        const id = Helper.toBytes32(3);
        const data = await model.encodeData(
            110,
            Helper.toInterestRate(240),
            10,
            secInMonth,
            1
        );

        await model.create(id, data);
        await model.addPaid(id, 4000);

        assert.equal(await model.getStatus(id), '2', 'Status should be paid');
        assert.equal(await model.getPaid(id), '1100', 'Paid should be cuota * installments');
    });

    it('Test pay single installment', async function () {
        const id = Helper.toBytes32(2);
        const data = await model.encodeData(
            web3.utils.toWei('110'),
            Helper.toInterestRate(20),
            1,
            secInYear,
            1
        );

        await model.create(id, data);

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '0', 'First obligation should be 0');
        assert.equal((await model.getDueTime(id)), await Helper.getBlockTime() + secInYear, 'Next due time should be in 1 installments');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], web3.utils.toWei('110'), 'Obligation on due time should be 110');
        assert.equal((await model.getObligation(id, await model.getDueTime(id) - 1))[0], '0', 'Obligation before due time should be 0');

        await model.addPaid(id, web3.utils.toWei('110'));

        assert.equal(await model.getStatus(id), '2', 'Status should be paid');
        assert.equal(await model.getPaid(id), web3.utils.toWei('110'), 'Paid should be cuota * installments');
    });

    it('It should handle a loan with more than a installment', async function () {
        const id = Helper.toBytes32(900);
        const data = await model.encodeData(
            300,
            Helper.toInterestRate(240),
            3,
            secInMonth,
            secInDay
        );

        await model.create(id, data);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '0', 'First obligation should be 0');
        await Helper.almostEqual((await model.getDueTime(id)), await Helper.getBlockTime() + secInMonth, 'Next due time should be in 1 installments');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '300', 'Obligation on due time should be 300');
        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);

        await model.addPaid(id, 110);

        assert.equal(await model.getPaid(id), '110');
        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual(model.getDueTime(id), await Helper.getBlockTime() + secInMonth, 'Next due time should be in 1 installments');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '190', 'Obligation on due time should be 300 - paid');

        await model.addPaid(id, 200);

        assert.equal(await model.getPaid(id), 310);
        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual((await model.getDueTime(id)), await Helper.getBlockTime() + 2 * secInMonth, 'Next due time should be in 2 installments');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '290', 'Obligation on due time should be 300 - paid');

        await Helper.increaseTime(50 * secInDay);
        await model.run(id);
        await Helper.increaseTime(5 * secInDay);

        await model.addPaid(id, 1000);
        assert.equal(await model.getStatus(id), '2');
        assert.equal(await model.getPaid(id), '900');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '0');
    });

    it('It should handle a loan with more than a installment in advance, totally', async function () {
        const id = Helper.toBytes32(901);
        const data = await model.encodeData(
            110,
            Helper.toInterestRate(240),
            10,
            secInMonth,
            1
        );

        await model.create(id, data);

        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '110');
        assert.equal(await model.getClosingObligation(id), '1100');

        await model.addPaid(id, 4000);

        assert.equal(await model.getStatus(id), '2');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '0');
        assert.equal(await model.getClosingObligation(id), 0);
        assert.equal(await model.getPaid(id), '1100');
    });

    it('It should handle a loan with more than a installment in advance, partially', async function () {
        const id = Helper.toBytes32(902);
        const data = await model.encodeData(
            110,
            Helper.toInterestRate(240),
            10,
            secInMonth,
            secInDay
        );

        await model.create(id, data);

        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '110');
        assert.equal(await model.getClosingObligation(id), '1100');

        await model.addPaid(id, 330);

        assert.equal(await model.getPaid(id), '330');
        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '110');

        await model.addPaid(id, 150);

        assert.equal(await model.getPaid(id), 330 + 150);
        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '70');

        await model.addPaid(id, 4000);

        assert.equal(await model.getPaid(id), '1100');
        assert.equal(await model.getStatus(id), '2');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 10 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '0');
    });

    it('It should calculate the interest like the test doc test 1', async function () {
        const id = Helper.toBytes32(904);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            secInDay
        );

        await model.create(id, data);

        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');
        assert.equal(await model.getClosingObligation(id), bn('99963').mul(bn('12')).toString());

        // Pay the full next installment in a couple of days
        await Helper.increaseTime(2 * secInDay);
        await model.run(id);
        await Helper.increaseTime(5 * secInDay);
        await model.run(id);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');
        assert.equal(await model.getPaid(id), 99963);

        // Wait a month and a week
        await Helper.increaseTime((30 + 7) * secInDay);

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Wait a month
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Wait to the next payment, exactly
        await Helper.increaseTime(secInMonth);

        // Wait to the next payment, exactly
        await Helper.increaseTime(16 * secInDay);

        // Past the payment date by 5 days
        await Helper.increaseTime(5 * secInDay);

        await model.run(id);

        // Ping contract
        await model.setEngine(accounts[0], { from: accounts[1] });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * secInDay, '', 5);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '100691');

        await model.addPaid(id, 100691);

        assert.equal(await model.getPaid(id), bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')).toString());
        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
    });

    it('It should calculate the interest like the test doc test 1 - alt run', async function () {
        const id = Helper.toBytes32(905);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');
        assert.equal(await model.getClosingObligation(id), bn('99963').mul(bn('12')).toString());

        // Pay the full next installment in a couple of days
        await Helper.increaseTime(2 * secInDay);
        await model.run(id);
        await Helper.increaseTime(5 * secInDay);
        await model.run(id);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');
        assert.equal(await model.getPaid(id), 99963);

        // Wait a month and a week
        await Helper.increaseTime((30 + 7) * secInDay);

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Wait a month
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Wait to the next payment, exactly
        await Helper.increaseTime(secInMonth);

        // Wait to the next payment, exactly
        await Helper.increaseTime(16 * secInDay);

        await model.run(id);

        // Past the payment date by 5 days
        await Helper.increaseTime(5 * secInDay);

        // Ping contract
        await model.setEngine(accounts[0], { from: accounts[1] });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * secInDay, '', 5);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '100691');

        await model.addPaid(id, 100691);

        assert.equal(await model.getPaid(id), bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')).toString());
        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
    });

    it('It should calculate the interest like the test doc test 1 - alt run 2', async function () {
        const id = Helper.toBytes32(906);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            secInDay
        );

        await model.create(id, data);

        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');
        assert.equal(await model.getClosingObligation(id), bn('99963').mul(bn('12')).toString());

        // Pay the full next installment in a couple of days
        await Helper.increaseTime(2 * secInDay);
        await model.run(id);
        await Helper.increaseTime(5 * secInDay);

        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');
        assert.equal(await model.getPaid(id), 99963);

        // Wait a month and a week
        await Helper.increaseTime((30 + 7) * secInDay);

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Wait a month
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 99963);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Wait to the next payment, exactly
        await Helper.increaseTime(secInMonth);

        await model.run(id);

        // Wait to the next payment, exactly
        await Helper.increaseTime(16 * secInDay);

        // Past the payment date by 5 days
        await Helper.increaseTime(5 * secInDay);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * secInDay, '', 5);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '100691');

        await model.addPaid(id, 100691);

        assert.equal(await model.getPaid(id), bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')).toString());
        assert.equal(await model.getStatus(id), Helper.STATUS_ONGOING);
    });

    it('It should calculate the interest like the test doc test 3', async function () {
        const id = Helper.toBytes32(907);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            secInDay
        );

        await model.create(id, data);

        await model.addPaid(id, 99963 * 3);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Pass 4 months to the next loan expire time
        await Helper.increaseTime(4 * secInMonth);

        // Pass 12 days from the due date
        await Helper.increaseTime(12 * secInDay);
        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * secInDay);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '101712');

        await model.addPaid(id, 101712);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * secInDay);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '0');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Advance to the next month
        await Helper.increaseTime(18 * secInDay);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 250000);

        // Advance to the next month
        await Helper.increaseTime(secInMonth);
        await ping();

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '165727');

        await model.addPaid(id, web3.utils.toWei('1'));
        assert.equal(await model.getPaid(id), '1217180');
        assert.equal(await model.getStatus(id), '2');
    });

    it('It should calculate the interest like the test doc test 3 - alt run 1', async function () {
        const id = Helper.toBytes32(908);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        await model.addPaid(id, 99963 * 3);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Pass 4 months to the next loan expire time
        await Helper.increaseTime(2 * secInMonth);
        await model.run(id);
        await Helper.increaseTime(2 * secInMonth);

        // Pass 12 days from the due date
        await Helper.increaseTime(12 * secInDay);
        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * secInDay);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '101712');

        await model.addPaid(id, 101712);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * secInDay);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '0');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Advance to the next month
        await Helper.increaseTime(18 * secInDay);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        await model.run(id);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 250000);

        // Advance to the next month
        await Helper.increaseTime(secInMonth);
        await ping();

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '165727');

        await model.addPaid(id, web3.utils.toWei('1'));
        assert.equal(await model.getPaid(id), '1217180');
        assert.equal(await model.getStatus(id), '2');
    });

    it('It should calculate the interest like the test doc test 3 - alt run 2', async function () {
        const id = Helper.toBytes32(909);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        await model.addPaid(id, 99963 * 3);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Pass 4 months to the next loan expire time
        await Helper.increaseTime(2 * secInMonth - 2);
        await model.run(id);
        await Helper.increaseTime(2 * secInMonth + 2);

        // Pass 12 days from the due date
        await Helper.increaseTime(12 * secInDay);
        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * secInDay);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '101712');

        await model.addPaid(id, 101712);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * secInDay);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '0');
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        // Advance to the next month
        await Helper.increaseTime(18 * secInDay);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        await model.run(id);

        // And to the next...
        await Helper.increaseTime(29 * secInDay + 10);
        await model.run(id);
        await Helper.increaseTime(secInDay - 10);

        await model.addPaid(id, 250000);

        // Advance to the next month
        await Helper.increaseTime(secInMonth);
        await ping();

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '165727');

        await model.addPaid(id, web3.utils.toWei('1'));
        assert.equal(await model.getPaid(id), '1217180');
        assert.equal(await model.getStatus(id), '2');
    });

    it('It should calculate the interest like the test doc test 4', async function () {
        const id = Helper.toBytes32(910);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        assert.equal(await model.getPaid(id), 99963 * 4, 'Paid should be the amount of 3 installments');

        // Lets stop the payments
        // Advance 4 months and take a look
        await Helper.increaseTime((4 + 4) * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 3 * secInMonth);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '426091');

        // Advance the last 4 months
        await Helper.increaseTime(4 * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 7 * secInMonth);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '922155');
        assert.equal(await model.getStatus(id), 1, 'Loan should be ongoing');
    });

    it('It should calculate the interest like the test doc test 4 - alt run 1', async function () {
        const id = Helper.toBytes32(911);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        assert.equal(await model.getPaid(id), 99963 * 4, 'Paid should be the amount of 3 installments');

        // Lets stop the payments
        // Advance 4 months and take a look
        await Helper.increaseTime((4 + 4) * secInMonth);

        await model.run(id);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 3 * secInMonth);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '426091');

        // Advance the last 4 months
        await Helper.increaseTime(4 * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 7 * secInMonth);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '922155');
        assert.equal(await model.getStatus(id), 1, 'Loan should be ongoing');
    });

    it('It should calculate the interest like the test doc test 4 - alt run 2', async function () {
        const id = Helper.toBytes32(912);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        assert.equal(await model.getPaid(id), 99963 * 4, 'Paid should be the amount of 3 installments');

        // Lets stop the payments
        // Advance 4 months and take a look
        await Helper.increaseTime((4 + 4) * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 3 * secInMonth);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '426091');

        // Advance the last 4 months
        await Helper.increaseTime(4 * secInMonth);

        await model.run(id);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 7 * secInMonth);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '922155');
        assert.equal(await model.getStatus(id), 1, 'Loan should be ongoing');
    });

    it('It should calculate the interest like the test doc test 4 - alt run 3', async function () {
        const id = Helper.toBytes32(1913);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4);

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        assert.equal((await model.getObligation(id, await model.getDueTime(id)))[0], '99963');

        assert.equal(await model.getPaid(id), 99963 * 4, 'Paid should be the amount of 3 installments');

        // Lets stop the payments
        // Advance 4 months and take a look
        await Helper.increaseTime((4 + 4) * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 3 * secInMonth);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '426091');

        // Advance the last 4 months
        await Helper.increaseTime(1 * secInMonth);
        await ping();
        await model.fixClock(id, (await Helper.getBlockTime()) - 15 * secInDay);
        await Helper.increaseTime(3 * secInMonth);
        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 7 * secInMonth);
        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '922154');
        assert.equal(await model.getStatus(id), 1, 'Loan should be ongoing');
    });

    it('fixclock should fail if called ahead of current time', async function () {
        const id = Helper.toBytes32(1914);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        // Pay the next 4 months in advance
        await model.addPaid(id, bn('99963').mul(bn('4')));

        await Helper.tryCatchRevert(
            model.fixClock(id, (await Helper.getBlockTime()) + secInYear),
            'Forbidden advance clock into the future'
        );
    });

    it('fixclock should fail if called before lend clock', async function () {
        const id = Helper.toBytes32(1915);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4);

        await Helper.tryCatchRevert(
            model.fixClock(id, await Helper.getBlockTime() - 10),
            'Clock can\'t go negative'
        );
    });

    it('fixclock should fail if called before current clock', async function () {
        const id = Helper.toBytes32(1919);
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        await model.create(id, data);

        await Helper.increaseTime(secInMonth);
        await model.addPaid(id, 99963 * 4);

        await Helper.tryCatchRevert(
            model.fixClock(id, await Helper.getBlockTime() - 10),
            'Clock is ahead of target'
        );
    });

    it('Should ignored periods of time under the time unit', async function () {
        const id = Helper.toBytes32(913);
        const data = await model.encodeData(
            10000,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            secInDay * 2
        );

        await model.create(id, data);

        await Helper.increaseTime(31 * secInDay);

        await ping();

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '10000');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - secInDay);

        await model.run(id);

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '10000');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - secInDay);

        await Helper.increaseTime(3 * secInDay);

        await ping();

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '10058');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 4 * secInDay);

        await model.run(id);

        assert.equal((await model.getObligation(id, await Helper.getBlockTime()))[0], '10058');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 4 * secInDay);
    });

    it('It should provide information with the descriptor', async function () {
        const data = await model.encodeData(
            99963,
            Helper.toInterestRate(35 * 1.5),
            12,
            secInMonth,
            1
        );

        const descriptor = await ModelDescriptor.at(await model.descriptor());

        assert.equal((await descriptor.simFirstObligation(data))[0], '99963');
        assert.equal((await descriptor.simFirstObligation(data))[1], secInMonth);
        assert.equal(await descriptor.simDuration(data), bn('12').mul(bn(secInMonth.toString())).toString());
        assert.equal(await descriptor.simPunitiveInterestRate(data), Helper.toInterestRate(35 * 1.5));
        assert.equal(await descriptor.simFrequency(data), secInMonth);
        assert.equal(await descriptor.simInstallments(data), '12');
    });
});
