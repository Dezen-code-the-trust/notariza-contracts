import { expect } from 'chai'
import { ethers, artifacts } from 'hardhat'

describe('NotarizaFacet — introspeccion', () => {
    it('selectorsIntrospection() lista exactamente los selectores external de INotariza', async () => {
        const facet = await ethers.deployContract('NotarizaFacet')
        await facet.waitForDeployment()
        const declarados: string[] = await facet.selectorsIntrospection()

        const { abi } = await artifacts.readArtifact('INotariza')
        const iface = new ethers.Interface(abi)
        const esperados = iface.fragments
            .filter((f) => f.type === 'function')
            .map((f) => iface.getFunction((f as ethers.FunctionFragment).name)!.selector)

        expect([...declarados].sort()).to.deep.equal([...esperados].sort())
    })

    it('businessIdIntrospection() devuelve la resolver key del namespace', async () => {
        const facet = await ethers.deployContract('NotarizaFacet')
        await facet.waitForDeployment()
        expect(await facet.businessIdIntrospection()).to.equal(
            ethers.id('isbe.customers.dezen.notariza.resolver.key')
        )
    })

    it('interfacesIntrospection() incluye el interfaceId ERC165 de INotariza', async () => {
        const facet = await ethers.deployContract('NotarizaFacet')
        await facet.waitForDeployment()
        const { abi } = await artifacts.readArtifact('INotariza')
        const iface = new ethers.Interface(abi)

        let interfaceId = 0n
        for (const fragment of iface.fragments) {
            if (fragment.type !== 'function') continue
            const selector = iface.getFunction((fragment as ethers.FunctionFragment).name)!.selector
            interfaceId ^= BigInt(selector)
        }
        const interfaceIdHex = ethers.zeroPadValue(ethers.toBeHex(interfaceId), 4)

        expect(await facet.interfacesIntrospection()).to.include(interfaceIdHex)
    })
})
