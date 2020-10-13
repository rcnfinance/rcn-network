
pragma solidity ^0.6.6;


interface IDebtStatus {
    enum Status {
        NULL,
        ONGOING,
        PAID,
        DESTROYED, // Deprecated, used in basalt version
        ERROR
    }
}
