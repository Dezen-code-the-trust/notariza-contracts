import { ethers, artifacts } from 'hardhat'
import { Mnemonic, HDNodeWallet, SigningKey, Contract, Signer } from 'ethers'
import { DIAMOND } from './constantes'

/** Mnemonic estandar de Hardhat/Anvil. Publica y de uso exclusivo en red local. */
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk'

/** SECP_256_K1 = 1, segun IDidDocumentDetailed.EllipticType: la curva de Ethereum/Hardhat. */
const ELLIPTIC_TYPE_SECP256K1 = 1

const NOT_BEFORE = 1
const NOT_AFTER = 4102444800 // 2100-01-01, vigencia larga para tests

/** Deriva y conecta al provider la cuenta de indice `indice` del mnemonic estandar. La red
 *  `isbe` solo expone un signer via ethers.getSigners() (la cuenta admin de .env): el resto de
 *  cuentas de prueba se derivan a mano, igual que en contracts/scripts/validateNotariza.ts. */
export function cuentaDePrueba(indice: number): HDNodeWallet {
    const mnemonic = Mnemonic.fromPhrase(HARDHAT_MNEMONIC)
    return HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${indice}`).connect(
        ethers.provider
    )
}

let inicializacionDidRegistry: Promise<void> | null = null

async function inicializarDidRegistrySiHaceFalta(admin: Signer): Promise<void> {
    const { abi } = await artifacts.readArtifact(
        '@red-isbe/isbe-contracts/contracts/identity/didregistry/interfaces/IDidDocumentDetailed.sol:IDidDocumentDetailed'
    )
    const didRegistry = new Contract(DIAMOND, abi, admin)
    const yaInicializado = await didRegistry.initializeDiDRegistry
        .staticCall(ELLIPTIC_TYPE_SECP256K1)
        .then(() => false)
        .catch(() => true)
    if (yaInicializado) return
    const tx = await didRegistry.initializeDiDRegistry(ELLIPTIC_TYPE_SECP256K1)
    await tx.wait()
}

/**
 * Registra DID de prueba para la cuenta de indice `indice` del mnemonic estandar de Hardhat, si
 * todavia no lo tiene. Idempotente: en la red local persistente puede haberse registrado ya en
 * una ejecucion anterior de la suite o de scripts/registerTestDid.ts. Misma logica que ese
 * script (insertFirstDidDocument con prueba de posesion real, sin mocks).
 */
export async function asegurarDidDePrueba(admin: Signer, indice: number): Promise<string> {
    if (!inicializacionDidRegistry) inicializacionDidRegistry = inicializarDidRegistrySiHaceFalta(admin)
    await inicializacionDidRegistry

    const cuenta = cuentaDePrueba(indice)

    const { abi: queryAbi } = await artifacts.readArtifact(
        '@red-isbe/isbe-contracts/contracts/identity/didregistry/interfaces/IDidRegistryQuery.sol:IDidRegistryQuery'
    )
    const didQuery = new Contract(DIAMOND, queryAbi, admin)
    if (await didQuery.isKnownDid(cuenta.address)) return cuenta.address

    const { abi } = await artifacts.readArtifact(
        '@red-isbe/isbe-contracts/contracts/identity/didregistry/interfaces/IDidDocumentDetailed.sol:IDidDocumentDetailed'
    )
    const didRegistry = new Contract(DIAMOND, abi, admin)

    const signingKey = new SigningKey(cuenta.privateKey)
    const publicKey = signingKey.publicKey // 65 bytes, prefijo 0x04
    const did = ethers.id(`did:isbe:dezen:notariza:test-${indice}`)
    const vMethodId = ethers.id(`did:isbe:dezen:notariza:test-${indice}#key-1`)

    // Prueba de posesion: la propia cuenta firma keccak256(publicKey), tal como valida
    // _validateProof() en DidDocumentDetailedInternal.sol.
    const digest = ethers.keccak256(publicKey)
    const proof = signingKey.sign(digest).serialized

    const tx = await didRegistry.insertFirstDidDocument(
        did,
        '{}', // baseDocument: JSON-LD minimo, sin datos personales
        vMethodId,
        proof,
        publicKey,
        ELLIPTIC_TYPE_SECP256K1,
        NOT_BEFORE,
        NOT_AFTER,
        `irn:orgs:dezen:notariza-test-${indice}`
    )
    await tx.wait()
    return cuenta.address
}

/** Resuelve el DID de una direccion contra el DidRegistry real, para comparar en asserts. */
export async function didDeCuenta(admin: Signer, direccion: string): Promise<string> {
    const { abi } = await artifacts.readArtifact(
        '@red-isbe/isbe-contracts/contracts/identity/didregistry/interfaces/IDidRegistryQuery.sol:IDidRegistryQuery'
    )
    const didQuery = new Contract(DIAMOND, abi, admin)
    return didQuery.didOf(direccion)
}

/** Hash unico de prueba, sufijado con `prefijo`, para no colisionar entre tests ni entre
 *  ejecuciones sobre la misma red local persistente. */
export function hashDePrueba(prefijo: string): string {
    return ethers.id(`notariza-${prefijo}-${Date.now()}-${Math.random()}`)
}
