#!/usr/bin/env bash

# Start testrpc
node_modules/.bin/testrpc-sc --gasLimit 0xfffffffffff  > /dev/null &

# Run solidity coverage
node_modules/.bin/solidity-coverage
cat coverage/lcov.info | node_modules/.bin/coveralls
