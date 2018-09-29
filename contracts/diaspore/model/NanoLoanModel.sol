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
    address public engine;
    using SafeMath for uint256;
    using SafeMath for uint128;

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

    event _setInterest(bytes32 _id, uint128 _interest);
    event _setPunitoryInterest(bytes32 _id, uint128 _punitoryInterest);
    event _setInterestTimestamp(bytes32 _id, uint64 _interestTimestamp);

    constructor() public {
        _supportedInterface[this.owner.selector] = true;
        _supportedInterface[this.validate.selector] = true;
        _supportedInterface[this.getStatus.selector] = true;
        _supportedInterface[this.getPaid.selector] = true;
        _supportedInterface[this.getObligation.selector] = true;
        _supportedInterface[this.getClosingObligation.selector] = true;
        _supportedInterface[this.getDueTime.selector] = true;
        _supportedInterface[this.getFinalTime.selector] = true;
        _supportedInterface[this.getFrecuency.selector] = true;
        _supportedInterface[this.getEstimateObligation.selector] = true;
        _supportedInterface[this.addDebt.selector] = true; // ??? Not supported
        _supportedInterface[this.run.selector] = true;
        _supportedInterface[this.create.selector] = true;
        _supportedInterface[this.addPaid.selector] = true;
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
        uint64 cancelableAt;
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
        return true;
    }

    function isOperator(address _target) external view returns (bool) {
        return engine == _target;
    }

    function validate(bytes32[] data) external view returns (bool) {
        return _validate(data);
    }

    function _validate(bytes32[] data) internal pure returns (bool) {
        require(data.length == C_PARAMS, "Wrong loan data arguments count");
        require(uint64(data[C_CANCELABLE_AT]) <= uint64(data[C_DUES_IN]), "The cancelableAt should be less or equal than duesIn");
        require(uint256(data[C_INTEREST_RATE]) > 1000, "Interest rate too high");
        require(uint128(data[C_INTEREST_RATE_PUNITORY]) > 1000, "Punitory interest rate too high");
        require(uint128(data[C_AMOUNT]) != 0, "amount can't be 0");
        // check overflows
        require(uint256(data[C_AMOUNT]) < U_128_OVERFLOW, "Amount too high");
        require(uint256(data[C_DUES_IN]) < U_64_OVERFLOW, "Dues in duration too long");
        require(uint256(data[C_CANCELABLE_AT]) < U_64_OVERFLOW, "Cancelable at duration too long");

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

    function _getObligation(bytes32 id, uint256 timestamp) internal returns (uint256 total){
        State storage state = states[id];
        Config storage config = configs[id];

        total = config.amount - state.paid;
        // add interest
        ( , uint256 interest) = _calculateInterest(
            timestamp - state.interestTimestamp,
            config.interestRate,
            total
        );
        // add punitory interest
        if( timestamp > config.dueTime )
            ( , uint256 interestPunitory) = _calculateInterest(
                timestamp - state.interestTimestamp,
                config.interestRatePunitory,
                total
            );
        total += state.interest + interest + interestPunitory + state.punitoryInterest;
    }

    function getClosingObligation(bytes32 id) external view returns (uint256 total){
        return _getObligation(id, max(configs[id].cancelableAt, now));
    }

    function getDueTime(bytes32 id) external view returns (uint256) {
        return states[id].status == STATUS_ONGOING ? configs[id].dueTime : 0;
    }

    function getFinalTime(bytes32 id) external view returns (uint256) {
        return configs[id].dueTime;
    }

    function getFrecuency(bytes32 id) external view returns (uint256){
        return configs[id].cancelableAt == 0 ? 0 : 1;
    }

    function getEstimateObligation(bytes32 id) external view returns (uint256 total) {
        return _getObligation(id, max(configs[id].cancelableAt, now));
    }

    function create(bytes32 id, bytes32[] data) external onlyEngine returns (bool) {
        require(configs[id].interestRate == 0, "Entry already exist");
        _validate(data);

        configs[id] = Config({
            amount: uint128(data[C_AMOUNT]),
            interestRate: uint256(data[C_INTEREST_RATE]),
            interestRatePunitory: uint256(data[C_INTEREST_RATE_PUNITORY]),
            dueTime: uint64(now) + uint64(data[C_DUES_IN]),
            cancelableAt: uint64(data[C_CANCELABLE_AT]),
            id: id
        });

        states[id].status = uint8(STATUS_ONGOING);
        states[id].interestTimestamp = uint64(now);

        emit Created(id, data);
        emit ChangedStatus(id, uint8(STATUS_ONGOING));
        emit _setInterestTimestamp(id, uint64(now));

        return true;
    }

    function addPaid(bytes32 id, uint256 amount) external onlyEngine returns (uint256 toPay) {
        State storage state = states[id];

        require(state.status == STATUS_ONGOING, "The loan status should be Ongoing");
        _addInterest(id, block.timestamp);

        uint256 totalDebt = configs[id].amount.add(state.interest).add(state.punitoryInterest);
        toPay = min(totalDebt.sub(state.paid), amount);

        state.paid += uint128(toPay);

        emit ChangedPaid(id, state.paid);

        if (totalDebt.sub(state.paid) == 0) {
            state.status = uint8(STATUS_PAID);
            emit ChangedStatus(id, uint8(STATUS_PAID));
        }
    }

    function _addInterest(bytes32 id, uint256 timestamp) internal {
        Config storage config = configs[id];
        State storage state = states[id];

        if (timestamp > state.interestTimestamp) {
            uint256 newInterest = state.interest;
            uint256 newPunitoryInterest = state.punitoryInterest;

            uint256 newTimestamp;
            uint256 realDelta;
            uint256 calculatedInterest;

            uint256 deltaTime;
            uint256 pending;

            uint256 endNonPunitory = min(timestamp, config.dueTime);
            if (endNonPunitory > state.interestTimestamp) {
                deltaTime = endNonPunitory - state.interestTimestamp;

                if (state.paid < config.amount) {
                    pending = config.amount - state.paid;
                }

                (realDelta, calculatedInterest) = _calculateInterest(deltaTime, config.interestRate, pending);

                newInterest = calculatedInterest.add(newInterest);
                newTimestamp = state.interestTimestamp + realDelta;
            }

            if (timestamp > config.dueTime) {
                uint256 startPunitory = max(config.dueTime, state.interestTimestamp);
                deltaTime = timestamp - startPunitory;

                uint256 debt = config.amount.add(newInterest);
                pending = min(debt, (debt.add(newPunitoryInterest)).sub(state.paid));

                (realDelta, calculatedInterest) = _calculateInterest(deltaTime, config.interestRatePunitory, pending);
                newPunitoryInterest = newPunitoryInterest.add(calculatedInterest);
                newTimestamp = startPunitory + realDelta;
            }

            if (newInterest != state.interest || newPunitoryInterest != state.punitoryInterest) {
                require(newTimestamp < U_64_OVERFLOW, "newTimestamp overflow");
                require(newInterest < U_128_OVERFLOW, "newInterest overflow");
                require(newPunitoryInterest < U_128_OVERFLOW, "newPunitoryInterest overflow");

                state.interestTimestamp = uint64(newTimestamp);
                state.interest = uint128(newInterest);
                state.punitoryInterest = uint128(newPunitoryInterest);

                emit _setInterestTimestamp(id, state.interestTimestamp);
                emit _setInterest(id, state.interest);
                emit _setPunitoryInterest(id, state.punitoryInterest);
            }
        }
    }

    function _calculateInterest(uint256 timeDelta, uint256 interestRate, uint256 amount) internal pure returns (uint256 realDelta, uint256 interest) {
        if (amount == 0) {
            realDelta = timeDelta;
        } else {
            interest = amount.mult(100000).mult(timeDelta) / interestRate;
            realDelta = interest.mult(interestRate) / (amount * 100000);
        }
    }

    function addDebt(bytes32 id, uint256 amount) external onlyEngine returns (bool) {
        revert("Not implemented!");
    }

    function run(bytes32 id) external returns (bool) {
        _addInterest(id, now);
        return true;
    }
}
