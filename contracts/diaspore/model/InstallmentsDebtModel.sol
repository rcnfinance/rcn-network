import "./../interfaces/DebtModel.sol";
import "./../../utils/Ownable.sol";

contract InstallmentsDebtModel is Ownable, DebtModel {
    mapping(bytes4 => bool) private _supportedInterface;

    constructor() public {
        _supportedInterface[this.owner.selector] = true;
        _supportedInterface[this.validate.selector] = true;
        _supportedInterface[this.getStatus.selector] = true;
        _supportedInterface[this.getPaid.selector] = true;
        _supportedInterface[this.getDebt.selector] = true;
        _supportedInterface[this.getDueTime.selector] = true;
        _supportedInterface[this.create.selector] = true;
        _supportedInterface[this.addPaid.selector] = true;
    }

    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        return 
            interfaceId == this.supportsInterface.selector ||
            interfaceId == debtModelInterface ||
            _supportedInterface[interfaceId];
    }

    address public engine;

    mapping(bytes32 => Config) public configs;
    mapping(bytes32 => State) public states;

    uint256 public constant C_PARAMS = 4;
    uint256 public constant C_CUOTA = 0;
    uint256 public constant C_INTEREST_RATE = 1;
    uint256 public constant C_INSTALLMENTS = 2;
    uint256 public constant C_INSTALLMENT_DURATION = 3;

    uint256 private constant U_128_OVERFLOW = 2 ** 128;
    uint256 private constant U_64_OVERFLOW = 2 ** 64;
    uint256 private constant U_40_OVERFLOW = 2 ** 40;
    uint256 private constant U_24_OVERFLOW = 2 ** 24;

    event _setClock(bytes32 _id, uint64 _to);
    event _setStatus(bytes32 _id, uint8 _status);
    event _setPaidBase(bytes32 _id, uint128 _paidBase);
    event _setInterest(bytes32 _id, uint128 _interest);

    event _advancedClock(bytes32 _id, uint64 _target);

    struct Config {
        uint24 installments;
        uint40 duration;
        uint64 lentTime;
        uint128 cuota;
        uint256 interestRate;
        bytes32 id;
    }

    struct State {
        uint8 status;
        uint64 clock;
        uint128 paid;
        uint128 paidBase;
        uint128 interest;
    }

    function setEngine(address _engine) external onlyOwner returns (bool) {
        engine = _engine;
        return true;
    }

    modifier onlyEngine {
        require(msg.sender == engine, "Only engine allowed");
        _;
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

    function getObligation(bytes32 id, uint256 timestamp) external view returns (uint256, bool) {
        State storage state = states[id];
        Config storage config = configs[id];

        uint64 lentTime = config.lentTime;

        // Can't be before creation
        if (timestamp < lentTime) {
            return (0, true);
        } 

        // Static storage loads
        uint40 duration = config.duration;
        uint256 installments = config.installments;
        uint128 cuota = config.cuota;
        
        uint64 currentClock = uint64(timestamp) - lentTime;

        uint128 base = _baseDebt(
            currentClock,
            duration,
            installments,
            cuota
        );

        uint128 interest;
        uint128 prevInterest = state.interest;
        uint64 clock = state.clock;
        bool defined;

        if (clock >= currentClock) {
            interest = prevInterest;
            defined = true;
        } else {
            // We need to calculate the new interest, on a view!
            (interest, currentClock) = _runAdvanceClock({
                _clock: clock,
                _interest: prevInterest,
                _duration: duration,
                _cuota: cuota,
                _installments: installments,
                _paidBase: state.paidBase,
                _interestRate: config.interestRate,
                _targetClock: currentClock
            });

            defined = prevInterest == interest;
        }
        
        uint128 debt = base + interest;
        uint128 paid = state.paid;
        return (debt > paid ? debt - paid : 0, defined);
    }

    function getClosingObligation(bytes32 id) external view returns (uint256) {
        return _getClosingObligation(id);
    }

    function getDueTime(bytes32 id) external view returns (uint256) {
        Config storage config = configs[id];
        State storage state = states[id];

        return (state.clock / config.duration) + config.lentTime;
    }

    function getBaseDebt(bytes32 id) external view returns (uint256) {
        Config storage config = configs[id];
        uint64 clock = uint64(now) - config.lentTime;
        return _baseDebt(clock, config.duration, config.installments, config.cuota);
    }

    function getFinalTime(bytes32 id) external view returns (uint256) {
        Config storage config = configs[id];
        return config.lentTime + (uint256(config.duration) * (uint256(config.installments)));
    }

    function getFrecuency(bytes32 id) external view returns (uint256) {
        return configs[id].duration;
    }

    function getEstimateObligation(bytes32 id) external view returns (uint256) {
        return _getClosingObligation(id);
    }

    function _getClosingObligation(bytes32 id) internal view returns (uint256) {
        State storage state = states[id];
        Config storage config = configs[id];

        // Static storage loads
        uint40 duration = config.duration;
        uint256 installments = config.installments;
        uint128 cuota = config.cuota;
        
        uint128 base = uint128(cuota) * uint128(installments);
        uint64 currentClock = uint64(now) - config.lentTime;

        uint128 interest;
        uint64 clock = state.clock;

        if (clock >= currentClock) {
            interest = state.interest;
        } else {
            (interest,) = _runAdvanceClock({
                _clock: clock,
                _interest: state.interest,
                _duration: duration,
                _cuota: cuota,
                _installments: installments,
                _paidBase: state.paidBase,
                _interestRate: config.interestRate,
                _targetClock: currentClock
            });
        }

        uint128 debt = base + interest;
        uint128 paid = state.paid;
        return debt > paid ? debt - paid : 0;
    }

    function run(bytes32 id) external returns (bool) {
        Config storage config = configs[id];
        return _advanceClock(config, states[id], uint64(now) - config.lentTime);
    }

    function fixClock(bytes32 id, uint64 target) external returns (bool) {
        if (target <= now) {
            Config storage config = configs[id];
            State storage state = states[id];
            uint64 lentTime = config.lentTime;
            require(lentTime >= target, "Clock can't go negative");
            uint64 targetClock = config.lentTime - target;
            require(targetClock > state.clock, "Clock is ahead of target");
            return _advanceClock(config, state, targetClock);
        }
    }

    function create(bytes32 id, bytes32[] data) external onlyEngine returns (bool) {
        require(configs[id].cuota == 0, "Entry already exist");
        _validate(data);
        
        uint40 duration = uint40(data[C_INSTALLMENT_DURATION]);

        configs[id] = Config({
            installments: uint24(data[C_INSTALLMENTS]),
            duration: duration,
            lentTime: uint64(now),
            cuota: uint128(data[C_CUOTA]),
            interestRate: uint256(data[C_INTEREST_RATE]),
            id: id
        });

        states[id].clock = duration;

        emit Created(id, data);

        return true;
    }

    function _advanceClock(Config storage config, State storage state, uint64 _target) internal returns (bool) {
        uint64 clock = state.clock;
        if (clock < _target) {
            bytes32 id = config.id;
            emit _advancedClock(id, _target);

            (uint128 newInterest, uint64 newClock) = _runAdvanceClock({
                _clock: state.clock,
                _interest: state.interest,
                _duration: config.duration,
                _cuota: config.cuota,
                _installments: config.installments,
                _paidBase: state.paidBase,
                _interestRate: config.interestRate,
                _targetClock: _target
            });

            state.clock = newClock;
            state.interest = newInterest;

            emit _setClock(id, newClock);
            emit _setInterest(id, newInterest);

            return true;
        }
    }

    function _runAdvanceClock(
        uint64 _clock,
        uint128 _interest,
        uint64 _duration,
        uint128 _cuota,
        uint256 _installments,
        uint128 _paidBase,
        uint256 _interestRate,
        uint64 _targetClock
    ) internal pure returns (uint128 interest, uint64 clock) {
        // Advance clock to lentTime if never advanced before
        clock = _clock;
        interest = _interest;

        // Aux variables
        uint64 delta;
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
            uint128 newInterest = _newInterest({
                _clock: clock,
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
        uint64 _targetDelta,
        uint64 _clock,
        uint64 _duration,
        uint256 _installments
    ) internal pure returns (uint64 delta, bool installmentCompleted) {
        uint64 nextInstallmentDelta = _duration - _clock % _duration;
        if (nextInstallmentDelta < _targetDelta && _clock / _duration < _installments) {
            delta = nextInstallmentDelta;
            installmentCompleted = true;
        } else {
            delta = _targetDelta;
            installmentCompleted = false;
        }
    }

    function _newInterest(
        uint64 _clock,
        uint64 _duration,
        uint256 _installments,
        uint128 _cuota,
        uint256 _paidBase,
        uint64 _delta,
        uint256 _interestRate
    ) internal pure returns (uint128) {
        uint256 runningDebt = _baseDebt(_clock, _duration, _installments, _cuota) - _paidBase;
        uint256 newInterest = (100000 * _delta * runningDebt) / _interestRate;
        require(newInterest < U_128_OVERFLOW, "New interest overflow");
        return uint128(newInterest);
    }

    function addPaid(bytes32 id, uint256 amount) external onlyEngine returns (uint256) {
        Config storage config = configs[id];
        State storage state = states[id];

        _advanceClock(config, state, uint64(now) - config.lentTime);

        if (state.status != STATUS_PAID) {
            // State & config memory load
            uint128 installments = config.installments;
            uint128 paid = state.paid;
            uint64 duration = config.duration;

            // Payment aux
            require(available < U_128_OVERFLOW, "Amount overflow");
            uint128 available = uint128(amount);

            // Aux variables
            uint128 unpaidInterest;
            uint128 pending;
            uint128 target;
            uint128 baseDebt;
            uint64 clock;

            do {
                clock = state.clock;

                baseDebt = _baseDebt(clock, duration, installments, config.cuota);
                pending = _currentDebt(baseDebt, state.interest, state.paid);

                // min(pending, available)
                target = pending < available ? pending : available;

                // Calc paid base
                unpaidInterest = state.interest - (paid - state.paidBase);

                // max(target - unpaidInterest, 0)
                state.paidBase += target > unpaidInterest ? target - unpaidInterest : 0;
                emit _setPaidBase(id, state.paidBase);

                paid += target;
                available -= target;

                // Check fully paid
                // All installments paid + interest
                if (clock / duration >= installments && baseDebt + state.interest <= paid) {
                    // Loan paid!
                    state.status = uint8(STATUS_PAID);
                    emit _setStatus(id, uint8(STATUS_PAID));
                    break;
                }

                // If installment fully paid, advance to next one
                if (pending == target) {
                    _advanceClock(config, state, clock + duration);
                }
            } while (available != 0);

            state.paid = paid;
            return amount - available;
        }
    }

    function _baseDebt(
        uint256 clock,
        uint256 duration,
        uint256 installments,
        uint256 cuota
    ) internal pure returns (uint128 base) {
        uint256 installment = (clock / duration) + 1;
        return uint128(installment < installments ? installment * cuota : installments * cuota);
    }

    function _currentDebt(uint128 base, uint128 interest, uint128 paid) internal pure returns (uint128) {
        uint128 debt = base + interest;
        return paid < debt ? debt - paid : 0;
    }

    function validate(bytes32[] data) external view returns (bool) {
        return _validate(data);
    }

    function _validate(bytes32[] data) internal pure returns (bool) {
        require(data.length == C_PARAMS, "Wrong loan data arguments count");
        require(uint256(data[C_CUOTA]) < U_128_OVERFLOW, "Cuota too high");
        require(uint128(data[C_CUOTA]) > 0, "Cuota can't be 0");
        require(uint256(data[C_INTEREST_RATE]) > 1000, "Interest rate too high");
        require(uint256(data[C_INSTALLMENTS]) < U_24_OVERFLOW, "Too many installments");
        require(uint24(data[C_INSTALLMENTS]) > 0, "Installments can't be 0");
        require(uint256(data[C_INSTALLMENT_DURATION]) < U_40_OVERFLOW, "Installment duration too long");
        require(uint40(data[C_INSTALLMENT_DURATION]) > 0, "Installment duration can't be 0");
        return true;
    }
}