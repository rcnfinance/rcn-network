pragma solidity ^0.4.24;

import "./../interfaces/Model.sol";
import "./../../utils/Ownable.sol";
import "./../../utils/SafeMath.sol";

contract MinMax {
    function min(uint256 a, uint256 b) internal pure returns(uint256) {
        return (a < b) ? a : b;
    }

    function max(uint256 a, uint256 b) internal pure returns(uint256) {
        return (a > b) ? a : b;
    }
}

contract NanoLoanModel is Ownable, Model, MinMax  {
    using SafeMath for uint256;
    using SafeMath for uint128;
    address public engine;

    mapping(bytes32 => Config) public configs;
    mapping(bytes32 => State) public states;
    mapping(bytes4 => bool) private _supportedInterface;

    uint256 public constant C_PARAMS = 5;
    uint256 public constant C_AMOUNT = 0;
    uint256 public constant C_INTEREST_RATE = 1;
    uint256 public constant C_INTEREST_RATE_PUNITORY = 2;
    uint256 public constant C_DUES_IN = 3;
    uint256 public constant C_CANCELABLE_AT = 4;

    uint256 private constant U_128_OVERFLOW = 2 ** 128;
    uint256 private constant U_64_OVERFLOW = 2 ** 64;

    event _setEngine(address _engine);
    event _setInterest(bytes32 _id, uint128 _interest);
    event _setPunitoryInterest(bytes32 _id, uint128 _punitoryInterest);
    event _setInterestTimestamp(bytes32 _id, uint256 _interestTimestamp);

    constructor() public {
        // Ownable
        _supportedInterface[this.owner.selector] = true;
        // Model interface
        _supportedInterface[this.validate.selector] = true;
        _supportedInterface[this.getStatus.selector] = true;
        _supportedInterface[this.getPaid.selector] = true;
        _supportedInterface[this.getObligation.selector] = true;
        _supportedInterface[this.getClosingObligation.selector] = true;
        _supportedInterface[this.getDueTime.selector] = true;
        _supportedInterface[this.getFinalTime.selector] = true;
        _supportedInterface[this.getFrequency.selector] = true;
        _supportedInterface[this.getInstallments.selector] = true;
        _supportedInterface[this.getEstimateObligation.selector] = true;
        _supportedInterface[this.create.selector] = true;
        _supportedInterface[this.addPaid.selector] = true;
        _supportedInterface[this.addDebt.selector] = false;
        _supportedInterface[this.run.selector] = true;
        // NanoLoanModel
        _supportedInterface[this.configs.selector] = true;
        _supportedInterface[this.states.selector] = true;
        _supportedInterface[this.engine.selector] = true;
    }

    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        return
            interfaceId == this.supportsInterface.selector ||
            interfaceId == debtModelInterface ||
            _supportedInterface[interfaceId];
    }

    struct Config {
        uint128 amount;
        uint256 interestRate;
        uint256 interestRatePunitory;
        uint64 dueTime;
        bytes32 id;
    }

    struct State {
        uint128 paid;
        uint128 interest;
        uint128 punitoryInterest;
        uint64 interestTimestamp;
        uint8 status;
    }

    modifier onlyEngine {
        require(msg.sender == engine, "Only engine allowed");
        _;
    }

    function setEngine(address _engine) external onlyOwner returns (bool) {
        engine = _engine;
        emit _setEngine(_engine);
        return true;
    }

    function isOperator(address _target) external view returns (bool) {
        return engine == _target;
    }

    function validate(bytes32[] data) external view returns (bool) {
        return _validate(data);
    }

    /**
        @dev Validate the data input, check:
            The length of data should be 5
            The duesIn should be less or equal than cancelableAt and not 0
            The interestRate should be more than 1000
            The interestRatePunitory should be more than 1000
            The amount should not be 0

        @param data Array of bytes32 with 5 length, used to create a loan
            0: The requested amount
            1: The non-punitory interest rate by second, defined as a denominator of 10 000 000.
            2: The punitory interest rate by second, defined as a denominator of 10 000 000.
                Ej: interestRate 11108571428571 = 28% Anual interest
            3: The time in seconds that the borrower has in order to pay the debt after the lender lends the money.
            4: Delta in seconds specifying how much interest should be added in advance, if the borrower pays
                entirely or partially the loan before this term, no extra interest will be deducted.
    */
    function _validate(bytes32[] data) internal returns (bool) {
        require(data.length == C_PARAMS, "Wrong loan data arguments count");
        require(uint64(data[C_CANCELABLE_AT]) <= uint64(data[C_DUES_IN]), "The cancelableAt should be less or equal than duesIn");
        require(uint256(data[C_INTEREST_RATE]) > 1000, "Interest rate too high");
        require(uint256(data[C_INTEREST_RATE_PUNITORY]) > 1000, "Punitory interest rate too high");
        require(uint128(data[C_AMOUNT]) != 0, "amount can't be 0");
        // check overflows
        require(uint256(data[C_AMOUNT]) < U_128_OVERFLOW, "Amount too high");
        // because cancelableAt should be less than duesIn i only check duesIn overflow
        require(uint256(data[C_DUES_IN]) < U_64_OVERFLOW, "Dues in duration too long");
        require(now + uint256(data[C_DUES_IN]) > now, "duesIn should be not 0 or overflow now plus duesIn");
        // cancelableAt cant make overflow because:
        //     cancelableAt <= duesIn < 2 ** 64
        // and we check the sum of duesIn and now in the previus requiere

        return true;
    }

    function getStatus(bytes32 id) external view returns (uint256) {
        return states[id].status;
    }

    function getPaid(bytes32 id) external view returns (uint256) {
        return states[id].paid;
    }

    function getObligation(bytes32 id, uint64 timestamp) external view returns (uint256, bool) {
        return (_getObligation(id, timestamp), false);
    }

    function _getObligation(bytes32 id, uint256 timestamp) internal view returns (uint256 total){
        State storage state = states[id];
        if (state.status == STATUS_PAID)
            return 0;
        Config storage config = configs[id];

        uint256 calcInterest;
        uint256 endNonPunitory = min(timestamp, config.dueTime);

        if (state.paid < config.amount)
            total = config.amount - state.paid;

        if (state.interestTimestamp < endNonPunitory)
            (, calcInterest) = _calculateInterest(endNonPunitory - state.interestTimestamp, config.interestRate, total);

        if (timestamp > config.dueTime && timestamp > state.interestTimestamp) {
            uint256 debt = config.amount.add(calcInterest).add(state.interest);
            uint256 pending = min(debt, debt.add(state.punitoryInterest).sub(state.paid));

            (, debt) = _calculateInterest(timestamp - max(config.dueTime, state.interestTimestamp), config.interestRatePunitory, pending);// cant underflow, check in the previus if
            calcInterest = debt.add(calcInterest);
        }

        total = total.add(calcInterest).add(state.interest).add(state.punitoryInterest);
    }

    function getClosingObligation(bytes32 id) external view returns (uint256 total){
        return _getObligation(id, now);
    }

    function getDueTime(bytes32 id) external view returns (uint256) {
        return states[id].status == STATUS_PAID ? 0 : configs[id].dueTime;
    }

    function getFinalTime(bytes32 id) external view returns (uint256) {
        return configs[id].dueTime;
    }

    function getFrecuency(bytes32 id) external view returns (uint256){
        return configs[id].dueTime == 0 ? 0 : 1;
    }

    function getEstimateObligation(bytes32 id) external view returns (uint256 total) {
        return _getObligation(id, now);
    }

    /**
        @dev Before create the loan the data should be validate with call _validate function

        @param id Index of the loan
        @param data Array of bytes32 with 5 length, used to create a loan
            0: The requested amount
            1: The non-punitory interest rate by second, defined as a denominator of 10 000 000.
            2: The punitory interest rate by second, defined as a denominator of 10 000 000.
                Ej: interestRate 11108571428571 = 28% Anual interest
            3: The time in seconds that the borrower has in order to pay the debt after the lender lends the money.
            4: Delta in seconds specifying how much interest should be added in advance, if the borrower pays
                entirely or partially the loan before this term, no extra interest will be deducted.
    */
    function create(bytes32 id, bytes32[] data) external onlyEngine returns (bool) {
        require(configs[id].interestRate == 0, "Entry already exist");
        _validate(data);

        configs[id] = Config({
            amount: uint128(data[C_AMOUNT]),
            interestRate: uint256(data[C_INTEREST_RATE]),
            interestRatePunitory: uint256(data[C_INTEREST_RATE_PUNITORY]),
            dueTime: uint64(now) + uint64(data[C_DUES_IN]), // check overflow in validate
            id: id
        });
        emit Created(id);

        states[id].interestTimestamp = uint64(now);
        emit _setInterestTimestamp(id, now);

        if (uint256(data[C_CANCELABLE_AT]) != 0)
            _addInterest(id, now + uint256(data[C_CANCELABLE_AT])); // check overflow in validate

        return true;
    }

    /**
        @notice Pay loan

        Does a payment of a given Loan, before performing the payment the accumulated
        interest is computed and added to the total pending amount.

        If the paid pending amount equals zero, the loan changes status to "paid" and it is considered closed.

        @param id Index of the loan
        @param amount Amount to pay

        @return toPay if the payment was executed successfully
    */
    function addPaid(bytes32 id, uint256 amount) external onlyEngine returns (uint256 toPay) {
        State storage state = states[id];

        require(state.status != STATUS_PAID, "The loan status should not be paid");
        _addInterest(id, now);

        uint256 totalDebt = configs[id].amount.add(state.interest).add(state.punitoryInterest);

        toPay = min(totalDebt.sub(state.paid), amount);
        state.paid = uint128(toPay.add(state.paid));
        emit AddedPaid(id, state.paid);

        if (totalDebt - state.paid == 0) { // check underflow in min
            state.status = uint8(STATUS_PAID);
            emit ChangedStatus(id, now, uint8(STATUS_PAID));
        }
    }

    /**
        @notice Computes loan interest

        Computes the punitory and non-punitory interest of a given loan and only applies the change.

        @param id Index of the loan to compute interest
        @param timestamp Target absolute unix time to calculate interest.
    */
    function _addInterest(bytes32 id, uint256 timestamp) internal {
        Config storage config = configs[id];
        State storage state = states[id];

        uint256 interestTimestamp = state.interestTimestamp;
        if (interestTimestamp < timestamp) {
            uint256 newInterest = state.interest;

            uint256 realDelta;
            uint256 calculatedInterest;

            uint256 newTimestamp;
            uint256 pending;
            uint256 endNonPunitory = min(timestamp, config.dueTime);
            if (interestTimestamp < endNonPunitory) {
                if (state.paid < config.amount)
                    pending = config.amount - state.paid;// cant underflow, check in if-condition

                (realDelta, calculatedInterest) = _calculateInterest(endNonPunitory - interestTimestamp, config.interestRate, pending);// cant underflow, check in if-condition
                newInterest = calculatedInterest.add(newInterest);
                require(newInterest < U_128_OVERFLOW, "newInterest overflow");
                state.interest = uint128(newInterest);
                emit _setInterest(id, uint128(newInterest));

                newTimestamp = interestTimestamp.add(realDelta);
            }

            if (config.dueTime < timestamp) {
                uint256 startPunitory = max(config.dueTime, interestTimestamp);
                uint256 debt = config.amount.add(newInterest);
                uint256 newPunitoryInterest = state.punitoryInterest;
                pending = min(debt, debt.add(newPunitoryInterest).sub(state.paid));

                (realDelta, calculatedInterest) = _calculateInterest(timestamp - startPunitory, config.interestRatePunitory, pending);// cant underflow, check in the previus if
                newPunitoryInterest = newPunitoryInterest.add(calculatedInterest);
                require(newPunitoryInterest < U_128_OVERFLOW, "newPunitoryInterest overflow");
                state.punitoryInterest = uint128(newPunitoryInterest);
                emit _setPunitoryInterest(id, uint128(newPunitoryInterest));
                newTimestamp = startPunitory.add(realDelta);
            }

            require(newTimestamp < U_64_OVERFLOW, "newTimestamp overflow");
            state.interestTimestamp = uint64(newTimestamp);
            emit _setInterestTimestamp(id, newTimestamp);
        }
    }

    /**
        @notice Calculates the interest of a given amount, interest rate and delta time.

        @param timeDelta Elapsed time
        @param interestRate Interest rate expressed as the denominator of 10 000 000.
        @param amount Amount to apply interest

        @return realDelta The real timeDelta applied
        @return interest The interest gained in the realDelta time
    */
    function _calculateInterest(uint256 timeDelta, uint256 interestRate, uint256 amount) internal pure returns (uint256 realDelta, uint256 interest) {
        if (amount == 0) {
            realDelta = timeDelta;
        } else {
            interest = timeDelta.mult(amount * 100000) / interestRate;
            realDelta = interest.mult(interestRate) / (amount * 100000);
        }
    }

    function addDebt(bytes32, uint256) external onlyEngine returns (bool) {
        revert("Not implemented!");
    }

    /**
        @notice Updates the loan accumulated interests up to the current Unix time.

        @param id Index of the loan

        @return true If the interest was updated
    */
    function run(bytes32 id) external returns (bool) {
        _addInterest(id, now);
        return true;
    }
}
