pragma solidity ^0.4.19;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/diaspore/model/InstallmentsDebtModel.sol";


contract InstallmentsModelTest {
    InstallmentsDebtModel public model;

    function beforeAll() external {
        model = new InstallmentsDebtModel();
        model.setEngine(address(this));
    }

    function toInterestRate(
        uint256 interest
    ) internal pure returns (uint256) {
        return (10000000 * 360 * 86400) / interest;
    }

    function buildData(
        uint256 cuota,
        uint256 interestRate,
        uint256 installments,
        uint256 duration
    ) internal pure returns (bytes32[]) {
        bytes32[] memory result = new bytes32[](4);
        result[0] = bytes32(cuota);
        result[1] = bytes32(interestRate);
        result[2] = bytes32(installments);
        result[3] = bytes32(duration);
        return result;
    }

    function toWei(
        uint256 amount
    ) internal pure returns (uint256) {
        return amount * 10 ** 18;
    }

    function testLoanSingleInstallment() external {
        bytes32 id = bytes32(2);
        
        model.create(id, buildData(toWei(110), toInterestRate(20), 1, 86400 * 360));

        require(model.advanceClock(id, now), "Clock didn't move");
        require(model.addPaid(id, toWei(110)) == toWei(110), "Paid amount not accepted");
        require(model.getStatus(id) == 2, "Status should be paid");
        require(model.getPaid(id) == toWei(110), "Paid should be 110");   
    }

    function testPayLoanInAdvance() external {
        bytes32 id = bytes32(3);

        bytes32[] memory data = buildData(110, toInterestRate(240), 10, 30 * 86400);
        require(model.validate(data), "Loan data should be valid");
        require(model.create(id, data), "Create should return true");

        require(model.advanceClock(id, now), "Clock didn't move");
        require(model.addPaid(id, 4000) == 1100, "Paid amount not accepted");
        require(model.getStatus(id) == 2, "Status should be paid");
        require(model.getPaid(id) == 1100, "Paid should be 110");   
    }

    function testPayLoanInAdvancePartially() external {
        bytes32 id = bytes32(6);
        bytes32[] memory data = buildData(110, toInterestRate(240), 10, 30 * 86400);
        require(model.validate(data), "Loan data should be valid");
        require(model.create(id, data), "Create should return true");

        require(model.advanceClock(id, now), "Clock didn't move");
        require(model.addPaid(id, 330) == 330, "Paid amount not accepted");
        require(model.getPaid(id) == 330, "Paid should be 330");
        require(model.getDebt(id) == 110, "Current debt should be 110 (next installment)");
    }
}