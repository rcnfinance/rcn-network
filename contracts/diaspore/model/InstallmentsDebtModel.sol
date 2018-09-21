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
        _supportedInterface[this.getClock.selector] = true;
        _supportedInterface[this.getDueTime.selector] = true;
        _supportedInterface[this.create.selector] = true;
        _supportedInterface[this.addPaid.selector] = true;
        _supportedInterface[this.advanceClock.selector] = true;
    }

    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        return 
            interfaceId == this.supportsInterface.selector ||
            interfaceId == debtModelInterface ||
            _supportedInterface[interfaceId];
    }

    mapping(bytes32 => Config) public configs;
    mapping(bytes32 => State) public states;

    uint256 public constant C_PARAMS = 4;
    uint256 public constant C_CUOTA = 0;
    uint256 public constant C_INTEREST_RATE = 1;
    uint256 public constant C_INSTALLMENTS = 2;
    uint256 public constant C_INSTALLMENT_DURATION = 3;

    struct Config {
        uint24 installments;
        uint40 installmentDuration;
        uint64 lentTime;
        uint128 cuota;
        uint256 interestRate;
    }

    struct State {
        uint8 status;
        uint64 clock;
        uint128 accrued;
        uint128 paid;
        uint128 paidBase;
        uint128 interest;
        uint256 interestRate;
    }

    function create(bytes32 id, bytes32[] data) external onlyOwner returns (bool) {
        require(configs[id].cuota == 0, "Entry already exist");
        _validate(data);
        
        configs[id] = Config({
            installments: uint24(data[C_INSTALLMENTS]),
            installmentDuration: uint40(data[C_INSTALLMENT_DURATION]),
            lentTime: uint64(now),
            cuota: uint128(data[C_CUOTA]),
            interestRate: uint256(data[C_INTEREST_RATE])
        });

        return true;
    }

    function advanceClock(bytes32 id, uint256 to) external onlyOwner returns (bool) {
        Config memory config = configs[id];
        State storage state = states[id];
        uint64 clock = state.clock != 0 ? state.clock : config.lentTime;
        uint64 nextInstallmentDelta = config.installmentDuration - clock % config.installmentDuration;
        uint64 currentInstallment = clock / config.installmentDuration;
        uint64 delta = nextInstallmentDelta < targetDelta && currentInstallment < config.installments ? nextInstallmentDelta : to - state.clock;
        
    }

    function _advanceClock(bytes32 id, uint256 to) internal returns (bool) {
        /*
        // Advance no more than the next installment unless we passed the last one
        uint64 nextInstallmentDelta = loan.installmentDuration - loan.clock % loan.installmentDuration;
        uint64 currentInstallment = loan.clock / loan.installmentDuration;
        uint64 delta = nextInstallmentDelta < targetDelta && currentInstallment < loan.installments ? nextInstallmentDelta : targetDelta;

        uint128 runningDebt = _baseDebt(loan) - loan.paidBase;
        uint128 newInterest = uint128(calculateInterest(delta, loan.interestRatePunitory, runningDebt));
        loan.interest += newInterest;

        emit AccruedInterest(loan.clock, delta, runningDebt, newInterest, loan.paid, loan.paidBase);

        // Don't change clock unless we have a change
        if (newInterest > 0 || delta == nextInstallmentDelta) {
            loan.clock += delta;
            return true;
        }
        */
    }

    function validate(bytes32[] data) external view returns (bool) {
        return _validate(data);
    }

    function _validate(bytes32[] memory data) internal pure returns (bool) {
        require(data.length == C_PARAMS, "Wrong loan data arguments count");
        require(uint256(data[C_CUOTA]) < 340282366920938463463374607431768211456, "Cuota too high");
        require(uint128(data[C_CUOTA]) > 0, "Cuota can't be 0");
        require(uint256(data[C_INTEREST_RATE]) > 1000, "Interest rate too high");
        require(uint256(data[C_INSTALLMENTS]) < 16777216, "Too many installments");
        require(uint24(data[C_INSTALLMENTS]) > 0, "Installments can't be 0");
        require(uint256(data[C_INSTALLMENT_DURATION]) < 1099511627776, "Installment duration too long");
        require(uint40(data[C_INSTALLMENT_DURATION]) > 0, "Installment duration can't be 0");
        return true;
    }
}