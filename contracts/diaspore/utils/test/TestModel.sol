pragma solidity ^0.4.24;

import "./../../interfaces/Model.sol";
import "./../../../utils/Ownable.sol";

contract TestModel is Ownable, Model {
    uint256 public constant C_PARAMS = 2;
    uint256 public constant C_TOTAL = 0;
    uint256 public constant C_DUE = 1;

    uint256 private constant U_128_OVERFLOW = 2 ** 128;
    uint256 private constant U_64_OVERFLOW = 2 ** 64;

    uint256 public constant ERROR_PAY = 1;

    event SetEngine(address _engine);

    mapping(bytes4 => bool) private _supportedInterface;

    constructor() public {
        _supportedInterface[this.owner.selector] = true;
        _supportedInterface[this.validate.selector] = true;
        _supportedInterface[this.getStatus.selector] = true;
        _supportedInterface[this.getPaid.selector] = true;
        _supportedInterface[this.getClosingObligation.selector] = true;
        _supportedInterface[this.getDueTime.selector] = true;
        _supportedInterface[this.getFinalTime.selector] = true;
        _supportedInterface[this.getFrecuency.selector] = true;
        _supportedInterface[this.getEstimateObligation.selector] = true;
        _supportedInterface[this.addDebt.selector] = true; // ??? Not supported
        _supportedInterface[this.run.selector] = true;
        _supportedInterface[this.create.selector] = true;
        _supportedInterface[this.addPaid.selector] = true;
        _supportedInterface[this.engine.selector] = true;
        _supportedInterface[this.getObligation.selector] = true;
    }

    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        return 
            interfaceId == this.supportsInterface.selector ||
            interfaceId == debtModelInterface ||
            _supportedInterface[interfaceId];
    }

    mapping(bytes32 => Entry) public registry;

    address public engine;

    struct Entry {
        uint64 errorFlag;
        uint64 dueTime;
        uint64 lastPing;
        uint128 total;
        uint128 paid;
    }

    modifier onlyEngine() {
        require(msg.sender == engine, "Sender is not engine");
        _;
    }

    function setEngine(address _engine) external onlyOwner {
        engine = _engine;
        emit SetEngine(_engine);
    }

    function isOperator(address operator) external view returns (bool) {
        return operator == owner;
    }

    function validate(bytes32[] data) external view returns (bool) {
        return _validate(data); 
    }

    function getStatus(bytes32 id) external view returns (uint256) {
        Entry storage entry = registry[id];
        return entry.paid < entry.total ? STATUS_ONGOING : STATUS_PAID;
    }

    function getPaid(bytes32 id) external view returns (uint256) {
        return registry[id].paid;
    }

    function getObligation(bytes32 id, uint64 time) external view returns (uint256,bool) {
        Entry storage entry = registry[id];
        if (time >= entry.dueTime) {
            return (entry.total - entry.paid, true);
        } else {
            return (0, true);
        }
    }

    function getClosingObligation(bytes32 id) external view returns (uint256) {
        Entry storage entry = registry[id];
        return entry.total - entry.paid;
    }

    function getDueTime(bytes32 id) external view returns (uint256) {
        return registry[id].dueTime;
    }

    function getFinalTime(bytes32 id) external view returns (uint256) {
        return registry[id].dueTime;
    }

    function getFrecuency(bytes32) external view returns (uint256) {
        return 0;
    }

    function getEstimateObligation(bytes32 id) external view returns (uint256) {
        Entry storage entry = registry[id];
        return entry.total - entry.paid;
    }

    function create(bytes32 id, bytes32[] data) external onlyEngine returns (bool) {
        _validate(data);

        emit Created(id, data);

        registry[id] = Entry({
            errorFlag: 0,
            dueTime: uint64(data[C_DUE]),
            lastPing: uint64(now),
            total: uint128(data[C_TOTAL]),
            paid: 0
        });

        emit ChangedStatus(id, now, STATUS_ONGOING);
        emit ChangedDueTime(id, now, uint64(data[C_DUE]));
        emit ChangedFinalTime(id, now, uint64(data[C_DUE]));

        return true;
    }

    function addPaid(bytes32 id, uint256 amount) external onlyEngine returns (uint256 real) {
        _run(id);

        Entry storage entry = registry[id];

        uint256 total = entry.total;
        uint256 paid = entry.paid;

        uint256 pending = total - paid;
        real = pending <= amount ? amount : pending;

        paid += real;
        require(paid < U_128_OVERFLOW, "Paid overflow");
        entry.paid = uint128(paid);

        emit AddedPaid(id, real);
        if (paid == total) {
            emit ChangedStatus(id, now, STATUS_PAID);
        }
    }

    function addDebt(bytes32 id, uint256 amount) external onlyEngine returns (bool) {
        _run(id);

        Entry storage entry = registry[id];

        uint256 total = entry.total;
        uint256 paid = entry.paid;

        if (total > paid) {
            total += amount;
            require(total < U_128_OVERFLOW, "Total overflow");
            entry.total = uint128(total);

            emit AddedDebt(id, amount);
            if (now >= entry.dueTime) {
                emit ChangedObligation(id, now, total - paid);
            }

            return true;
        }
    }

    function run(bytes32 id) external returns (bool) {
        return _run(id);
    }

    function _run(bytes32 id) internal returns (bool) {
        Entry storage entry = registry[id];
        uint256 prevPing = entry.lastPing;
        if (now != prevPing) {
            uint256 dueTime = entry.dueTime;

            if (now >= dueTime && prevPing < dueTime) {
                emit ChangedObligation(id, dueTime, entry.total);
            }

            entry.lastPing = uint64(now);
            return true;
        }
    }

    function _validate(bytes32[] data) internal view returns (bool) {
        require(data.length == C_PARAMS, "Wrong data arguments count");
        require(uint256(data[C_TOTAL]) < U_128_OVERFLOW, "Total overflow");
        require(uint64(data[C_DUE]) > now, "Expiration already past");
        return true;
    }
}