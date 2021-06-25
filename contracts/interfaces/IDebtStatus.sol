
pragma solidity ^0.8.0;


interface IDebtStatus {
    enum Status {
        NULL,
        ONGOING,
        PAID,
        DESTROYED, // Deprecated, used in basalt version
        ERROR
    }
}
