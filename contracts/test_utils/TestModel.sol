/* solium-disable */
pragma solidity ^0.8.12;

import "../utils/ERC165.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../utils/BytesUtils.sol";


contract TestModel is ERC165, BytesUtils, Ownable {
    // This things should be heredit by the model interface but i need a getStatus not view
    bytes4 internal constant MODEL_INTERFACE = 0xaf498c35;

    uint256 public constant STATUS_ONGOING = 1;
    uint256 public constant STATUS_PAID = 2;
    uint256 public constant STATUS_ERROR = 4;
    event Created(bytes32 indexed _id);
    event ChangedStatus(bytes32 indexed _id, uint256 _timestamp, uint256 _status);
    event ChangedObligation(bytes32 indexed _id, uint256 _timestamp, uint256 _debt);
    event ChangedFrequency(bytes32 indexed _id, uint256 _timestamp, uint256 _frequency);
    event ChangedDueTime(bytes32 indexed _id, uint256 _timestamp, uint256 _status);
    event ChangedFinalTime(bytes32 indexed _id, uint256 _timestamp, uint64 _dueTime);
    event AddedDebt(bytes32 indexed _id, uint256 _amount);
    event AddedPaid(bytes32 indexed _id, uint256 _paid);


    uint256 public constant L_DATA = 16 + 8 + 16 + 8;

    uint256 private constant U_128_OVERFLOW = 2 ** 128;
    uint256 private constant U_64_OVERFLOW = 2 ** 64;

    uint256 public constant ERROR_PAY = 1;
    uint256 public constant ERROR_INFINITE_LOOP_PAY = 2;
    uint256 public constant ERROR_STATUS = 3;
    uint256 public constant ERROR_INFINITE_LOOP_STATUS = 4;
    uint256 public constant ERROR_WRITE_STORAGE_STATUS = 5;
    uint256 public constant ERROR_RUN = 6;
    uint256 public constant ERROR_INFINITE_LOOP_RUN = 7;
    uint256 public constant ERROR_CREATE = 8;
    uint256 public constant ERROR_PAY_EXTRA = 9;
    uint256 public constant ERROR_ALLOW_INFINITE_PAY = 10;

    event SetEngine(address _engine);
    event SetErrorFlag(bytes32 _id, uint256 _flag);
    event SetGlobalErrorFlag(uint256 _flag);
    event SetInterestAmount(uint256 _interestAmount);

    mapping(bytes4 => bool) private _supportedInterface;

    constructor() {
        _registerInterface(MODEL_INTERFACE);
    }

    function encodeData(
        uint128 _total,
        uint64 _dueTime,
        uint128 _interestAmount,
        uint64 _interestTime
    ) external pure returns (bytes memory) {
        return abi.encodePacked(_total, _dueTime, _interestAmount, _interestTime);
    }

    mapping(bytes32 => Entry) public registry;

    address public engine;
    uint256 public errorFlag;

    struct Entry {
        uint64 errorFlag;
        uint64 dueTime;
        uint64 lastPing;
        uint128 total;
        uint64 interestTime;
        uint128 interestAmount;
        uint128 paid;
    }

    modifier onlyEngine() {
        require(msg.sender == engine, "Sender is not engine");
        _;
    }

    function setGlobalErrorFlag(uint256 _flag) external onlyOwner {
        errorFlag = _flag;
        emit SetGlobalErrorFlag(_flag);
    }

    function setErrorFlag(bytes32 _id, uint64 _flag) external onlyOwner {
        registry[_id].errorFlag = _flag;
        emit SetErrorFlag(_id, _flag);
    }

    function setEngine(address _engine) external onlyOwner {
        engine = _engine;
        emit SetEngine(_engine);
    }

    function modelId() external pure returns (bytes32) {
        // TestModel 0.0.1
        return 0x546573744d6f64656c20302e302e310000000000000000000000000000000000;
    }

    function descriptor() external pure returns (address) {
        return address(0);
    }

    function isOperator(address _operator) external view returns (bool) {
        return _operator == owner();
    }

    function validate(bytes calldata _data) external view returns (bool) {
        require(_data.length == L_DATA, "Invalid data length");

        (bytes32 btotal, bytes32 bdue, , bytes32 binterestTime) = decode(_data, 16, 8, 16, 8);
        uint64 dueTime = uint64(uint256(bdue));
        uint64 interestTime = uint64(uint256(binterestTime));

        if (btotal == bytes32(uint256(0))) return false;

        _validate(dueTime, interestTime);
        return true;
    }

    function getStatus(bytes32 _id) external returns (uint256) {
        Entry storage entry = registry[_id];

        if (entry.errorFlag == ERROR_STATUS) {
            return uint256(10) / uint256(0);
        } else if (entry.errorFlag == ERROR_INFINITE_LOOP_STATUS) {
            uint256 aux;
            while (aux / aux != 2) aux++;
            return aux;
        } else if (entry.errorFlag == ERROR_WRITE_STORAGE_STATUS) {
            entry.lastPing = uint64(block.timestamp);
            return uint64(block.timestamp);
        }

        uint256 total = block.timestamp >= entry.interestTime ? entry.total + entry.interestAmount : entry.total;
        return entry.paid < total ? STATUS_ONGOING : STATUS_PAID;
    }

    function getPaid(bytes32 _id) external view returns (uint256) {
        return registry[_id].paid;
    }

    function getObligation(bytes32 _id, uint64 _time) external view returns (uint256 obligation, bool) {
        return _getObligation(_id, _time);
    }

    function _getObligation(bytes32 _id, uint64 _time) internal view returns (uint256 obligation, bool) {
        Entry storage entry = registry[_id];

        obligation = _time >= entry.interestTime
            ? entry.total + entry.interestAmount - entry.paid
            : _time >= entry.dueTime
                ? entry.total - entry.paid
                :0;

        return (obligation, true);
    }

    function getClosingObligation(bytes32 _id) external view returns (uint256) {
        return _getClosingObligation(_id);
    }

    function _getClosingObligation(bytes32 _id) internal view returns (uint256 obligation) {
        Entry storage entry = registry[_id];
        if (block.timestamp >= entry.dueTime) {
            (obligation, ) = _getObligation(_id, uint64(block.timestamp));
        } else {
            (obligation, ) = _getObligation(_id, entry.dueTime);
        }
    }

    function getDueTime(bytes32 _id) external view returns (uint256) {
        return registry[_id].dueTime;
    }

    function getFinalTime(bytes32 _id) external view returns (uint256) {
        return registry[_id].dueTime;
    }

    function getFrequency(bytes32) external pure returns (uint256) {
        return 0;
    }

    function getInstallments(bytes32) external pure returns (uint256) {
        return 1;
    }

    function getEstimateObligation(bytes32 _id) external view returns (uint256) {
        return _getClosingObligation(_id);
    }

    function create(bytes32 _id, bytes calldata _data) external onlyEngine returns (bool) {
        require(_data.length == L_DATA, "Invalid data length");

        if (errorFlag == ERROR_CREATE) return false;

        (bytes32 btotal, bytes32 bdue, bytes32 binterestAmount, bytes32 binterestTime) = decode(_data, 16, 8, 16, 8);
        uint128 total = uint128(uint256(btotal));
        uint64 dueTime = uint64(uint256(bdue));
        uint64 interestTime = uint64(uint256(binterestTime));
        uint128 interestAmount = uint128(uint256(binterestAmount));

        _validate(dueTime, interestTime);

        emit Created(_id);

        registry[_id] = Entry({
            errorFlag: 0,
            dueTime: dueTime,
            lastPing: uint64(block.timestamp),
            total: total,
            interestTime: interestTime,
            interestAmount: interestAmount,
            paid: 0
        });

        emit ChangedStatus(_id, block.timestamp, STATUS_ONGOING);
        emit ChangedDueTime(_id, block.timestamp, dueTime);
        emit ChangedFinalTime(_id, block.timestamp, dueTime);

        return true;
    }

    function addPaid(bytes32 _id, uint256 _amount) external onlyEngine returns (uint256 real) {
        _run(_id);

        Entry storage entry = registry[_id];

        if (entry.errorFlag == ERROR_PAY) {
            return uint256(10) / uint256(0);
        } else if (entry.errorFlag == ERROR_INFINITE_LOOP_PAY) {
            uint256 aux;
            while (aux / aux != 2) aux++;
            return aux;
        } else if (entry.errorFlag == ERROR_PAY_EXTRA) {
            return _amount + 5;
        } else if (entry.errorFlag == ERROR_ALLOW_INFINITE_PAY) {
            entry.paid += uint128(_amount);
            emit AddedPaid(_id, _amount);
            return _amount;
        }

        uint256 total = entry.total + (block.timestamp >= entry.interestTime ? entry.interestAmount : 0);
        uint256 paid = entry.paid;

        uint256 pending = total - paid;
        real = pending <= _amount ? pending : _amount;

        paid += real;
        require(paid < U_128_OVERFLOW, "Paid overflow");
        entry.paid = uint128(paid);

        emit AddedPaid(_id, real);
        if (paid == total) {
            emit ChangedStatus(_id, block.timestamp, STATUS_PAID);
        }
    }

    function addDebt(bytes32 _id, uint256 _amount) external returns (bool) {
        _run(_id);

        Entry storage entry = registry[_id];

        uint256 total = entry.total;
        uint256 paid = entry.paid;

        if (total > paid) {
            total += _amount;
            require(total < U_128_OVERFLOW, "Total overflow");
            entry.total = uint128(total);

            emit AddedDebt(_id, _amount);
            if (block.timestamp >= entry.dueTime) {
                emit ChangedObligation(_id, block.timestamp, total - paid);
            }

            return true;
        }
    }

    function run(bytes32 _id) external returns (bool) {
        return _run(_id);
    }

    function _run(bytes32 _id) internal returns (bool) {
        Entry storage entry = registry[_id];
        uint256 prevPing = entry.lastPing;

        if (entry.errorFlag == ERROR_RUN) {
            return uint256(10) / uint256(0) == 9;
        } else if (entry.errorFlag == ERROR_INFINITE_LOOP_RUN) {
            uint256 aux;
            while (aux / aux != 2) aux++;
            return aux == 1;
        }

        if (block.timestamp != prevPing) {
            uint256 dueTime = entry.dueTime;

            if (block.timestamp >= dueTime && prevPing < dueTime) {
                emit ChangedObligation(_id, dueTime, entry.total);
            }

            entry.lastPing = uint64(block.timestamp);
            return true;
        }
    }

    function setDueTime(bytes32 _id, uint64 _time) external {
        registry[_id].dueTime = _time;
    }

    function setRelativeDueTime(bytes32 _id, bool _before, uint256 _delta) external {
        if (_before) {
            registry[_id].dueTime = uint64(block.timestamp - _delta);
        } else {
            registry[_id].dueTime = uint64(block.timestamp + _delta);
        }
    }

    function _validate(uint256 _due, uint256 _interestTime) internal view {
        require(_due > block.timestamp, "TestModel._validate: Due time already past");
        require(_interestTime >= _due, "TestModel._validate: Interest time should be more or equal than due time");
    }

    // ** Test and debug methods ** //

    function setDebt(bytes32 _id, uint128 _val) external {
        registry[_id].total = _val;
    }
}