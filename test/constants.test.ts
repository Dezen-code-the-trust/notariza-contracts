import { expect } from 'chai'
import { ethers } from 'ethers'
import { readFileSync } from 'fs'
import { join } from 'path'

// Valores fijados en T2 (namespace del proyecto). Tabla independiente del .sol a proposito:
// si alguien cambia la cadena en constants.sol sin querer, esta tabla no cambia con ella y el
// test detecta la desviacion (la leccion de 8 constantes de roles.sol de la libreria cuyo hex
// no coincidia con el keccak256 de su cadena documentada).
const ESPERADAS: Record<string, { cadena: string; hex: string }> = {
    _NOTARIZA_STORAGE_POSITION: {
        cadena: 'isbe.customers.dezen.notariza.storage',
        hex: '0x225406b817fd6fd747d856588a4c6dd7ceeda05d24b0b39a495ac58da4d41a32',
    },
    _NOTARIZA_RESOLVER_KEY: {
        cadena: 'isbe.customers.dezen.notariza.resolver.key',
        hex: '0xddecf9623410d824972a8d1b68c871891e7da22734810c4423d324111a30c8d3',
    },
    _NOTARIZA_CONFIG_ID: {
        cadena: 'isbe.customers.dezen.notariza.configuration',
        hex: '0x2821cd02e3604785f833ec0c33db0625a1185fa7670465331f2252712e18fc6b',
    },
    _NOTARIZA_ADMIN_ROLE: {
        cadena: 'isbe.customers.dezen.role.notariza.admin',
        hex: '0xa6a1640ad2b518444c8b586b414cb713253572a3b308210207f5058e71ef5645',
    },
}

const RUTA_CONSTANTS = join(__dirname, '..', 'constants', 'constants.sol')

describe('constants.sol — namespace del proyecto', () => {
    const fuente = readFileSync(RUTA_CONSTANTS, 'utf8')

    // Extrae { nombre -> cadena } directamente del .sol, sin compilar nada.
    const declaradas: Record<string, string> = {}
    for (const [, nombre, cadena] of fuente.matchAll(
        /bytes32 constant (\w+)\s*=\s*keccak256\('([^']+)'\)/g
    )) {
        declaradas[nombre] = cadena
    }

    it('el fichero declara exactamente las 4 constantes derivadas de keccak256 esperadas', () => {
        expect(Object.keys(declaradas).sort()).to.deep.equal(Object.keys(ESPERADAS).sort())
    })

    for (const [nombre, { cadena, hex }] of Object.entries(ESPERADAS)) {
        it(`${nombre}: la cadena en el .sol es la esperada`, () => {
            expect(declaradas[nombre]).to.equal(cadena)
        })

        it(`${nombre}: keccak256('${cadena}') coincide con el hex esperado`, () => {
            expect(ethers.id(cadena)).to.equal(hex)
        })
    }

    it('las cuatro cadenas son distintas entre si', () => {
        const cadenas = Object.values(ESPERADAS).map((v) => v.cadena)
        expect(new Set(cadenas).size).to.equal(cadenas.length)
    })

    it('_DIAMOND es la direccion de genesis documentada', () => {
        expect(fuente).to.match(
            /address constant _DIAMOND = 0x00000000000000000000000000000000000015Be;/
        )
    })
})
