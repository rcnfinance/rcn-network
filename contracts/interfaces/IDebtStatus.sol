
pragma solidity ^0.8.12;


interface IDebtStatus {
    enum Status {
        NULL,
        ONGOING,
        PAID,
        DESTROYED, // Deprecated, used in basalt version
        ERROR
    }
}
