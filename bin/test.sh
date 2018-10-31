#!/usr/bin/env bash

# Start testrpc
node_modules/.bin/ganache-cli --gasLimit 0xfffffffffff > /dev/null &

# Run truffle tests
node_modules/.bin/truffle test "$@"
