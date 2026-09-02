/**
 * Registra DIDs de prueba en el DidRegistry del Diamond de gobernanza, para poder ejercitar
 * el camino feliz de `notarizar` en la red local. No se usa en PRE: el registro de
 * identidades reales es responsabilidad de ISBE.
 *
 * La logica de registro vive en contracts/test/helpers/cuentas.ts (asegurarDidDePrueba), para
 * no duplicarla entre este script y la suite de tests: ambos ejercitan el flujo real de
 * la libreria, sin mocks.
 *
 * Uso:
 *   npx hardhat run contracts/scripts/registerTestDid.ts --network isbe
 */
import { ethers } from 'hardhat'
import { asegurarDidDePrueba } from '../test/helpers/cuentas'

/** Cuentas de Hardhat a las que se registra identidad de prueba. */
const CUENTAS_A_REGISTRAR = [0, 1]

async function main() {
    const [admin] = await ethers.getSigners()
    console.log('Cuenta admin (_DID_REGISTRY_ROLE):', admin.address)

    for (const indice of CUENTAS_A_REGISTRAR) {
        const direccion = await asegurarDidDePrueba(admin, indice)
        console.log(`\nCuenta #${indice}:`, direccion, '— identidad activa')
    }
}

main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})
