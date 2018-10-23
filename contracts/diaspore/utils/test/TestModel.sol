pragma solidity ^0.4.24;

import "./../../interfaces/Model.sol";
import "./../../../utils/Ownable.sol";
import "./../../../utils/BytesUtils.sol";

contract TestModel is BytesUtils, Ownable, Model {
    uint256 public constant L_DATA = 16 + 8;

    uint256 private constant U_128_OVERFLOW = 2 ** 128;
    uint256 private constant U_64_OVERFLOW = 2 ** 64;

    uint256 public constant ERROR_PAY = 1;
    uint256 public constant ERROR_INFINITE_LOOP_PAY = 2;
    uint256 public constant ERROR_STATUS = 3;
    uint256 public constant ERROR_INFINITE_LOOP_STATUS = 4;
    uint256 public constant ERROR_WRITE_STORAGE_STATUS = 5;
    uint256 public constant ERROR_RUN = 6;
    uint256 public constant ERROR_INFINITE_LOOP_RUN = 7;

    event SetEngine(address _engine);
    event SetErrorFlag(bytes32 _id, uint256 _flag);

    mapping(bytes4 => bool) private _supportedInterface;

    constructor() public {
        _supportedInterface[this.owner.selector] = true;
        _supportedInterface[this.validate.selector] = true;
        _supportedInterface[this.getStatus.selector] = true;
        _supportedInterface[this.getPaid.selector] = true;
        _supportedInterface[this.getClosingObligation.selector] = true;
        _supportedInterface[this.getDueTime.selector] = true;
        _supportedInterface[this.getFinalTime.selector] = true;
        _supportedInterface[this.getFrequency.selector] = true;
        _supportedInterface[this.getEstimateObligation.selector] = true;
        _supportedInterface[this.addDebt.selector] = true; // ??? Not supported
        _supportedInterface[this.run.selector] = true;
        _supportedInterface[this.create.selector] = true;
        _supportedInterface[this.addPaid.selector] = true;
        _supportedInterface[this.engine.selector] = true;
        _supportedInterface[this.getObligation.selector] = true;
    }

    function encodeData(
        uint128 _total,
        uint64 _dueTime
    ) external pure returns (bytes) {
        return abi.encodePacked(_total, _dueTime);
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

    function setErrorFlag(bytes32 _id, uint64 _flag) external onlyOwner {
        registry[_id].errorFlag = _flag;
        emit SetErrorFlag(_id, _flag);
    }

    function setEngine(address _engine) external onlyOwner {
        engine = _engine;
        emit SetEngine(_engine);
    }

    function modelId() external view returns (bytes32) {
        // TestModel 0.0.1
        return 0x546573744d6f64656c20302e302e310000000000000000000000000000000000;
    }

    function descriptor() external view returns (address) {
        return address(0);
    }

    function isOperator(address operator) external view returns (bool) {
        return operator == owner;
    }

    function validate(bytes data) external view returns (bool) {
        require(data.length == L_DATA, "Invalid data length");
        _validate(uint64(read(data, 16, 8)));
        return true; 
    }

    function getStatus(bytes32 id) external view returns (uint256) {
        Entry storage entry = registry[id];

        if (entry.errorFlag == ERROR_STATUS) {
            return uint256(10) / uint256(0);
        } else if (entry.errorFlag == ERROR_INFINITE_LOOP_STATUS) {
            uint256 aux;
            while(aux / aux != 2) aux++;
            return aux;
        } else if (entry.errorFlag == ERROR_WRITE_STORAGE_STATUS) {
            entry.lastPing = uint64(now);
        }

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

    function getFrequency(bytes32) external view returns (uint256) {
        return 0;
    }

    function getInstallments(bytes32) external view returns (uint256) {
        return 1;
    }

    function getEstimateObligation(bytes32 id) external view returns (uint256) {
        Entry storage entry = registry[id];
        return entry.total - entry.paid;
    }

    function create(bytes32 id, bytes data) external onlyEngine returns (bool) {
        require(data.length == L_DATA, "Invalid data length");

        (bytes32 btotal, bytes32 bdue) = decode(data, 16, 8);
        uint128 total = uint128(btotal);
        uint64 dueTime = uint64(bdue);

        _validate(dueTime);

        emit Created(id);

        registry[id] = Entry({
            errorFlag: 0,
            dueTime: dueTime,
            lastPing: uint64(now),
            total: total,
            paid: 0
        });

        emit ChangedStatus(id, now, STATUS_ONGOING);
        emit ChangedDueTime(id, now, dueTime);
        emit ChangedFinalTime(id, now, dueTime);

        return true;
    }

    function addPaid(bytes32 id, uint256 amount) external onlyEngine returns (uint256 real) {
        _run(id);
        
        Entry storage entry = registry[id];

        if (entry.errorFlag == ERROR_PAY) {
            return uint256(10) / uint256(0);
        } else if (entry.errorFlag == ERROR_INFINITE_LOOP_PAY) {
            uint256 aux;
            while(aux / aux != 2) aux++;
            return aux;
        }

        uint256 total = entry.total;
        uint256 paid = entry.paid;

        uint256 pending = total - paid;
        real = pending <= amount ? pending : amount;

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

        if (entry.errorFlag == ERROR_RUN) {
            return uint256(10) / uint256(0) == 9;
        } else if (entry.errorFlag == ERROR_INFINITE_LOOP_RUN) {
            uint256 aux;
            while(aux / aux != 2) aux++;
            return aux == 1;
        }

        if (now != prevPing) {
            uint256 dueTime = entry.dueTime;

            if (now >= dueTime && prevPing < dueTime) {
                emit ChangedObligation(id, dueTime, entry.total);
            }

            entry.lastPing = uint64(now);
            return true;
        }
    }

    function _validate(uint256 due) internal view {
        require(due > now, "Due time already past");
    }
}