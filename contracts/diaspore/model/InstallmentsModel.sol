pragma solidity ^0.5.0;

import "./../interfaces/Model.sol";
import "./../interfaces/ModelDescriptor.sol";
import "./../../utils/Ownable.sol";
import "./../../utils/BytesUtils.sol";
import "./../../utils/ERC165.sol";


contract InstallmentsModel is ERC165, BytesUtils, Ownable, Model, ModelDescriptor {

    mapping(bytes4 => bool) private _supportedInterface;

    constructor() public {
        _registerInterface(MODEL_INTERFACE);
        _registerInterface(MODEL_DESCRIPTOR_INTERFACE);
    }

    address public engine;
    address private altDescriptor;

    mapping(bytes32 => Config) public configs;
    mapping(bytes32 => State) public states;

    uint256 public constant L_DATA = 16 + 32 + 3 + 5 + 4;

    uint256 private constant U_128_OVERFLOW = 2 ** 128;
    uint256 private constant U_64_OVERFLOW = 2 ** 64;
    uint256 private constant U_40_OVERFLOW = 2 ** 40;
    uint256 private constant U_24_OVERFLOW = 2 ** 24;

    event _setEngine(address _engine);
    event _setDescriptor(address _descriptor);

    event _setClock(bytes32 _id, uint64 _to);
    event _setPaidBase(bytes32 _id, uint128 _paidBase);
    event _setInterest(bytes32 _id, uint128 _interest);

    struct Config {
        uint24 installments;
        uint32 timeUnit;
        uint40 duration;
        uint64 lentTime;
        uint128 cuota;
        uint256 interestRate;
        bytes32 id;
    }

    struct State {
        uint8 status;
        uint64 clock;
        uint64 lastPayment;
        uint128 paid;
        uint128 paidBase;
        uint128 interest;
    }

    modifier onlyEngine {
        require(msg.sender == engine, "Only engine allowed");
        _;
    }

    function modelId() external view returns (bytes32) {
        // InstallmentsModel A 0.0.2
        return bytes32(0x00000000000000496e7374616c6c6d656e74734d6f64656c204120302e302e32);
    }

    function descriptor() external view returns (address) {
        address _descriptor = altDescriptor;
        return _descriptor == address(0) ? address(this) : _descriptor;
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
        uint128 _cuota,
        uint256 _interestRate,
        uint24 _installments,
        uint40 _duration,
        uint32 _timeUnit
    ) external pure returns (bytes memory) {
        return abi.encodePacked(_cuota, _interestRate, _installments, _duration, _timeUnit);
    }

    function create(bytes32 id, bytes calldata data) external onlyEngine returns (bool) {
        require(configs[id].cuota == 0, "Entry already exist");

        (uint128 cuota, uint256 interestRate, uint24 installments, uint40 duration, uint32 timeUnit) = _decodeData(data);
        _validate(cuota, interestRate, installments, duration, timeUnit);

        configs[id] = Config({
            installments: installments,
            duration: duration,
            lentTime: uint64(now),
            cuota: cuota,
            interestRate: interestRate,
            timeUnit: timeUnit,
            id: id
        });

        states[id].clock = duration;

        emit Created(id);
        emit _setClock(id, duration);

        return true;
    }

    function addPaid(bytes32 id, uint256 amount) external onlyEngine returns (uint256 real) {
        Config storage config = configs[id];
        State storage state = states[id];

        _advanceClock(id, uint64(now) - config.lentTime);

        if (state.status != STATUS_PAID) {
            // State & config memory load
            uint256 paid = state.paid;
            uint256 duration = config.duration;
            uint256 interest = state.interest;

            // Payment aux
            uint256 available = amount;
            require(available < U_128_OVERFLOW, "Amount overflow");

            // Aux variables
            uint256 unpaidInterest;
            uint256 pending;
            uint256 target;
            uint256 baseDebt;
            uint256 clock;

            do {
                clock = state.clock;

                baseDebt = _baseDebt(clock, duration, config.installments, config.cuota);
                pending = baseDebt + interest - paid;

                // min(pending, available)
                target = pending < available ? pending : available;

                // Calc paid base
                unpaidInterest = interest - (paid - state.paidBase);

                // max(target - unpaidInterest, 0)
                state.paidBase += uint128(target > unpaidInterest ? target - unpaidInterest : 0);
                emit _setPaidBase(id, state.paidBase);

                paid += target;
                available -= target;

                // Check fully paid
                // All installments paid + interest
                if (clock / duration >= config.installments && baseDebt + interest <= paid) {
                    // Registry paid!
                    state.status = uint8(STATUS_PAID);
                    emit ChangedStatus(id, now, STATUS_PAID);
                    break;
                }

                // If installment fully paid, advance to next one
                if (pending == target) {
                    _advanceClock(id, clock + duration - (clock % duration));
                }
            } while (available != 0);

            require(paid < U_128_OVERFLOW, "Paid overflow");
            state.paid = uint128(paid);
            state.lastPayment = state.clock;

            real = amount - available;
            emit AddedPaid(id, real);
        }
    }

    function addDebt(bytes32 id, uint256 amount) external onlyEngine returns (bool) {
        revert("Not implemented!");
    }

    function fixClock(bytes32 id, uint64 target) external returns (bool) {
        require(target <= now, "Forbidden advance clock into the future");
        Config storage config = configs[id];
        State storage state = states[id];
        uint64 lentTime = config.lentTime;
        require(lentTime < target, "Clock can't go negative");
        uint64 targetClock = target - lentTime;
        require(targetClock > state.clock, "Clock is ahead of target");
        return _advanceClock(id, targetClock);
    }

    function isOperator(address _target) external view returns (bool) {
        return engine == _target;
    }

    function getStatus(bytes32 id) external view returns (uint256) {
        Config storage config = configs[id];
        State storage state = states[id];
        require(config.lentTime != 0, "The registry does not exist");
        return state.status == STATUS_PAID ? STATUS_PAID : STATUS_ONGOING;
    }

    function getPaid(bytes32 id) external view returns (uint256) {
        return states[id].paid;
    }

    function getObligation(bytes32 id, uint64 timestamp) external view returns (uint256, bool) {
        State storage state = states[id];
        Config storage config = configs[id];

        // Can't be before creation
        if (timestamp < config.lentTime) {
            return (0, true);
        }

        // Static storage loads
        uint256 currentClock = timestamp - config.lentTime;

        uint256 base = _baseDebt(
            currentClock,
            config.duration,
            config.installments,
            config.cuota
        );

        uint256 interest;
        uint256 prevInterest = state.interest;
        uint256 clock = state.clock;
        bool defined;

        if (clock >= currentClock) {
            interest = prevInterest;
            defined = true;
        } else {
            // We need to calculate the new interest, on a view!
            (interest, currentClock) = _simRunClock(
                clock,
                currentClock,
                prevInterest,
                config,
                state
            );

            defined = prevInterest == interest;
        }

        uint256 debt = base + interest;
        uint256 paid = state.paid;
        return (debt > paid ? debt - paid : 0, defined);
    }

    function _simRunClock(
        uint256 _clock,
        uint256 _targetClock,
        uint256 _prevInterest,
        Config memory _config,
        State memory _state
    ) internal pure returns (uint256 interest, uint256 clock) {
        (interest, clock) = _runAdvanceClock({
            _clock: _clock,
            _timeUnit: _config.timeUnit,
            _interest: _prevInterest,
            _duration: _config.duration,
            _cuota: _config.cuota,
            _installments: _config.installments,
            _paidBase: _state.paidBase,
            _interestRate: _config.interestRate,
            _targetClock: _targetClock
        });
    }

    function run(bytes32 id) external returns (bool) {
        Config storage config = configs[id];
        return _advanceClock(id, uint64(now) - config.lentTime);
    }

    function validate(bytes calldata data) external view returns (bool) {
        (uint128 cuota, uint256 interestRate, uint24 installments, uint40 duration, uint32 timeUnit) = _decodeData(data);
        _validate(cuota, interestRate, installments, duration, timeUnit);
        return true;
    }

    function getClosingObligation(bytes32 id) external view returns (uint256) {
        return _getClosingObligation(id);
    }

    function getDueTime(bytes32 id) external view returns (uint256) {
        Config storage config = configs[id];
        uint256 last = states[id].lastPayment;
        uint256 duration = config.duration;
        last = last != 0 ? last : duration;
        return last - (last % duration) + config.lentTime;
    }

    function getFinalTime(bytes32 id) external view returns (uint256) {
        Config storage config = configs[id];
        return config.lentTime + (uint256(config.duration) * (uint256(config.installments)));
    }

    function getFrequency(bytes32 id) external view returns (uint256) {
        return configs[id].duration;
    }

    function getInstallments(bytes32 id) external view returns (uint256) {
        return configs[id].installments;
    }

    function getEstimateObligation(bytes32 id) external view returns (uint256) {
        return _getClosingObligation(id);
    }

    function simFirstObligation(bytes calldata _data) external view returns (uint256 amount, uint256 time) {
        (amount,,, time,) = _decodeData(_data);
    }

    function simTotalObligation(bytes calldata _data) external view returns (uint256 amount) {
        (uint256 cuota,, uint256 installments,,) = _decodeData(_data);
        amount = cuota * installments;
    }

    function simDuration(bytes calldata _data) external view returns (uint256 duration) {
        (,,uint256 installments, uint256 installmentDuration,) = _decodeData(_data);
        duration = installmentDuration * installments;
    }

    function simPunitiveInterestRate(bytes calldata _data) external view returns (uint256 punitiveInterestRate) {
        (,punitiveInterestRate,,,) = _decodeData(_data);
    }

    function simFrequency(bytes calldata _data) external view returns (uint256 frequency) {
        (,,, frequency,) = _decodeData(_data);
    }

    function simInstallments(bytes calldata _data) external view returns (uint256 installments) {
        (,, installments,,) = _decodeData(_data);
    }

    function _advanceClock(bytes32 id, uint256 _target) internal returns (bool) {
        Config storage config = configs[id];
        State storage state = states[id];

        uint256 clock = state.clock;
        if (clock < _target) {
            (uint256 newInterest, uint256 newClock) = _runAdvanceClock({
                _clock: state.clock,
                _timeUnit: config.timeUnit,
                _interest: state.interest,
                _duration: config.duration,
                _cuota: config.cuota,
                _installments: config.installments,
                _paidBase: state.paidBase,
                _interestRate: config.interestRate,
                _targetClock: _target
            });

            require(newClock < U_64_OVERFLOW, "Clock overflow");
            require(newInterest < U_128_OVERFLOW, "Interest overflow");

            emit _setClock(id, uint64(newClock));

            if (newInterest != 0) {
                emit _setInterest(id, uint128(newInterest));
            }

            state.clock = uint64(newClock);
            state.interest = uint128(newInterest);

            return true;
        }
    }

    function _getClosingObligation(bytes32 id) internal view returns (uint256) {
        State storage state = states[id];
        Config storage config = configs[id];

        // Static storage loads
        uint256 installments = config.installments;
        uint256 cuota = config.cuota;
        uint256 currentClock = uint64(now) - config.lentTime;

        uint256 interest;
        uint256 clock = state.clock;

        if (clock >= currentClock) {
            interest = state.interest;
        } else {
            (interest,) = _runAdvanceClock({
                _clock: clock,
                _timeUnit: config.timeUnit,
                _interest: state.interest,
                _duration: config.duration,
                _cuota: cuota,
                _installments: installments,
                _paidBase: state.paidBase,
                _interestRate: config.interestRate,
                _targetClock: currentClock
            });
        }

        uint256 debt = cuota * installments + interest;
        uint256 paid = state.paid;
        return debt > paid ? debt - paid : 0;
    }

    function _runAdvanceClock(
        uint256 _clock,
        uint256 _timeUnit,
        uint256 _interest,
        uint256 _duration,
        uint256 _cuota,
        uint256 _installments,
        uint256 _paidBase,
        uint256 _interestRate,
        uint256 _targetClock
    ) internal pure returns (uint256 interest, uint256 clock) {
        // Advance clock to lentTime if never advanced before
        clock = _clock;
        interest = _interest;

        // Aux variables
        uint256 delta;
        bool installmentCompleted;

        do {
            // Delta to next installment and absolute delta (no exceeding 1 installment)
            (delta, installmentCompleted) = _calcDelta({
                _targetDelta: _targetClock - clock,
                _clock: clock,
                _duration: _duration,
                _installments: _installments
            });

            // Running debt
            uint256 newInterest = _newInterest({
                _clock: clock,
                _timeUnit: _timeUnit,
                _duration: _duration,
                _installments: _installments,
                _cuota: _cuota,
                _paidBase: _paidBase,
                _delta: delta,
                _interestRate: _interestRate
            });

            // Don't change clock unless we have a change
            if (installmentCompleted || newInterest > 0) {
                clock += delta;
                interest += newInterest;
            } else {
                break;
            }
        } while (clock < _targetClock);
    }

    function _calcDelta(
        uint256 _targetDelta,
        uint256 _clock,
        uint256 _duration,
        uint256 _installments
    ) internal pure returns (uint256 delta, bool installmentCompleted) {
        uint256 nextInstallmentDelta = _duration - _clock % _duration;
        if (nextInstallmentDelta <= _targetDelta && _clock / _duration < _installments) {
            delta = nextInstallmentDelta;
            installmentCompleted = true;
        } else {
            delta = _targetDelta;
            installmentCompleted = false;
        }
    }

    function _newInterest(
        uint256 _clock,
        uint256 _timeUnit,
        uint256 _duration,
        uint256 _installments,
        uint256 _cuota,
        uint256 _paidBase,
        uint256 _delta,
        uint256 _interestRate
    ) internal pure returns (uint256) {
        uint256 runningDebt = _baseDebt(_clock, _duration, _installments, _cuota) - _paidBase;
        uint256 newInterest = (100000 * (_delta / _timeUnit) * runningDebt) / (_interestRate / _timeUnit);
        require(newInterest < U_128_OVERFLOW, "New interest overflow");
        return newInterest;
    }

    function _baseDebt(
        uint256 clock,
        uint256 duration,
        uint256 installments,
        uint256 cuota
    ) internal pure returns (uint256 base) {
        uint256 installment = clock / duration;
        return uint128(installment < installments ? installment * cuota : installments * cuota);
    }

    function _validate(
        uint256 _cuota,
        uint256 _interestRate,
        uint256 _installments,
        uint256 _installmentDuration,
        uint256 _timeUnit
    ) internal pure {
        require(_cuota > 0, "Cuota can't be 0");
        require(_interestRate > 0, "Interest rate can't be 0");
        require(_installments > 0, "Installments can't be 0");
        require(_installmentDuration > 0, "Installment duration can't be 0");
        require(_timeUnit <= _installmentDuration, "Time unit can't be lower than installment duration");
        require(_interestRate > _timeUnit, "Interest rate by time unit is too low");
        require(_timeUnit > 0, "Time unit can'be 0");
    }

    function _decodeData(
        bytes memory _data
    ) internal pure returns (uint128, uint256, uint24, uint40, uint32) {
        require(_data.length == L_DATA, "Invalid data length");
        (
            bytes32 cuota,
            bytes32 interestRate,
            bytes32 installments,
            bytes32 duration,
            bytes32 timeUnit
        ) = decode(_data, 16, 32, 3, 5, 4);
        return (uint128(uint256(cuota)), uint256(interestRate), uint24(uint256(installments)), uint40(uint256(duration)), uint32(uint256(timeUnit)));
    }
}
