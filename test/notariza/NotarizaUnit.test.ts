import { expect } from 'chai'
import { ethers } from 'hardhat'
import { cuentaDePrueba, asegurarDidDePrueba } from '../helpers/cuentas'

describe('Notariza — unitarios (NotarizaTestWrapper, sin proxy)', () => {
    let wrapper: Awaited<ReturnType<typeof desplegarWrapper>>
    let admin: Awaited<ReturnType<typeof ethers.getSigners>>[number]
    let cuentaConDid: ReturnType<typeof cuentaDePrueba>
    let cuentaSinDid: ReturnType<typeof cuentaDePrueba>

    async function desplegarWrapper() {
        const contrato = await ethers.deployContract('NotarizaTestWrapper')
        // En la red persistente ethers.deployContract() resuelve en cuanto se envia la tx de
        // creacion, sin esperar a que se mine: hay que esperar el despliegue explicitamente
        // antes de llamar a initializeForTest, o la llamada revierte contra una direccion sin
        // codigo todavia.
        await contrato.waitForDeployment()
        await (await contrato.initializeForTest(admin.address)).wait()
        return contrato
    }

    function hashDePrueba(etiqueta: string) {
        return ethers.id(`notariza-unit-${etiqueta}-${Date.now()}-${Math.random()}`)
    }

    before(async () => {
        ;[admin] = await ethers.getSigners()
        // Indice 5 reservado a esta suite (evita colisionar con otras suites que tambien
        // reutilizan cuentas del mismo mnemonic sobre la red persistente).
        cuentaConDid = cuentaDePrueba(5)
        cuentaSinDid = cuentaDePrueba(6) // nunca se le registra DID
        await asegurarDidDePrueba(admin, 5)
        wrapper = await desplegarWrapper()
    })

    it('camino feliz: notarizar + verificar', async () => {
        const hash = hashDePrueba('feliz')
        const contrato = wrapper.connect(cuentaConDid)
        const tx = await contrato.notarizar(hash)
        const receipt = await tx.wait()
        const bloque = await ethers.provider.getBlock(receipt!.blockNumber)

        const evidencia = await wrapper.verificar(hash)
        expect(evidencia.timestamp).to.equal(BigInt(bloque!.timestamp))
        expect(evidencia.emisor).to.equal(cuentaConDid.address)
        expect(evidencia.did).to.not.equal(ethers.ZeroHash)
        expect(await wrapper.estaNotarizado(hash)).to.equal(true)
    })

    it('emite Notarizado con hash, emisor, did y timestamp exactos', async () => {
        const hash = hashDePrueba('evento')
        const contrato = wrapper.connect(cuentaConDid)
        const tx = await contrato.notarizar(hash)
        const receipt = await tx.wait()
        const bloque = await ethers.provider.getBlock(receipt!.blockNumber)
        const evidencia = await wrapper.verificar(hash)

        await expect(tx)
            .to.emit(wrapper, 'Notarizado')
            .withArgs(hash, cuentaConDid.address, evidencia.did, bloque!.timestamp)
    })

    it('re-notarizar el mismo hash revierte YaNotarizado y conserva el timestamp original', async () => {
        const hash = hashDePrueba('renotarizacion')
        const contrato = wrapper.connect(cuentaConDid)
        await (await contrato.notarizar(hash)).wait()
        const evidenciaOriginal = await wrapper.verificar(hash)

        await expect(contrato.notarizar(hash))
            .to.be.revertedWithCustomError(wrapper, 'YaNotarizado')
            .withArgs(hash, evidenciaOriginal.timestamp)

        const evidenciaTrasIntento = await wrapper.verificar(hash)
        expect(evidenciaTrasIntento.timestamp).to.equal(evidenciaOriginal.timestamp)
    })

    it('hash vacio revierte HashVacio, incluso sin identidad', async () => {
        const contrato = wrapper.connect(cuentaSinDid)
        await expect(contrato.notarizar(ethers.ZeroHash)).to.be.revertedWithCustomError(
            wrapper,
            'HashVacio'
        )
    })

    it('identidad no registrada revierte IdentidadNoRegistrada', async () => {
        const hash = hashDePrueba('sin-identidad')
        const contrato = wrapper.connect(cuentaSinDid)
        await expect(contrato.notarizar(hash))
            .to.be.revertedWithCustomError(wrapper, 'IdentidadNoRegistrada')
            .withArgs(cuentaSinDid.address)
    })

    it('didOf() == 0 con identidad conocida guarda did = 0 y la evidencia es valida', async () => {
        const hash = hashDePrueba('did-cero')
        await (await wrapper.forzarDidCeroParaTest(true)).wait()
        try {
            const contrato = wrapper.connect(cuentaConDid)
            await (await contrato.notarizar(hash)).wait()
        } finally {
            await (await wrapper.forzarDidCeroParaTest(false)).wait()
        }

        const evidencia = await wrapper.verificar(hash)
        expect(evidencia.did).to.equal(ethers.ZeroHash)
        expect(evidencia.emisor).to.equal(cuentaConDid.address)
        expect(evidencia.timestamp).to.not.equal(0n)
    })

    it('la pausa bloquea notarizar pero no verificar; reactivar restaura', async () => {
        const hash = hashDePrueba('pausa')
        await (await wrapper.pauseForTest()).wait()
        try {
            const contrato = wrapper.connect(cuentaConDid)
            await expect(contrato.notarizar(hash)).to.be.revertedWithCustomError(
                wrapper,
                'IsPaused'
            )
            // verificar no lleva gate de pausa
            expect((await wrapper.verificar(hash)).timestamp).to.equal(0n)
            expect(await wrapper.estaNotarizado(hash)).to.equal(false)
        } finally {
            await (await wrapper.unpauseForTest()).wait()
        }

        const contrato = wrapper.connect(cuentaConDid)
        await (await contrato.notarizar(hash)).wait()
        expect(await wrapper.estaNotarizado(hash)).to.equal(true)
    })
})
