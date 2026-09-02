import { ethers, artifacts } from 'hardhat'
import { Interface, Signer, TransactionReceipt, LogDescription } from 'ethers'
import { readFileSync } from 'fs'
import { DIAMOND, NOTARIZA_RESOLVER_KEY, NOTARIZA_ADMIN_ROLE, PAUSER_ROLE } from './constantes'

function getIsbeFactoryInterface(): Interface {
    const abiPath = require.resolve(
        '@red-isbe/isbe-contracts/artifacts/contracts/factory/IIsbeFactory.sol/IIsbeFactory.json'
    )
    const { abi } = JSON.parse(readFileSync(abiPath, 'utf8')) as { abi: unknown[] }
    return new ethers.Interface(abi as never)
}

function getEventoDelRecibo(
    eventName: string,
    receipt: TransactionReceipt,
    iface: Interface
): LogDescription {
    for (const log of receipt.logs) {
        try {
            const parsed = iface.parseLog(log)
            if (parsed?.name === eventName) return parsed
        } catch {
            // log de otro contrato, se ignora
        }
    }
    throw new Error(`Evento '${eventName}' no encontrado en el recibo (bloque ${receipt.blockNumber})`)
}

async function enviar(
    data: string,
    signer: Signer,
    iface: Interface,
    eventName: string
): Promise<LogDescription> {
    const tx = await signer.sendTransaction({ to: DIAMOND, data, gasLimit: 25_000_000 })
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) throw new Error('La transaccion fallo o revirtio')
    return getEventoDelRecibo(eventName, receipt, iface)
}

export interface NotarizaDesplegado {
    proxy: string
    implementacion: string
    resolverKey: string
    configId: string
}

/**
 * Despliega el modulo Notariza por los 3 pasos oficiales contra el Diamond de gobernanza,
 * igual que contracts/scripts/deployNotariza.ts, pero parametrizable para test: cada test de
 * integracion/upgrade necesita su propio proxy y su propia configId, aislados de los de otros
 * tests que comparten la misma red local persistente.
 */
export async function desplegarNotariza(
    admin: Signer,
    opciones: { nombreContrato?: string } = {}
): Promise<NotarizaDesplegado> {
    const iface = getIsbeFactoryInterface()
    const resolverKey = NOTARIZA_RESOLVER_KEY
    const facetArtifact = await artifacts.readArtifact(opciones.nombreContrato ?? 'NotarizaFacet')

    const paso1 = await enviar(
        iface.encodeFunctionData('deploy', [resolverKey, facetArtifact.bytecode]),
        admin,
        iface,
        'Deployed'
    )
    const implementacion = paso1.args.businessAddress as string
    const version = paso1.args.version as bigint

    // configId propio por despliegue: no interferir con otros tests que reutilizan la misma
    // red persistente.
    const configId = ethers.id(`notariza-test-config-${Date.now()}-${Math.random()}`)
    // setConfiguration fija un snapshot de la version indicada: debe ser la que se acaba de
    // registrar en el paso 1, no un literal.
    await enviar(
        iface.encodeFunctionData('setConfiguration', [
            configId,
            [{ businessId: resolverKey, version }],
        ]),
        admin,
        iface,
        'ConfigurationSet'
    )

    const rbacs = [
        { role: PAUSER_ROLE, members: [await admin.getAddress()] },
        { role: NOTARIZA_ADMIN_ROLE, members: [await admin.getAddress()] },
    ]
    const paso3 = await enviar(
        // version = 0: el proxy resuelve siempre "la ultima" configId en cada llamada. Es lo
        // que hace posible el test de upgrade sin volver a llamar a deployUseCase.
        iface.encodeFunctionData('deployUseCase', [configId, 0, rbacs, false, [], []]),
        admin,
        iface,
        'UseCaseDeployed'
    )
    const proxy = paso3.args.proxy as string

    return { proxy, implementacion, resolverKey, configId }
}

/** Paso 1 aislado: registra una nueva version del facet bajo la misma resolverKey. */
export async function registrarNuevaVersion(
    admin: Signer,
    resolverKey: string,
    nombreContrato: string
): Promise<{ implementacion: string; version: bigint }> {
    const iface = getIsbeFactoryInterface()
    const artifact = await artifacts.readArtifact(nombreContrato)
    const evento = await enviar(
        iface.encodeFunctionData('deploy', [resolverKey, artifact.bytecode]),
        admin,
        iface,
        'Deployed'
    )
    return {
        implementacion: evento.args.businessAddress as string,
        version: evento.args.version as bigint,
    }
}

/** Paso 2 aislado: apunta una configId existente a una version concreta del facet. */
export async function actualizarConfiguracion(
    admin: Signer,
    configId: string,
    resolverKey: string,
    version: bigint | number
): Promise<void> {
    const iface = getIsbeFactoryInterface()
    await enviar(
        iface.encodeFunctionData('setConfiguration', [
            configId,
            [{ businessId: resolverKey, version }],
        ]),
        admin,
        iface,
        'ConfigurationSet'
    )
}
