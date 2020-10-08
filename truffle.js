module.exports = {
    compilers: {
        solc: {
            version: '0.6.6',
            docker: false,
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200,
                },
                evmVersion: 'petersburg',
            },
        },
    },
    plugins: ['solidity-coverage'],
};
