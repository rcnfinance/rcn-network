#!/bin/bash
 
set -e
 
ganache-cli --gasLimit 10000000 2> /dev/null 1> /dev/null &
sleep 5 # to make sure ganache-cli is up and running before compiling
mkdir migrations
rm -rf build
truffle test
kill -9 $(lsof -t -i:8545)