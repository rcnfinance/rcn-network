module.exports = {
    solc: {
        optimizer: {
            enabled: true,
            runs: 200,
        },
    },
    networks: {
        coverage: {
            host: 'localhost',
            network_id: '*', // eslint-disable-line camelcase
            port: 8545,
            gas: 0xfffffffffff,
            gasPrice: 0x01,
        },
        development: {
            host: 'localhost',
            port: 8545,
            network_id: '*', // eslint-disable-line camelcase
        },
    },

};
