import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@rumblefishdev/hardhat-kms-signer'
import dotenv from 'dotenv'
dotenv.config()

const KMS_KEY_ID = process.env.KMS_KEY_ID
const kmsConfig = KMS_KEY_ID ? { kmsKeyId: KMS_KEY_ID } : {}

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.28',
        settings: {
            evmVersion: 'istanbul',
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    mocha: {
        // Los tests corren contra la red local real (--network isbe), no contra una red en
        // memoria: cada tx espera confirmacion de bloque real. El timeout por defecto de
        // Mocha (2000ms) y el de hardhat-toolbox (40000ms) se quedan cortos.
        timeout: 180_000,
    },
    networks: {
        isbe: {
            url: process.env.ISBE_URL ?? process.env.LOCALHOST_URL ?? 'http://localhost:8545',
            chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 11073,
            accounts: KMS_KEY_ID
                ? 'remote'
                : process.env.ACCOUNT_PRIVATE_KEY
                    ? [process.env.ACCOUNT_PRIVATE_KEY]
                    : [],
            ...kmsConfig,
        },
    },
    etherscan: {
        apiKey: {
            isbe: 'empty',
        },
        customChains: [
            {
                network: 'isbe',
                chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 11073,
                urls: {
                    apiURL: 'https://blockscout-main.pre.portal.redisbe.com:443/api',
                    browserURL: 'https://blockscout-main.pre.portal.redisbe.com:443',
                },
            },
        ],
    },
}

export default config