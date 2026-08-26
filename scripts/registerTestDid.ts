/**
 * Registra DIDs de prueba en el DidRegistry del Diamond de gobernanza, para poder ejercitar
 * el camino feliz de `notarizar` en la red local (T4). No se usa en PRE: el registro de
 * identidades reales es responsabilidad de ISBE.
 *
 * Decision documentada en HISTORIAL.md:
 * - El registro se hace con insertFirstDidDocument(), llamado por la cuenta admin local
 *   (#0 de Hardhat), que ya tiene _DID_REGISTRY_ROLE concedido en el genesis de la red local.
 * - El DidRegistry del Diamond de gobernanza local NO viene con initializeDiDRegistry()
 *   ejecutado (a diferencia de lo que cabria esperar de una replica de PRE); es un hueco del
 *   genesis de isbe-network-case, no algo que dependa de nuestro modulo. Este script lo
 *   inicializa una vez, con SECP_256_K1 (la curva de las cuentas Ethereum/Hardhat), antes de
 *   insertar el primer documento. En PRE esto ya estara hecho por ISBE.
 * - Se registran las cuentas #0 y #1 de Hardhat (mnemonic "test test test ... junk"): para
 *   cada una se usa su clave publica real y una firma propia como prueba de posesion,
 *   exactamente como exige _validateProof en DidDocumentDetailedInternal.sol. No se mockea
 *   nada: se ejercita el flujo real de la libreria.
 *
 * Nota: al registrar tambien la #0, se pierde la cuenta "sin identidad" a mano para
 * demostrar el revert IdentidadNoRegistrada. Para eso usar la cuenta #2 de Hardhat, que sigue
 * sin DID.
 *
 * Uso:
 *   npx hardhat run contracts/scripts/registerTestDid.ts --network isbe
 */
import { ethers, artifacts } from 'hardhat'
import { Mnemonic, HDNodeWallet, SigningKey, Contract } from 'ethers'

// --- Constantes --------------------------------------------------------------

/** Diamond de gobernanza de ISBE (genesis). Misma direccion en local y en PRE. */
const DIAMOND = '0x00000000000000000000000000000000000015BE'

/** Mnemonic estandar de Hardhat/Anvil. Publica y de uso exclusivo en red local. */
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk'

/** SECP_256_K1 = 1, segun IDidDocumentDetailed.EllipticType: la curva de Ethereum/Hardhat. */
const ELLIPTIC_TYPE_SECP256K1 = 1

const NOT_BEFORE = 1
const NOT_AFTER = 4102444800 // 2100-01-01, vigencia larga para pruebas locales

/** Cuentas de Hardhat a las que se registra identidad de prueba. */
const CUENTAS_A_REGISTRAR = [0, 1]

async function registrarDid(
    indice: number,
    admin: Awaited<ReturnType<typeof ethers.getSigners>>[number],
    didRegistry: Contract,
    didQuery: Contract
) {
    const mnemonic = Mnemonic.fromPhrase(HARDHAT_MNEMONIC)
    const cuenta = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${indice}`)
    const signingKey = new SigningKey(cuenta.privateKey)
    const publicKey = signingKey.publicKey // 65 bytes, prefijo 0x04

    const did = ethers.id(`did:isbe:dezen:notariza:test-${indice}`)
    const vMethodId = ethers.id(`did:isbe:dezen:notariza:test-${indice}#key-1`)

    console.log(`\nCuenta #${indice}:`, cuenta.address)

    const yaExiste = await didQuery.isKnownDid(cuenta.address)
    if (yaExiste) {
        console.log('   ya tiene identidad activa; nada que hacer.')
        return
    }

    // Prueba de posesion: la propia cuenta firma keccak256(publicKey), tal como valida
    // _validateProof() en DidDocumentDetailedInternal.sol (ecrecover directo, sin prefijo EIP-191).
    const digest = ethers.keccak256(publicKey)
    const proof = signingKey.sign(digest).serialized

    const tx = await didRegistry.connect(admin).insertFirstDidDocument(
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
    const receipt = await tx.wait()
    console.log('   registrado. txid:', tx.hash, '| gas:', receipt.gasUsed.toString())
    console.log('   DID:', did)
}

async function main() {
    const [admin] = await ethers.getSigners()
    console.log('Cuenta admin (_DID_REGISTRY_ROLE):', admin.address)

    const { abi } = await artifacts.readArtifact(
        '@red-isbe/isbe-contracts/contracts/identity/didregistry/interfaces/IDidDocumentDetailed.sol:IDidDocumentDetailed'
    )
    const didRegistry = new ethers.Contract(DIAMOND, abi, admin)

    const { abi: queryAbi } = await artifacts.readArtifact(
        '@red-isbe/isbe-contracts/contracts/identity/didregistry/interfaces/IDidRegistryQuery.sol:IDidRegistryQuery'
    )
    const didQuery = new ethers.Contract(DIAMOND, queryAbi, admin)

    // Paso 0: inicializar el DidRegistry si la red local aun no lo ha hecho (hueco del genesis
    // local; en PRE ya lo hace ISBE). Idempotente: si ya esta inicializado, se ignora el revert.
    const yaInicializado = await didRegistry.initializeDiDRegistry
        .staticCall(ELLIPTIC_TYPE_SECP256K1)
        .then(() => false)
        .catch(() => true)
    if (!yaInicializado) {
        console.log('\n[0] Inicializando DidRegistry con SECP_256_K1 (primera vez en esta red)')
        const txInit = await didRegistry.initializeDiDRegistry(ELLIPTIC_TYPE_SECP256K1)
        await txInit.wait()
        console.log('    txid:', txInit.hash)
    } else {
        console.log('\n[0] DidRegistry ya estaba inicializado')
    }

    for (const indice of CUENTAS_A_REGISTRAR) {
        await registrarDid(indice, admin, didRegistry, didQuery)
    }
}

main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})
