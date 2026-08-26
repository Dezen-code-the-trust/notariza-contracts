/**
 * Validacion post-despliegue del modulo Notariza contra el proxy del caso de uso.
 *
 * Uso:
 *   NOTARIZA_PROXY=0x... npx hardhat run contracts/scripts/validateNotariza.ts --network isbe
 *
 * Todas las llamadas van al proxy, nunca al facet: una funcion que no este declarada en
 * selectorsIntrospection() compila y despliega, pero no es enrutable, y solo se detecta asi.
 *
 * Desde T4, `notarizar` exige identidad ISBE activa. registerTestDid.ts registra DID a las
 * cuentas #0 y #1 de Hardhat, asi que el paso que prueba el revert usa la cuenta #2 (sin DID).
 * El camino feliz se ejercita con la cuenta #1 — ejecutar registerTestDid.ts antes.
 */
import { ethers, artifacts } from 'hardhat'
import { Mnemonic, HDNodeWallet } from 'ethers'

const PROXY = process.env.NOTARIZA_PROXY
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk'

async function main() {
    if (!PROXY) throw new Error('Falta la variable de entorno NOTARIZA_PROXY')

    const [signer] = await ethers.getSigners()
    const mnemonic = Mnemonic.fromPhrase(HARDHAT_MNEMONIC)
    const cuentaConDid = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/1").connect(
        ethers.provider
    )
    const cuentaSinDid = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/2").connect(
        ethers.provider
    )
    console.log('Proxy:', PROXY)
    console.log('Cuenta admin:', signer.address)
    console.log('Cuenta de prueba (con DID):', cuentaConDid.address)
    console.log('Cuenta sin DID:', cuentaSinDid.address)

    const { abi } = await artifacts.readArtifact('INotariza')
    const notariza = new ethers.Contract(PROXY, abi, signer)
    const notarizaConDid = new ethers.Contract(PROXY, abi, cuentaConDid)
    const notarizaSinDid = new ethers.Contract(PROXY, abi, cuentaSinDid)

    // 1. La infraestructura de ISBE esta enrutada en el proxy.
    //    El README del template propone eip712Domain(), pero esa funcion no existe en
    //    @red-isbe/isbe-contracts v0.2.1 y el proxy revierte con FunctionNotFound. En su lugar
    //    se comprueban los dos facets que la factoria anade siempre (_PAUSE_RESOLVER_KEY y
    //    _ACCESS_CONTROL_RESOLVER_KEY), que ademas validan el mapa de roles.
    const infra = new ethers.Contract(
        PROXY,
        [
            'function paused() view returns (bool)',
            'function hasRole(bytes32 role, address account) view returns (bool)',
        ],
        signer
    )
    const PAUSER_ROLE =
        '0x8c911f4537972e7549dbbd37a96b929a4b480f4fb156fc6344524bdf2ca50aa1'
    const NOTARIZA_ADMIN_ROLE = ethers.id('isbe.customers.dezen.role.notariza.admin')
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash
    console.log('\n[1] Infraestructura de ISBE enrutada en el proxy')
    console.log('    paused():', await infra.paused())
    console.log('    hasRole(DEFAULT_ADMIN):', await infra.hasRole(DEFAULT_ADMIN_ROLE, signer.address))
    console.log('    hasRole(PAUSER):', await infra.hasRole(PAUSER_ROLE, signer.address))
    console.log('    hasRole(NOTARIZA_ADMIN):', await infra.hasRole(NOTARIZA_ADMIN_ROLE, signer.address))

    // 2. estaNotarizado sobre un hash nuevo devuelve false
    const hash = ethers.id('notariza-validacion-' + (await ethers.provider.getBlockNumber()))
    console.log('\n[2] estaNotarizado(hash nuevo):', await notariza.estaNotarizado(hash))

    // 3. notarizar sin identidad ISBE revierte con IdentidadNoRegistrada
    console.log('\n[3] notarizar(hash) desde la cuenta sin DID')
    try {
        await notarizaSinDid.notarizar.staticCall(hash)
        throw new Error('No revirtio: el gate de identidad no se esta aplicando')
    } catch (error: unknown) {
        const data = (error as { data?: string }).data
        const parsed = data ? notariza.interface.parseError(data) : null
        if (parsed?.name !== 'IdentidadNoRegistrada') throw error
        console.log('    revierte con IdentidadNoRegistrada, cuenta:', parsed.args.cuenta)
    }

    // 4. notarizar con identidad ISBE activa (cuenta de prueba)
    console.log('\n[4] notarizar(hash) desde la cuenta con DID')
    const tx = await notarizaConDid.notarizar(hash)
    const receipt = await tx.wait()
    console.log('    txid:', tx.hash, '| gas:', receipt.gasUsed.toString())
    const evento = receipt.logs
        .map((log: { topics: string[]; data: string }) => {
            try {
                return notariza.interface.parseLog(log)
            } catch {
                return null
            }
        })
        .find((parsed: { name: string } | null) => parsed?.name === 'Notarizado')
    if (!evento) throw new Error('No se emitio el evento Notarizado')
    console.log('    evento Notarizado: emisor', evento.args.emisor)
    console.log('                       did', evento.args.did)
    console.log('                       timestamp', evento.args.timestamp.toString())

    // 5. verificar devuelve la evidencia
    const evidencia = await notariza.verificar(hash)
    console.log('\n[5] verificar(hash)')
    console.log('    timestamp:', evidencia.timestamp.toString())
    console.log('    emisor:', evidencia.emisor)
    console.log('    did:', evidencia.did)

    // 6. estaNotarizado ahora devuelve true
    console.log('\n[6] estaNotarizado(hash):', await notariza.estaNotarizado(hash))

    // 7. re-notarizar revierte con YaNotarizado conservando el timestamp original
    console.log('\n[7] re-notarizar el mismo hash (con DID)')
    try {
        await notarizaConDid.notarizar.staticCall(hash)
        throw new Error('No revirtio: la regla del primer sellado no se esta aplicando')
    } catch (error: unknown) {
        const data = (error as { data?: string }).data
        const parsed = data ? notariza.interface.parseError(data) : null
        if (parsed?.name !== 'YaNotarizado') throw error
        console.log(
            '    revierte con YaNotarizado, timestamp original:',
            parsed.args.timestampOriginal.toString()
        )
    }

    // 8. hash vacio revierte con HashVacio antes de comprobar la identidad
    console.log('\n[8] notarizar(bytes32(0)) desde la cuenta sin DID')
    try {
        await notarizaSinDid.notarizar.staticCall(ethers.ZeroHash)
        throw new Error('No revirtio con HashVacio')
    } catch (error: unknown) {
        const data = (error as { data?: string }).data
        const parsed = data ? notariza.interface.parseError(data) : null
        if (parsed?.name !== 'HashVacio') throw error
        console.log('    revierte con HashVacio')
    }

    console.log('\nValidacion completada')
}

main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})
