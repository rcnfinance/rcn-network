pragma solidity ^0.5.10;


contract BytesUtils {
    function readBytes32(bytes memory data, uint256 index) internal pure returns (bytes32 o) {
        require(data.length / 32 > index, "Reading bytes out of bounds");
        assembly {
            o := mload(add(data, add(32, mul(32, index))))
        }
    }

    function read(bytes memory data, uint256 offset, uint256 length) internal pure returns (bytes32 o) {
        require(data.length >= offset + length, "Reading bytes out of bounds");
        assembly {
            o := mload(add(data, add(32, offset)))
            let lb := sub(32, length)
            if lb { o := div(o, exp(2, mul(lb, 8))) }
        }
    }

    function decode(
        bytes memory _data,
        uint256 _la
    ) internal pure returns (bytes32 _a) {
        require(_data.length >= _la, "Reading bytes out of bounds");
        assembly {
            _a := mload(add(_data, 32))
            let l := sub(32, _la)
            if l { _a := div(_a, exp(2, mul(l, 8))) }
        }
    }

    function decode(
        bytes memory _data,
        uint256 _la,
        uint256 _lb
    ) internal pure returns (bytes32 _a, bytes32 _b) {
        uint256 o;
        assembly {
            let s := add(_data, 32)
            _a := mload(s)
            let l := sub(32, _la)
            if l { _a := div(_a, exp(2, mul(l, 8))) }
            o := add(s, _la)
            _b := mload(o)
            l := sub(32, _lb)
            if l { _b := div(_b, exp(2, mul(l, 8))) }
            o := sub(o, s)
        }
        require(_data.length >= o, "Reading bytes out of bounds");
    }

    function decode(
        bytes memory _data,
        uint256 _la,
        uint256 _lb,
        uint256 _lc
    ) internal pure returns (bytes32 _a, bytes32 _b, bytes32 _c) {
        uint256 o;
        assembly {
            let s := add(_data, 32)
            _a := mload(s)
            let l := sub(32, _la)
            if l { _a := div(_a, exp(2, mul(l, 8))) }
            o := add(s, _la)
            _b := mload(o)
            l := sub(32, _lb)
            if l { _b := div(_b, exp(2, mul(l, 8))) }
            o := add(o, _lb)
            _c := mload(o)
            l := sub(32, _lc)
            if l { _c := div(_c, exp(2, mul(l, 8))) }
            o := sub(o, s)
        }
        require(_data.length >= o, "Reading bytes out of bounds");
    }

    function decode(
        bytes memory _data,
        uint256 _la,
        uint256 _lb,
        uint256 _lc,
        uint256 _ld
    ) internal pure returns (bytes32 _a, bytes32 _b, bytes32 _c, bytes32 _d) {
        uint256 o;
        assembly {
            let s := add(_data, 32)
            _a := mload(s)
            let l := sub(32, _la)
            if l { _a := div(_a, exp(2, mul(l, 8))) }
            o := add(s, _la)
            _b := mload(o)
            l := sub(32, _lb)
            if l { _b := div(_b, exp(2, mul(l, 8))) }
            o := add(o, _lb)
            _c := mload(o)
            l := sub(32, _lc)
            if l { _c := div(_c, exp(2, mul(l, 8))) }
            o := add(o, _lc)
            _d := mload(o)
            l := sub(32, _ld)
            if l { _d := div(_d, exp(2, mul(l, 8))) }
            o := sub(o, s)
        }
        require(_data.length >= o, "Reading bytes out of bounds");
    }

    function decode(
        bytes memory _data,
        uint256 _la,
        uint256 _lb,
        uint256 _lc,
        uint256 _ld,
        uint256 _le
    ) internal pure returns (bytes32 _a, bytes32 _b, bytes32 _c, bytes32 _d, bytes32 _e) {
        uint256 o;
        assembly {
            let s := add(_data, 32)
            _a := mload(s)
            let l := sub(32, _la)
            if l { _a := div(_a, exp(2, mul(l, 8))) }
            o := add(s, _la)
            _b := mload(o)
            l := sub(32, _lb)
            if l { _b := div(_b, exp(2, mul(l, 8))) }
            o := add(o, _lb)
            _c := mload(o)
            l := sub(32, _lc)
            if l { _c := div(_c, exp(2, mul(l, 8))) }
            o := add(o, _lc)
            _d := mload(o)
            l := sub(32, _ld)
            if l { _d := div(_d, exp(2, mul(l, 8))) }
            o := add(o, _ld)
            _e := mload(o)
            l := sub(32, _le)
            if l { _e := div(_e, exp(2, mul(l, 8))) }
            o := sub(o, s)
        }
        require(_data.length >= o, "Reading bytes out of bounds");
    }

    function decode(
        bytes memory _data,
        uint256 _la,
        uint256 _lb,
        uint256 _lc,
        uint256 _ld,
        uint256 _le,
        uint256 _lf
    ) internal pure returns (
        bytes32 _a,
        bytes32 _b,
        bytes32 _c,
        bytes32 _d,
        bytes32 _e,
        bytes32 _f
    ) {
        uint256 o;
        assembly {
            let s := add(_data, 32)
            _a := mload(s)
            let l := sub(32, _la)
            if l { _a := div(_a, exp(2, mul(l, 8))) }
            o := add(s, _la)
            _b := mload(o)
            l := sub(32, _lb)
            if l { _b := div(_b, exp(2, mul(l, 8))) }
            o := add(o, _lb)
            _c := mload(o)
            l := sub(32, _lc)
            if l { _c := div(_c, exp(2, mul(l, 8))) }
            o := add(o, _lc)
            _d := mload(o)
            l := sub(32, _ld)
            if l { _d := div(_d, exp(2, mul(l, 8))) }
            o := add(o, _ld)
            _e := mload(o)
            l := sub(32, _le)
            if l { _e := div(_e, exp(2, mul(l, 8))) }
            o := add(o, _le)
            _f := mload(o)
            l := sub(32, _lf)
            if l { _f := div(_f, exp(2, mul(l, 8))) }
            o := sub(o, s)
        }
        require(_data.length >= o, "Reading bytes out of bounds");
    }

}
