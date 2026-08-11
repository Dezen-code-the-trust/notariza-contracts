/**
 * Validacion post-despliegue del modulo Notariza contra el proxy del caso de uso.
 *
 * Uso:
 *   NOTARIZA_PROXY=0x... npx hardhat run contracts/scripts/validateNotariza.ts --network isbe
 *
 * Todas las llamadas van al proxy, nunca al facet: una funcion que no este declarada en
 * selectorsIntrospection() compila y despliega, pero no es enrutable, y solo se detecta asi.
 */
import { ethers, artifacts } from 'hardhat'

const PROXY = process.env.NOTARIZA_PROXY

async function main() {
    if (!PROXY) throw new Error('Falta la variable de entorno NOTARIZA_PROXY')

    const [signer] = await ethers.getSigners()
    console.log('Proxy:', PROXY)
    console.log('Cuenta:', signer.address)

    const { abi } = await artifacts.readArtifact('INotariza')
    const notariza = new ethers.Contract(PROXY, abi, signer)

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

    // 3. notarizar
    console.log('\n[3] notarizar(hash)')
    const tx = await notariza.notarizar(hash)
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

    // 4. verificar devuelve la evidencia
    const evidencia = await notariza.verificar(hash)
    console.log('\n[4] verificar(hash)')
    console.log('    timestamp:', evidencia.timestamp.toString())
    console.log('    emisor:', evidencia.emisor)
    console.log('    did:', evidencia.did)

    // 5. estaNotarizado ahora devuelve true
    console.log('\n[5] estaNotarizado(hash):', await notariza.estaNotarizado(hash))

    // 6. re-notarizar revierte con YaNotarizado conservando el timestamp original
    console.log('\n[6] re-notarizar el mismo hash')
    try {
        await notariza.notarizar.staticCall(hash)
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

    // 7. hash vacio revierte con HashVacio
    console.log('\n[7] notarizar(bytes32(0))')
    try {
        await notariza.notarizar.staticCall(ethers.ZeroHash)
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
