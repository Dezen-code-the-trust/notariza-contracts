/**
 * Despliegue del modulo Notariza contra el Diamond de gobernanza de ISBE, en los 3 pasos
 * oficiales: deploy (registro del bytecode) -> setConfiguration -> deployUseCase (proxy).
 *
 * Uso:
 *   npx hardhat run contracts/scripts/deployNotariza.ts --network isbe
 *
 * En la red local lo ejecuta la cuenta admin (#0 de Hardhat). En PRE lo ejecuta ISBE con
 * estos mismos parametros: el despliegue local es el ensayo general de la solicitud.
 */
import { ethers, artifacts } from 'hardhat'
import { Interface, Signer, TransactionReceipt } from 'ethers'
import { readFileSync } from 'fs'

// --- Constantes --------------------------------------------------------------

/** Diamond de gobernanza de ISBE (genesis). Misma direccion en local y en PRE. */
const DIAMOND = '0x00000000000000000000000000000000000015Be'

/**
 * Namespace del proyecto. Se derivan aqui con keccak256 en vez de pegar el hex a mano, por el
 * mismo motivo que en contracts/constants/constants.sol: que no puedan desincronizarse del
 * texto que las origina. Deben coincidir con las constantes del contrato.
 */
const NOTARIZA_RESOLVER_KEY = ethers.id('isbe.customers.dezen.notariza.resolver.key')
const NOTARIZA_CONFIG_ID = ethers.id('isbe.customers.dezen.notariza.configuration')
const NOTARIZA_ADMIN_ROLE = ethers.id('isbe.customers.dezen.role.notariza.admin')

/**
 * Rol de pausa de la libreria de ISBE (_PAUSER_ROLE de contracts/constants/roles.sol).
 * Se copia el hex de la libreria y no se deriva del string: hay constantes de roles.sol cuyo
 * hex no coincide con el keccak256 de su cadena documentada.
 *
 * _DEFAULT_ADMIN_ROLE, _ISBE_ROLE y _CONFIGURATION_MANAGER_ROLE NO se pasan aqui: la factoria
 * los rechaza con ForbiddenRole y los concede ella misma. Ver notas al final del fichero.
 */
const PAUSER_ROLE =
    '0x8c911f4537972e7549dbbd37a96b929a4b480f4fb156fc6344524bdf2ca50aa1'

// --- Utilidades --------------------------------------------------------------

function getIsbeFactoryInterface(): Interface {
    const abiPath = require.resolve(
        '@red-isbe/isbe-contracts/artifacts/contracts/factory/IIsbeFactory.sol/IIsbeFactory.json'
    )
    const { abi } = JSON.parse(readFileSync(abiPath, 'utf8')) as { abi: unknown[] }
    return new ethers.Interface(abi as never)
}

function getEventFromReceipt(
    eventName: string,
    receipt: TransactionReceipt,
    iface: Interface
) {
    for (const log of receipt.logs) {
        try {
            const parsed = iface.parseLog(log)
            if (parsed?.name === eventName) return parsed
        } catch {
            // log de otro contrato, se ignora
        }
    }
    throw new Error(
        `Evento '${eventName}' no encontrado en el recibo (bloque ${receipt.blockNumber})`
    )
}

async function enviar(
    descripcion: string,
    data: string,
    signer: Signer,
    iface: Interface,
    eventName: string
) {
    console.log(`Enviando transaccion ${descripcion}...`)
    const tx = await signer.sendTransaction({
        to: DIAMOND,
        data,
        gasLimit: 25_000_000,
    })
    console.log('   txid:', tx.hash)
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1)
        throw new Error(`La transaccion ${descripcion} fallo o revirtio`)
    console.log('   gas usado:', receipt.gasUsed.toString())
    return {
        event: getEventFromReceipt(eventName, receipt, iface),
        txid: tx.hash,
        gas: receipt.gasUsed.toString(),
    }
}

// --- Main --------------------------------------------------------------------

async function main() {
    const [signer] = await ethers.getSigners()
    const network = await ethers.provider.getNetwork()
    console.log('Cuenta:', signer.address)
    console.log('Chain ID:', network.chainId.toString())
    console.log('Diamond:', DIAMOND)

    const iface = getIsbeFactoryInterface()

    const facetArtifact = await artifacts.readArtifact('NotarizaFacet')
    const bytecode = facetArtifact.bytecode
    console.log('\nBytecode de NotarizaFacet:', bytecode.length / 2 - 1, 'bytes')

    // Paso 1: registrar la logica de negocio
    console.log('\n[1/3] Registrando NotarizaFacet como logica de negocio')
    console.log('   resolver key:', NOTARIZA_RESOLVER_KEY)
    const paso1 = await enviar(
        'deploy',
        iface.encodeFunctionData('deploy', [NOTARIZA_RESOLVER_KEY, bytecode]),
        signer,
        iface,
        'Deployed'
    )
    const implementacion = paso1.event.args.businessAddress as string
    console.log('   implementacion:', implementacion)
    console.log('   version:', paso1.event.args.version.toString())

    // Paso 2: asociar el facet a una configuracion
    console.log('\n[2/3] Fijando la configuracion del caso de uso')
    console.log('   config id:', NOTARIZA_CONFIG_ID)
    const paso2 = await enviar(
        'setConfiguration',
        iface.encodeFunctionData('setConfiguration', [
            NOTARIZA_CONFIG_ID,
            [{ businessId: NOTARIZA_RESOLVER_KEY, version: 1 }],
        ]),
        signer,
        iface,
        'ConfigurationSet'
    )
    console.log('   version de configuracion:', paso2.event.args.version.toString())

    // Paso 3: crear el proxy del caso de uso
    // Mapa de roles provisional para la red local: la cuenta admin local asume los dos roles
    // que la factoria permite fijar. El mapa definitivo de EOAs de Dezen se solicita
    // explicitamente en el expediente a ISBE. DEFAULT_ADMIN_ROLE lo concede la factoria a
    // quien envia esta transaccion.
    console.log('\n[3/3] Desplegando el proxy del caso de uso')
    const rbacs = [
        { role: PAUSER_ROLE, members: [signer.address] },
        { role: NOTARIZA_ADMIN_ROLE, members: [signer.address] },
    ]
    const paso3 = await enviar(
        'deployUseCase',
        iface.encodeFunctionData('deployUseCase', [
            NOTARIZA_CONFIG_ID,
            0, // version (0 = ultima)
            rbacs,
            false, // initPause
            [], // initBusinessIds
            [], // initData
        ]),
        signer,
        iface,
        'UseCaseDeployed'
    )
    const proxy = paso3.event.args.proxy as string

    console.log('\nDespliegue completado')
    console.log('-------------------------------------------------------------')
    console.log('  Diamond (gobernanza): ', DIAMOND)
    console.log('  Resolver key:         ', NOTARIZA_RESOLVER_KEY)
    console.log('  Config ID:            ', NOTARIZA_CONFIG_ID)
    console.log('  Implementacion:       ', implementacion)
    console.log('  Proxy de Notariza:    ', proxy)
    console.log('-------------------------------------------------------------')
    console.log('  paso 1 deploy           txid', paso1.txid, 'gas', paso1.gas)
    console.log('  paso 2 setConfiguration txid', paso2.txid, 'gas', paso2.gas)
    console.log('  paso 3 deployUseCase    txid', paso3.txid, 'gas', paso3.gas)
    console.log('-------------------------------------------------------------')
}

/**
 * Nota sobre el mapa de roles, verificada contra ProxyFactoryInternal de la libreria v0.2.1:
 *
 * _adaptRbacWithIsbeRoles() llama a _validateRolesThatCantBeInitializedByUser(), que revierte
 * con ForbiddenRole si el usuario pasa _DEFAULT_ADMIN_ROLE, _ISBE_ROLE o
 * _CONFIGURATION_MANAGER_ROLE. A continuacion _addDefaultAdminAndIsbeRoles() los concede la
 * propia factoria: DEFAULT_ADMIN_ROLE a _msgSender() y a la factoria, y los dos roles de ISBE
 * a la factoria.
 *
 * Consecuencia para el despliegue en PRE: DEFAULT_ADMIN_ROLE lo recibe quien ejecuta
 * deployUseCase, que sera ISBE y no nosotros. Cualquier concesion posterior de roles a las
 * EOAs de Dezen debe solicitarse explicitamente en el expediente.
 */
main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})
