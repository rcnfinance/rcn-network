pragma solidity ^0.5.6;

import "./../interfaces/Model.sol";
import "./../interfaces/ModelDescriptor.sol";
import "../../../commons/Ownable.sol";
import "../../../commons/ERC165.sol";
import "../../../utils/SafeMath.sol";
import "../../../utils/BytesUtils.sol";


contract MinMax {
    function min(uint256 a, uint256 b) internal pure returns(uint256) {
        return (a < b) ? a : b;
    }

    function max(uint256 a, uint256 b) internal pure returns(uint256) {
        return (a > b) ? a : b;
    }
}


contract NanoLoanModel is ERC165, BytesUtils, Ownable, Model, ModelDescriptor, MinMax  {
    using SafeMath for uint256;
    using SafeMath for uint128;
    using SafeMath for uint64;

    address public engine;
    address private altDescriptor;

    mapping(bytes32 => Config) public configs;
    mapping(bytes32 => State) public states;
    mapping(bytes4 => bool) private _supportedInterface;

    uint256 public constant L_DATA = 16 + 32 + 32 + 8 + 8; // amount + interestRate + interestRatePunitory + duesIn + cancelableAt

    uint256 private constant U_128_OVERFLOW = 2 ** 128;
    uint256 private constant U_64_OVERFLOW = 2 ** 64;

    event _setEngine(address _engine);
    event _setDescriptor(address _descriptor);
    event _setInterest(bytes32 _id, uint128 _interest);
    event _setPunitoryInterest(bytes32 _id, uint128 _punitoryInterest);
    event _setInterestTimestamp(bytes32 _id, uint256 _interestTimestamp);

    constructor() public {
        _registerInterface(MODEL_INTERFACE);
        _registerInterface(MODEL_DESCRIPTOR_INTERFACE);
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

    function modelId() external view returns (bytes32) {
        // NanoLoanModel 1.0
        return bytes32(0x0000000000000000000000000000004e616e6f4c6f616e4d6f64656c20312e30);
    }

    function descriptor() external view returns (address) {
        return altDescriptor == address(0) ? address(this) : address(altDescriptor);
    }

    function setEngine(address _engine) external onlyOwner returns (bool) {
        engine = _engine;
        emit _setEngine(_engine);
        return true;
    }

    function setDescriptor(address _descriptor) external onlyOwner returns (bool) {
        altDescriptor = _descriptor;
        emit _setDescriptor(_descriptor);
        return true;
    }

    function encodeData(
        uint128 _amount,
        uint256 _interestRate,
        uint256 _interestRatePunitory,
        uint64  _dueTime,
        uint64  _cancelableAt
    ) external pure returns (bytes memory) {
        return abi.encodePacked(
            _amount,
            _interestRate,
            _interestRatePunitory,
            _dueTime,
            _cancelableAt
        );
    }

    function isOperator(address _target) external view returns (bool) {
        return engine == _target;
    }

    /**
        @dev Look in _validate function documentation for more info

        @param data Array of bytes parameters, used to create a loan
            * look in _decodeData function documentation for more info
    */
    function validate(bytes calldata data) external view returns (bool) {
        (
            uint128 amount, uint256 interestRate, uint256 interestRatePunitory,
            uint64 duesIn, uint64 cancelableAt
        ) = _decodeData(data);

        _validate(
            amount,
            interestRate,
            interestRatePunitory,
            duesIn,
            cancelableAt
        );

        return true;
    }

    /**
        @dev Validate the loan parameters
            The duesIn should be less or equal than cancelableAt and not 0
            The interestRate should be more than 1000
            The interestRatePunitory should be more than 1000
            The amount should not be 0
    */
    function _validate(
        uint128 _amount,
        uint256 _interestRate,
        uint256 _interestRatePunitory,
        uint64 _duesIn,
        uint64 _cancelableAt
    ) internal view {
        require(_cancelableAt <= _duesIn, "The cancelableAt should be less or equal than duesIn");
        require(_interestRate > 1000, "Interest rate too high");
        require(_interestRatePunitory > 1000, "Punitory interest rate too high");
        require(_amount != 0, "amount can't be 0");

        require(uint64(now) + _duesIn > uint64(now), "duesIn should be not 0 or overflow now plus duesIn");
        // cancelableAt cant make overflow because:
        //     cancelableAt <= duesIn
        // and we check the sum of duesIn and now in the previus requiere
    }

    function getStatus(bytes32 id) external view returns (uint256) {
        return states[id].status;
    }

    function getPaid(bytes32 id) external view returns (uint256) {
        return states[id].paid;
    }

    function getObligation(bytes32 id, uint64 timestamp) external view returns (uint256 amount, bool defined) {
        amount = _getObligation(id, timestamp);
        defined = timestamp == now || timestamp <= states[id].interestTimestamp;
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

    function getFrequency(bytes32 id) external view returns (uint256) {
        return configs[id].dueTime == 0 ? 0 : 1;
    }

    function getInstallments(bytes32 id) external view returns (uint256) {
        return configs[id].dueTime == 0 ? 0 : 1;
    }

    function getEstimateObligation(bytes32 id) external view returns (uint256 total) {
        return _getObligation(id, now);
    }

    /**
        @dev Before create the loan the data should be validate with call _validate function

        @param id Index of the loan
        @param data Array of bytes parameters, used to create a loan
            * look in _decodeData function documentation for more info
    */
    function create(bytes32 id, bytes calldata data) external onlyEngine returns (bool) {
        require(configs[id].interestRate == 0, "Entry already exist");

        (uint128 amount, uint256 interestRate, uint256 interestRatePunitory,
            uint64 duesIn, uint64 cancelableAt) = _decodeData(data);

        _validate(
            amount,
            interestRate,
            interestRatePunitory,
            duesIn,
            cancelableAt
        );

        configs[id] = Config({
            amount: amount,
            interestRate: interestRate,
            interestRatePunitory: interestRatePunitory,
            dueTime: uint64(now) + duesIn, // check overflow in validate
            id: id
        });
        emit Created(id);

        states[id].interestTimestamp = uint64(now);
        emit _setInterestTimestamp(id, now);

        if (cancelableAt != 0)
            _addInterest(id, now + uint256(cancelableAt)); // check overflow in validate

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

        uint256 newPay = toPay.add(state.paid);
        require(newPay < U_128_OVERFLOW, "Paid overflow");
        state.paid = uint128(newPay);
        emit AddedPaid(id, newPay);

        if (totalDebt - newPay == 0) { // check underflow in min
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
    function _addInterest(bytes32 id, uint256 timestamp) internal returns(bool) {
        Config storage config = configs[id];
        State storage state = states[id];

        uint256 newInterest = state.interest;

        uint256 realDelta;
        uint256 calculatedInterest;

        uint256 newTimestamp;
        uint256 pending;
        if (state.interestTimestamp < timestamp) {
            uint256 endNonPunitory = min(timestamp, config.dueTime);
            if (state.interestTimestamp < endNonPunitory) {
                if (state.paid < config.amount)
                    pending = config.amount - state.paid;// cant underflow, check in if-condition

                (realDelta, calculatedInterest) = _calculateInterest(endNonPunitory - state.interestTimestamp, config.interestRate, pending);// cant underflow, check in if-condition
                newInterest = calculatedInterest.add(newInterest);
                newTimestamp = state.interestTimestamp.add(realDelta);
            }

            uint256 startPunitory;
            uint256 newPunitoryInterest;
            if (config.dueTime < timestamp) {
                startPunitory = max(config.dueTime, state.interestTimestamp);
                uint256 debt = config.amount.add(newInterest);
                newPunitoryInterest = state.punitoryInterest;
                pending = min(debt, debt.add(newPunitoryInterest).sub(state.paid));

                (realDelta, calculatedInterest) = _calculateInterest(timestamp - startPunitory, config.interestRatePunitory, pending);// cant underflow, check in the previus if
                newPunitoryInterest = newPunitoryInterest.add(calculatedInterest);
                newTimestamp = startPunitory.add(realDelta);
            }

            if (newInterest != state.interest || newPunitoryInterest != state.punitoryInterest) {
                require(newTimestamp < U_64_OVERFLOW, "newTimestamp overflow");
                state.interestTimestamp = uint64(newTimestamp);
                emit _setInterestTimestamp(id, newTimestamp);

                if (newInterest != state.interest) {
                    require(newInterest < U_128_OVERFLOW, "newInterest overflow");
                    state.interest = uint128(newInterest);
                    emit _setInterest(id, uint128(newInterest));
                }

                if (newPunitoryInterest != state.punitoryInterest) {
                    require(newPunitoryInterest < U_128_OVERFLOW, "newPunitoryInterest overflow");
                    state.punitoryInterest = uint128(newPunitoryInterest);
                    emit _setPunitoryInterest(id, uint128(newPunitoryInterest));
                }
                return true;
            }
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
    function _calculateInterest(
        uint256 timeDelta,
        uint256 interestRate,
        uint256 amount
    ) internal pure returns (uint256 realDelta, uint256 interest) {
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
        return _addInterest(id, now);
    }

    /**
        @notice Decode bytes array and returns the parameters of a loan

        @dev The length of data should be L_DATA (the sum of the length of thr loan parameters in bytes)
        @param _data Index of the loan
            from-to bytes
            0 -16: amount
            16-48: interestRate
            48-80: interestRatePunitory
            80-88: duesIn
            88-96: cancelableAt

        @return amount The requested amount
        @return interestRate The non-punitory interest rate by second, defined as a denominator of 10 000 000.
        @return interestRatePunitory The punitory interest rate by second, defined as a denominator of 10 000 000.
            Ej: interestRate 11108571428571 = 28% Anual interest
        @return duesIn The time in seconds that the borrower has in order to pay the debt after the lender lends the money.
        @return cancelableAt Delta in seconds specifying how much interest should be added in advance, if the borrower pays
            entirely or partially the loan before this term, no extra interest will be deducted.
    */
    function _decodeData(
        bytes memory _data
    ) internal pure returns (uint128, uint256, uint256, uint64, uint64) {
        require(_data.length == L_DATA, "Invalid data length");
        (bytes32 amount, bytes32 interestRate, bytes32 interestRatePunitory,
            bytes32 duesIn, bytes32 cancelableAt) = decode(_data, 16, 32, 32, 8, 8);
        return (
            uint128(uint256(amount)),
            uint256(interestRate),
            uint256(interestRatePunitory),
            uint64(uint256(duesIn)),
            uint64(uint256(cancelableAt))
        );
    }

    // implements modelDescriptor interface
    function simFirstObligation(bytes calldata _data) external view returns (uint256 amount, uint256 cancelableAt) {
        uint256 interestRate;
        (amount, interestRate,,, cancelableAt) = _decodeData(_data);
        (, interestRate) = _calculateInterest(cancelableAt, interestRate, amount);
        amount += interestRate;
    }

    function simTotalObligation(bytes calldata _data) external view returns (uint256 amount) {
        uint256 interestRate;
        uint256 cancelableAt;
        (amount, interestRate,,, cancelableAt) = _decodeData(_data);
        (, interestRate) = _calculateInterest(cancelableAt, interestRate, amount);
        amount += interestRate;
    }

    function simDuration(bytes calldata _data) external view returns (uint256 duration) {
        (,,, duration,) = _decodeData(_data);
    }

    function simPunitiveInterestRate(bytes calldata _data) external view returns (uint256 punitiveInterestRate) {
        (,, punitiveInterestRate,,) = _decodeData(_data);
    }

    function simFrequency(bytes calldata _data) external view returns (uint256 frequency) {
        return 1;
    }

    function simInstallments(bytes calldata _data) external view returns (uint256 installments) {
        return 1;
    }
}
