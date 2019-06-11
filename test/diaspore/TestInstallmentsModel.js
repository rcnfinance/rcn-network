const InstallmentsDebtModel = artifacts.require('./diaspore/model/InstallmentsModel.sol');
const ModelDescriptor = artifacts.require('./diaspore/interfaces/ModelDescriptor.sol');

const Helper = require('../Helper.js');
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn (number) {
    return new BN(number);
}

contract('Installments model test', function (accounts) {
    let model;
    // Accounts
    const accountEngine = accounts[1];
    const owner = accounts[2];
    const creator = accounts[3];

    const secInDay = 86400;
    const secInMonth = secInDay * 30;
    const secInYear = secInMonth * 12;

    async function ping () {
        try {
            await model.transferOwnership(await model.owner());
        } catch (ignored) {}
    }

    before('Create the model', async function () {
        model = await InstallmentsDebtModel.new({ from: owner });
        await model.setEngine(accountEngine, { from: owner });
    });

    it('Function setEngine', async function () {
        const auxModel = await InstallmentsDebtModel.new({ from: owner });

        assert.equal(await auxModel.engine(), Helper.address0x);

        const engine = web3.utils.toChecksumAddress(web3.utils.randomHex(20));

        const _setEngine = await Helper.toEvents(
            auxModel.setEngine(
                engine,
                { from: owner }
            ),
            '_setEngine'
        );
        assert.equal(_setEngine._engine, engine);

        assert.equal(await auxModel.engine(), engine);
    });

    it('Function validate', async function () {
        let data;

        data = await model.encodeData(
            1, // cuota
            2, // interestRate
            1, // installments
            1, // duration
            1 // timeUnit
        );
        assert.isTrue(await model.validate(data));

        // Try validate:
        // a wrong data length
        data = await model.encodeData(
            1, // cuota
            2, // interestRate
            1, // installments
            1, // duration
            1 // timeUnit
        );

        await Helper.tryCatchRevert(
            () => model.validate(
                data.slice(0, -2)
            ),
            'Invalid data length'
        );

        await Helper.tryCatchRevert(
            () => model.validate(
                data + '00'
            ),
            'Invalid data length'
        );

        // a data with cuota equal 0
        data = await model.encodeData(
            0, // cuota
            2, // interestRate
            1, // installments
            1, // duration
            1 // timeUnit
        );
        await Helper.tryCatchRevert(
            () => model.validate(
                data
            ),
            'Cuota can\'t be 0'
        );

        // a data with installments equal 0
        data = await model.encodeData(
            1, // cuota
            2, // interestRate
            0, // installments
            1, // duration
            1 // timeUnit
        );
        await Helper.tryCatchRevert(
            () => model.validate(
                data
            ),
            'Installments can\'t be 0'
        );

        // a data with timeUnit equal 0
        data = await model.encodeData(
            1, // cuota
            2, // interestRate
            1, // installments
            1, // duration
            0 // timeUnit
        );
        await Helper.tryCatchRevert(
            () => model.validate(
                data
            ),
            'Time unit can\'t be 0'
        );

        // a data with timeUnit lower than duration
        data = await model.encodeData(
            1, // cuota
            2, // interestRate
            1, // installments
            0, // duration
            1 // timeUnit
        );
        await Helper.tryCatchRevert(
            () => model.validate(
                data
            ),
            'Time unit must be lower or equal than installment duration'
        );

        // a data with timeUnit equal to interestRate
        data = await model.encodeData(
            1, // cuota
            1, // interestRate
            1, // installments
            1, // duration
            1 // timeUnit
        );
        await Helper.tryCatchRevert(
            () => model.validate(
                data
            ),
            'Interest rate by time unit is too low'
        );
    });

    it('Function modelId', async function () {
        const nameModel = 'InstallmentsModel A 0.0.2';
        const calcModelId = web3.utils.toTwosComplement(web3.utils.asciiToHex(nameModel));
        assert.equal(await model.modelId(), calcModelId);

        const modelId = 0x00000000000000496e7374616c6c6d656e74734d6f64656c204120302e302e32;
        assert.equal(await model.modelId(), modelId);
    });

    describe('Functions onlyOwner', function () {
        it('Function setDescriptor', async function () {
            await Helper.tryCatchRevert(
                () => model.setDescriptor(
                    web3.utils.randomHex(20),
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });

        it('Function setEngine', async function () {
            await Helper.tryCatchRevert(
                () => model.setEngine(
                    web3.utils.randomHex(20),
                    { from: creator }
                ),
                'The owner should be the sender'
            );
        });
    });

    describe('Functions onlyEngine', function () {
        it('Function create', async function () {
            await Helper.tryCatchRevert(
                () => model.create(
                    Helper.bytes320x,
                    [],
                    { from: creator }
                ),
                'Only engine allowed'
            );
        });

        it('Function addPaid', async function () {
            await Helper.tryCatchRevert(
                () => model.addPaid(
                    Helper.bytes320x,
                    1,
                    { from: creator }
                ),
                'Only engine allowed'
            );
        });

        it('Function addDebt', async function () {
            await Helper.tryCatchRevert(
                () => model.addDebt(
                    Helper.bytes320x,
                    1,
                    { from: creator }
                ),
                'Only engine allowed'
            );
        });
    });

    describe('Functions setDescriptor, descriptor and ModelDescriptor interface functions', function () {
        it('Change descriptor', async function () {
            const auxModel = await InstallmentsDebtModel.new({ from: owner });

            assert.equal(await auxModel.descriptor(), auxModel.address);

            const descriptor = web3.utils.toChecksumAddress(web3.utils.randomHex(20));

            const _setDescriptor = await Helper.toEvents(
                auxModel.setDescriptor(
                    descriptor,
                    { from: owner }
                ),
                '_setDescriptor'
            );

            assert.equal(_setDescriptor._descriptor, descriptor);

            assert.equal(await auxModel.descriptor(), descriptor);
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

            expect((await descriptor.simFirstObligation(data))[0]).to.eq.BN('99963');
            expect((await descriptor.simFirstObligation(data))[1]).to.eq.BN(secInMonth);
            expect(await descriptor.simDuration(data)).to.eq.BN(bn('12').mul(bn(secInMonth.toString())));
            expect(await descriptor.simPunitiveInterestRate(data)).to.eq.BN(Helper.toInterestRate(35 * 1.5));
            expect(await descriptor.simFrequency(data)).to.eq.BN(secInMonth);
            expect(await descriptor.simInstallments(data)).to.eq.BN('12');
        });
    });

    describe('Functions create', function () {
        it('Create a loan', async function () {
            const id = web3.utils.randomHex(32);
            const cuota = bn(110);
            const interestRate = bn(Helper.toInterestRate(240));
            const installments = bn(10);
            const duration = bn(secInMonth);
            const timeUnit = bn(1);
            const data = await model.encodeData(
                cuota,
                interestRate,
                installments,
                duration,
                timeUnit
            );

            const events = await Helper.toEvents(
                model.create(
                    id,
                    data,
                    { from: accountEngine }
                ),
                'Created',
                '_setClock'
            );

            const Created = events[0];
            assert.equal(Created._id, id);

            const _setClock = events[1];
            assert.equal(_setClock._id, id);
            assert.equal(_setClock._to, secInMonth);

            const configs = await model.configs(id);
            expect(configs.installments).to.eq.BN(installments);
            expect(configs.timeUnit).to.eq.BN(timeUnit);
            expect(configs.duration).to.eq.BN(duration);
            expect(configs.lentTime).to.eq.BN(bn(await Helper.getBlockTime()));
            expect(configs.cuota).to.eq.BN(cuota);
            expect(configs.interestRate).to.eq.BN(interestRate);

            const states = await model.states(id);
            expect(states.clock).to.eq.BN(duration);
        });

        it('Try create two loans with the same id', async function () {
            const id = web3.utils.randomHex(32);
            const data = await model.encodeData(
                110,
                Helper.toInterestRate(240),
                10,
                secInMonth,
                1
            );
            await model.create(id, data, { from: accountEngine });

            await Helper.tryCatchRevert(
                () => model.create(
                    id,
                    data,
                    { from: accountEngine }
                ),
                'Entry already exist'
            );
        });
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

        await model.create(id, data, { from: accountEngine });

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('0', 'First obligation should be 0');
        expect(await model.getDueTime(id)).to.eq.BN(await Helper.getBlockTime() + secInMonth, 'Next due time should be in 1 installments');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('110', 'Obligation on due time should be 110');
        expect((await model.getObligation(id, (await model.getDueTime(id)).sub(bn('1'))))[0]).to.eq.BN('0', 'Obligation before due time should be 0');

        await model.addPaid(id, 330, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN('330', 'Paid amount should be 330');
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('0', 'Current obligation should be 0');
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

        await model.create(id, data, { from: accountEngine });
        await model.addPaid(id, 4000, { from: accountEngine });

        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_PAID, 'Status should be paid');
        expect(await model.getPaid(id)).to.eq.BN('1100', 'Paid should be cuota * installments');
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

        await model.create(id, data, { from: accountEngine });

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('0', 'First obligation should be 0');
        expect(await model.getDueTime(id)).to.eq.BN(await Helper.getBlockTime() + secInYear, 'Next due time should be in 1 installments');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN(web3.utils.toWei('110'), 'Obligation on due time should be 110');
        expect((await model.getObligation(id, await model.getDueTime(id) - 1))[0]).to.eq.BN('0', 'Obligation before due time should be 0');

        await model.addPaid(id, web3.utils.toWei('110'), { from: accountEngine });

        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_PAID, 'Status should be paid');
        expect(await model.getPaid(id)).to.eq.BN(web3.utils.toWei('110'), 'Paid should be cuota * installments');
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

        await model.create(id, data, { from: accountEngine });
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('0', 'First obligation should be 0');
        await Helper.almostEqual((await model.getDueTime(id)), await Helper.getBlockTime() + secInMonth, 'Next due time should be in 1 installments');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('300', 'Obligation on due time should be 300');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);

        await model.addPaid(id, 110, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN('110');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual(model.getDueTime(id), await Helper.getBlockTime() + secInMonth, 'Next due time should be in 1 installments');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('190', 'Obligation on due time should be 300 - paid');

        await model.addPaid(id, 200, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN('310');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual((await model.getDueTime(id)), await Helper.getBlockTime() + 2 * secInMonth, 'Next due time should be in 2 installments');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('290', 'Obligation on due time should be 300 - paid');

        await Helper.increaseTime(50 * secInDay);
        await model.run(id, { from: accountEngine });
        await Helper.increaseTime(5 * secInDay);

        await model.addPaid(id, 1000, { from: accountEngine });
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_PAID);
        expect(await model.getPaid(id)).to.eq.BN('900');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('0');
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

        await model.create(id, data, { from: accountEngine });

        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('110');
        expect(await model.getClosingObligation(id)).to.eq.BN('1100');

        await model.addPaid(id, 4000, { from: accountEngine });

        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_PAID);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('0');
        expect(await model.getClosingObligation(id)).to.eq.BN('0');
        expect(await model.getPaid(id)).to.eq.BN('1100');
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

        await model.create(id, data, { from: accountEngine });

        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('110');
        expect(await model.getClosingObligation(id)).to.eq.BN('1100');

        await model.addPaid(id, 330, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN('330');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('110');

        await model.addPaid(id, 150, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN('480');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('70');

        await model.addPaid(id, 4000, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN('1100');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_PAID);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 10 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('0');
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

        await model.create(id, data, { from: accountEngine });

        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');
        expect(await model.getClosingObligation(id)).to.eq.BN(bn('99963').mul(bn('12')));

        // Pay the full next installment in a couple of days
        await Helper.increaseTime(2 * secInDay);
        await model.run(id, { from: accountEngine });
        await Helper.increaseTime(5 * secInDay);
        await model.run(id, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');
        expect(await model.getPaid(id)).to.eq.BN('99963');

        // Wait a month and a week
        await Helper.increaseTime((30 + 7) * secInDay);

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Wait a month
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Wait to the next payment, exactly
        await Helper.increaseTime(secInMonth);

        // Wait to the next payment, exactly
        await Helper.increaseTime(16 * secInDay);

        // Past the payment date by 5 days
        await Helper.increaseTime(5 * secInDay);

        await model.run(id, { from: accountEngine });

        // Ping contract
        await model.setEngine(accountEngine, { from: owner });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * secInDay, '', 5);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('100691');

        await model.addPaid(id, 100691, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN(bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')));
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
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

        await model.create(id, data, { from: accountEngine });

        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');
        expect(await model.getClosingObligation(id)).to.eq.BN(bn('99963').mul(bn('12')));

        // Pay the full next installment in a couple of days
        await Helper.increaseTime(2 * secInDay);
        await model.run(id, { from: accountEngine });
        await Helper.increaseTime(5 * secInDay);
        await model.run(id, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');
        expect(await model.getPaid(id)).to.eq.BN('99963');

        // Wait a month and a week
        await Helper.increaseTime((30 + 7) * secInDay);

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Wait a month
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Wait to the next payment, exactly
        await Helper.increaseTime(secInMonth);

        // Wait to the next payment, exactly
        await Helper.increaseTime(16 * secInDay);

        await model.run(id, { from: accountEngine });

        // Past the payment date by 5 days
        await Helper.increaseTime(5 * secInDay);

        // Ping contract
        await model.setEngine(accountEngine, { from: owner });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * secInDay, '', 5);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('100691');

        await model.addPaid(id, 100691, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN(bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')));
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
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

        await model.create(id, data, { from: accountEngine });

        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');
        expect(await model.getClosingObligation(id)).to.eq.BN(bn('99963').mul(bn('12')));

        // Pay the full next installment in a couple of days
        await Helper.increaseTime(2 * secInDay);
        await model.run(id, { from: accountEngine });
        await Helper.increaseTime(5 * secInDay);

        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 23 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 53 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');
        expect(await model.getPaid(id)).to.eq.BN('99963');

        // Wait a month and a week
        await Helper.increaseTime((30 + 7) * secInDay);

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Wait a month
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 99963, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 46 * secInDay);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Wait to the next payment, exactly
        await Helper.increaseTime(secInMonth);

        await model.run(id, { from: accountEngine });

        // Wait to the next payment, exactly
        await Helper.increaseTime(16 * secInDay);

        // Past the payment date by 5 days
        await Helper.increaseTime(5 * secInDay);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 5 * secInDay, '', 5);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('100691');

        await model.addPaid(id, 100691, { from: accountEngine });

        expect(await model.getPaid(id)).to.eq.BN(bn('100691').add(bn('99963')).add(bn('99963')).add(bn('99963')));
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING);
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

        await model.create(id, data, { from: accountEngine });

        await model.addPaid(id, 99963 * 3, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Pass 4 months to the next loan expire time
        await Helper.increaseTime(4 * secInMonth);

        // Pass 12 days from the due date
        await Helper.increaseTime(12 * secInDay);
        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * secInDay);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('101712');

        await model.addPaid(id, 101712, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * secInDay);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('0');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Advance to the next month
        await Helper.increaseTime(18 * secInDay);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 250000, { from: accountEngine });

        // Advance to the next month
        await Helper.increaseTime(secInMonth);
        await ping();

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('165727');

        await model.addPaid(id, web3.utils.toWei('1'), { from: accountEngine });
        expect(await model.getPaid(id)).to.eq.BN('1217180');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_PAID);
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

        await model.create(id, data, { from: accountEngine });

        await model.addPaid(id, 99963 * 3, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Pass 4 months to the next loan expire time
        await Helper.increaseTime(2 * secInMonth);
        await model.run(id, { from: accountEngine });
        await Helper.increaseTime(2 * secInMonth);

        // Pass 12 days from the due date
        await Helper.increaseTime(12 * secInDay);
        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * secInDay);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('101712');

        await model.addPaid(id, 101712, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * secInDay);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('0');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Advance to the next month
        await Helper.increaseTime(18 * secInDay);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        await model.run(id, { from: accountEngine });

        // And to the next...
        await Helper.increaseTime(secInMonth);

        await model.addPaid(id, 250000, { from: accountEngine });

        // Advance to the next month
        await Helper.increaseTime(secInMonth);
        await ping();

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('165727');

        await model.addPaid(id, web3.utils.toWei('1'), { from: accountEngine });
        expect(await model.getPaid(id)).to.eq.BN('1217180');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_PAID);
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

        await model.create(id, data, { from: accountEngine });

        await model.addPaid(id, 99963 * 3, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 4 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Pass 4 months to the next loan expire time
        await Helper.increaseTime(2 * secInMonth - 2);
        await model.run(id, { from: accountEngine });
        await Helper.increaseTime(2 * secInMonth + 2);

        // Pass 12 days from the due date
        await Helper.increaseTime(12 * secInDay);
        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 12 * secInDay);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('101712');

        await model.addPaid(id, 101712, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 18 * secInDay);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('0');
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        // Advance to the next month
        await Helper.increaseTime(18 * secInDay);

        // And to the next...
        await Helper.increaseTime(secInMonth);

        await model.run(id, { from: accountEngine });

        // And to the next...
        await Helper.increaseTime(29 * secInDay + 10);
        await model.run(id, { from: accountEngine });
        await Helper.increaseTime(secInDay - 10);

        await model.addPaid(id, 250000, { from: accountEngine });

        // Advance to the next month
        await Helper.increaseTime(secInMonth);
        await ping();

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('165727');

        await model.addPaid(id, web3.utils.toWei('1'), { from: accountEngine });
        expect(await model.getPaid(id)).to.eq.BN('1217180');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_PAID);
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

        await model.create(id, data, { from: accountEngine });

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        expect(await model.getPaid(id)).to.eq.BN(bn('99963').mul(bn('4')), 'Paid should be the amount of 3 installments');

        // Lets stop the payments
        // Advance 4 months and take a look
        await Helper.increaseTime((4 + 4) * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 3 * secInMonth);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('426091');

        // Advance the last 4 months
        await Helper.increaseTime(4 * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 7 * secInMonth);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('922155');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING, 'Loan should be ongoing');
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

        await model.create(id, data, { from: accountEngine });

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        expect(await model.getPaid(id)).to.eq.BN(bn('99963').mul(bn('4')), 'Paid should be the amount of 3 installments');

        // Lets stop the payments
        // Advance 4 months and take a look
        await Helper.increaseTime((4 + 4) * secInMonth);

        await model.run(id, { from: accountEngine });
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 3 * secInMonth);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('426091');

        // Advance the last 4 months
        await Helper.increaseTime(4 * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 7 * secInMonth);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('922155');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING, 'Loan should be ongoing');
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

        await model.create(id, data, { from: accountEngine });

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        expect(await model.getPaid(id)).to.eq.BN(bn('99963').mul(bn('4')), 'Paid should be the amount of 3 installments');

        // Lets stop the payments
        // Advance 4 months and take a look
        await Helper.increaseTime((4 + 4) * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 3 * secInMonth);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('426091');

        // Advance the last 4 months
        await Helper.increaseTime(4 * secInMonth);

        await model.run(id, { from: accountEngine });
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 7 * secInMonth);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('922155');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING, 'Loan should be ongoing');
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

        await model.create(id, data, { from: accountEngine });

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4, { from: accountEngine });

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() + 5 * secInMonth);
        expect((await model.getObligation(id, await model.getDueTime(id)))[0]).to.eq.BN('99963');

        expect(await model.getPaid(id)).to.eq.BN(bn('99963').mul(bn('4')), 'Paid should be the amount of 3 installments');

        // Lets stop the payments
        // Advance 4 months and take a look
        await Helper.increaseTime((4 + 4) * secInMonth);

        await ping();
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 3 * secInMonth);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('426091');

        // Advance the last 4 months
        await Helper.increaseTime(1 * secInMonth);
        await ping();
        await model.fixClock(id, (await Helper.getBlockTime()) - 15 * secInDay);
        await Helper.increaseTime(3 * secInMonth);
        await ping();

        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 7 * secInMonth);
        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('922154');
        expect(await model.getStatus(id)).to.eq.BN(Helper.STATUS_ONGOING, 'Loan should be ongoing');
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

        await model.create(id, data, { from: accountEngine });

        // Pay the next 4 months in advance
        await model.addPaid(id, bn('99963').mul(bn('4')), { from: accountEngine });

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

        await model.create(id, data, { from: accountEngine });

        // Pay the next 4 months in advance
        await model.addPaid(id, 99963 * 4, { from: accountEngine });

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

        await model.create(id, data, { from: accountEngine });

        await Helper.increaseTime(secInMonth);
        await model.addPaid(id, 99963 * 4, { from: accountEngine });

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

        await model.create(id, data, { from: accountEngine });

        await Helper.increaseTime(31 * secInDay);

        await ping();

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('10000');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - secInDay);

        await model.run(id, { from: accountEngine });

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('10000');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - secInDay);

        await Helper.increaseTime(3 * secInDay);

        await ping();

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('10058');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 4 * secInDay);

        await model.run(id, { from: accountEngine });

        expect((await model.getObligation(id, await Helper.getBlockTime()))[0]).to.eq.BN('10058');
        await Helper.almostEqual(await model.getDueTime(id), await Helper.getBlockTime() - 4 * secInDay);
    });

    it('Try run and fixClock an inexists debt', async function () {
        const id = web3.utils.randomHex(32);
        const now = await Helper.getBlockTime();

        await Helper.assertThrow(model.run(id, { from: accountEngine }));

        await Helper.tryCatchRevert(
            () => model.fixClock(
                id,
                0
            ),
            'Clock can\'t go negative'
        );

        await Helper.tryCatchRevert(
            () => model.fixClock(
                id,
                now + 9999
            ),
            'Forbidden advance clock into the future'
        );
    });
});
