/**
 * Comprobacion empirica del storage del modulo Notariza, leyendo directamente los slots del
 * proxy con eth_getStorageAt.
 *
 * Uso:
 *   NOTARIZA_PROXY=0x... npx hardhat run contracts/scripts/checkStorage.ts --network isbe
 *
 * Verifica dos cosas que ningun compilador detecta y que, si estan mal, fallan en silencio:
 *
 *   1. La evidencia se escribe en keccak256(abi.encode(hash, _NOTARIZA_STORAGE_POSITION)),
 *      es decir, en el slot derivado del namespace y no en otro sitio.
 *   2. Los slots secuenciales 0, 1, 2... estan vacios: no hay ninguna variable de estado
 *      suelta fuera del struct de storage que pudiera colisionar con otra faceta.
 */
import { ethers, artifacts } from 'hardhat'

const PROXY = process.env.NOTARIZA_PROXY
const POSICION = ethers.id('isbe.customers.dezen.notariza.storage')

async function main() {
    if (!PROXY) throw new Error('Falta la variable de entorno NOTARIZA_PROXY')

    const [signer] = await ethers.getSigners()
    const { abi } = await artifacts.readArtifact('INotariza')
    const notariza = new ethers.Contract(PROXY, abi, signer)

    console.log('Proxy:', PROXY)
    console.log('_NOTARIZA_STORAGE_POSITION:', POSICION)

    // Se sella un hash conocido para poder buscarlo despues en el storage
    const hash = ethers.id('comprobacion-de-storage-' + (await ethers.provider.getBlockNumber()))
    await (await notariza.notarizar(hash)).wait()
    const evidencia = await notariza.verificar(hash)
    console.log('\nHash sellado:', hash)
    console.log('   timestamp:', evidencia.timestamp.toString(), '| emisor:', evidencia.emisor)

    // Posicion del valor de un mapping: keccak256(abi.encode(clave, slotDelMapping)).
    // El mapping es el primer y unico campo del struct, asi que su slot es la posicion base.
    const slotBase = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes32'], [hash, POSICION])
    )

    // Empaquetado de Evidencia: uint64 timestamp (8 bytes) + address emisor (20 bytes) caben
    // juntos en el primer slot; bytes32 did ocupa el segundo.
    const slot0 = await ethers.provider.getStorage(PROXY, slotBase)
    const slot1 = await ethers.provider.getStorage(PROXY, BigInt(slotBase) + 1n)

    const timestampEnStorage = BigInt('0x' + slot0.slice(-16))
    const emisorEnStorage = ethers.getAddress('0x' + slot0.slice(-56, -16))

    console.log('\n[1] Slot derivado del namespace')
    console.log('    slot:', slotBase)
    console.log('    crudo:', slot0)
    console.log('    timestamp decodificado:', timestampEnStorage.toString())
    console.log('    emisor decodificado:   ', emisorEnStorage)
    console.log('    did (slot+1):', slot1)

    const coincide =
        timestampEnStorage === evidencia.timestamp &&
        emisorEnStorage === ethers.getAddress(evidencia.emisor) &&
        slot1 === evidencia.did
    if (!coincide)
        throw new Error('La evidencia NO esta en el slot derivado del namespace')
    console.log('    coincide con verificar(): OK')

    // 2. Ninguna variable de estado suelta en los slots secuenciales
    console.log('\n[2] Slots secuenciales (deben estar todos a cero)')
    for (let slot = 0n; slot < 8n; slot++) {
        const valor = await ethers.provider.getStorage(PROXY, slot)
        const vacio = valor === ethers.ZeroHash
        console.log(`    slot ${slot}: ${vacio ? 'vacio' : 'OCUPADO -> ' + valor}`)
        if (!vacio)
            throw new Error(
                `El slot ${slot} no esta vacio: hay estado fuera del struct de storage`
            )
    }

    console.log('\nComprobacion de storage completada')
}

main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})
