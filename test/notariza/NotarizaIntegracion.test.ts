import { expect } from 'chai'
import { ethers, artifacts } from 'hardhat'
import { desplegarNotariza } from '../helpers/despliegue'
import { cuentaDePrueba, asegurarDidDePrueba, didDeCuenta, hashDePrueba } from '../helpers/cuentas'

describe('Notariza — integracion (siempre contra el proxy)', () => {
    let admin: Awaited<ReturnType<typeof ethers.getSigners>>[number]
    let cuentaConDid: ReturnType<typeof cuentaDePrueba>
    let cuentaSinDid: ReturnType<typeof cuentaDePrueba>
    let proxy: string

    before(async () => {
        ;[admin] = await ethers.getSigners()
        cuentaConDid = cuentaDePrueba(1) // ya tiene DID por registerTestDid.ts en la mayoria de entornos
        cuentaSinDid = cuentaDePrueba(7) // reservado a esta suite, nunca se le registra DID
        await asegurarDidDePrueba(admin, 1)
    })

    beforeEach(async () => {
        ;({ proxy } = await desplegarNotariza(admin))
    })

    async function notariza(cuenta: typeof admin | typeof cuentaConDid = admin) {
        const { abi } = await artifacts.readArtifact('INotariza')
        return new ethers.Contract(proxy, abi, cuenta)
    }

    async function gobernanza(cuenta: typeof admin | typeof cuentaConDid = admin) {
        const { abi: pauseAbi } = await artifacts.readArtifact(
            '@red-isbe/isbe-contracts/contracts/pause/IPause.sol:IPause'
        )
        const { abi: accessAbi } = await artifacts.readArtifact(
            '@red-isbe/isbe-contracts/contracts/access/accessControl/IAccessControlEoa.sol:IAccessControlEoa'
        )
        return new ethers.Contract(proxy, [...pauseAbi, ...accessAbi], cuenta)
    }

    it('camino feliz a traves del proxy: notarizar + verificar', async () => {
        const hash = hashDePrueba('feliz')
        const contrato = await notariza(cuentaConDid)
        const tx = await contrato.notarizar(hash)
        const receipt = await tx.wait()
        const bloque = await ethers.provider.getBlock(receipt.blockNumber)

        const evidencia = await (await notariza()).verificar(hash)
        expect(evidencia.timestamp).to.equal(BigInt(bloque!.timestamp))
        expect(evidencia.emisor).to.equal(cuentaConDid.address)
        expect(evidencia.did).to.equal(await didDeCuenta(admin, cuentaConDid.address))
        expect(await (await notariza()).estaNotarizado(hash)).to.equal(true)
    })

    it('emite Notarizado a traves del proxy con los valores exactos', async () => {
        const hash = hashDePrueba('evento')
        const contrato = await notariza(cuentaConDid)
        const tx = await contrato.notarizar(hash)
        const receipt = await tx.wait()
        const bloque = await ethers.provider.getBlock(receipt.blockNumber)
        const evidencia = await contrato.verificar(hash)

        await expect(tx)
            .to.emit(contrato, 'Notarizado')
            .withArgs(hash, cuentaConDid.address, evidencia.did, bloque!.timestamp)
    })

    it('identidad no registrada revierte a traves del proxy', async () => {
        const hash = hashDePrueba('sin-identidad')
        const contrato = await notariza(cuentaSinDid)
        await expect(contrato.notarizar(hash))
            .to.be.revertedWithCustomError(contrato, 'IdentidadNoRegistrada')
            .withArgs(cuentaSinDid.address)
    })

    it('re-notarizar a traves del proxy revierte YaNotarizado conservando el timestamp', async () => {
        const hash = hashDePrueba('renotarizacion')
        const contrato = await notariza(cuentaConDid)
        await (await contrato.notarizar(hash)).wait()
        const evidencia = await contrato.verificar(hash)
        await expect(contrato.notarizar(hash))
            .to.be.revertedWithCustomError(contrato, 'YaNotarizado')
            .withArgs(hash, evidencia.timestamp)
    })

    it('solo una cuenta con PAUSER_ROLE puede pausar', async () => {
        const conRol = await gobernanza(admin)
        const sinRol = await gobernanza(cuentaConDid)

        await expect(sinRol.pause()).to.be.revertedWithCustomError(sinRol, 'AccountHasNoRoles')

        // en la red persistente real la transaccion no esta minada al instante: hay que
        // esperar el receipt antes de comprobar el evento con el matcher
        const txPause = await conRol.pause()
        await txPause.wait()
        await expect(txPause).to.emit(conRol, 'Paused').withArgs(admin.address)
        expect(await conRol.paused()).to.equal(true)

        // limpieza: no dejar el proxy pausado para el resto de tests de este fichero
        await (await conRol.unpause()).wait()
    })

    it('la pausa bloquea notarizar pero no verificar; reactivar restaura', async () => {
        const hash = hashDePrueba('pausa')
        const conRol = await gobernanza(admin)
        await (await conRol.pause()).wait()

        const contrato = await notariza(cuentaConDid)
        // el ABI de INotariza no declara IsPaused (viene de IPause): se usa `conRol`, que ya
        // combina ambas interfaces, solo para que el matcher reconozca el error
        await expect(contrato.notarizar(hash)).to.be.revertedWithCustomError(conRol, 'IsPaused')
        expect((await contrato.verificar(hash)).timestamp).to.equal(0n)

        const txUnpause = await conRol.unpause()
        await txUnpause.wait()
        await expect(txUnpause).to.emit(conRol, 'Unpaused').withArgs(admin.address)
        await (await contrato.notarizar(hash)).wait()
        expect(await contrato.estaNotarizado(hash)).to.equal(true)
    })
})
