module.exports = {
    compilers: {
        solc: {
            version: '0.5.11',
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
