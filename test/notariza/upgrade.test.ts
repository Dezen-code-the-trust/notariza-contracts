import { expect } from 'chai'
import { ethers, artifacts } from 'hardhat'
import { desplegarNotariza, registrarNuevaVersion, actualizarConfiguracion } from '../helpers/despliegue'
import { cuentaDePrueba, asegurarDidDePrueba, hashDePrueba } from '../helpers/cuentas'

describe('Notariza — upgrade del facet (Diamond)', () => {
    it('registrar NotarizaFacetV2 por los pasos 1 y 2 actualiza el proxy existente sin perder evidencias', async () => {
        const [admin] = await ethers.getSigners()
        const cuentaConDid = cuentaDePrueba(1)
        await asegurarDidDePrueba(admin, 1)

        const { proxy, resolverKey, configId } = await desplegarNotariza(admin)

        const { abi } = await artifacts.readArtifact('INotariza')
        const contrato = new ethers.Contract(proxy, abi, cuentaConDid)

        const hash = hashDePrueba('upgrade')
        await (await contrato.notarizar(hash)).wait()
        const evidenciaAntes = await contrato.verificar(hash)

        // Pasos 1 y 2 unicamente. El proxy se desplego con version = 0 ("siempre la ultima"),
        // asi que resuelve la version de configuracion de forma dinamica en cada llamada: no
        // hace falta repetir deployUseCase para que el proxy existente pase a usar la v2.
        // Este test asume acceso exclusivo a la red local durante su ejecucion: si otro proceso
        // registra una nueva version del facet bajo la misma resolverKey mientras este test
        // esta en su ventana registrar->actualizar configuracion, puede fallar por
        // interferencia, no por un defecto real.
        const { version } = await registrarNuevaVersion(admin, resolverKey, 'NotarizaFacetV2')
        await actualizarConfiguracion(admin, configId, resolverKey, version)

        const evidenciaDespues = await contrato.verificar(hash)
        expect(evidenciaDespues.timestamp).to.equal(evidenciaAntes.timestamp)
        expect(evidenciaDespues.emisor).to.equal(evidenciaAntes.emisor)
        expect(evidenciaDespues.did).to.equal(evidenciaAntes.did)

        // La v2 esta activa: expone la funcion nueva, ausente en la v1
        const contratoV2 = new ethers.Contract(
            proxy,
            [...abi, 'function versionModulo() view returns (string)'],
            cuentaConDid
        )
        expect(await contratoV2.versionModulo()).to.equal('v2-test-upgrade')

        // La regla de negocio (primer sellado gana) se preserva bajo la v2
        await expect(contrato.notarizar(hash))
            .to.be.revertedWithCustomError(contrato, 'YaNotarizado')
            .withArgs(hash, evidenciaAntes.timestamp)
    })
})
