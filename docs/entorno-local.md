# Entorno local — Notariza

Guía paso a paso para levantar la red local de ISBE y compilar, desplegar y validar el módulo
Notariza contra ella. Para el porqué de cada pieza, ver
[`docs/arquitectura.md`](arquitectura.md); para las convenciones de código, `CLAUDE.md`.

Este repositorio es un **proyecto Hardhat autocontenido**: se clona, se instala y compila por sí
solo. El template oficial de ISBE (`isbe-clients-template`) se clona **aparte** y su único papel
es levantar la red local; no hay que integrar este repo dentro de él.

## 1. Requisitos previos

- **Node.js ≥ 18** — la versión que exige el `README.md` del template. Este repo no fija
  `engines` ni `.nvmrc`; probado con Node 22.
- **npm** — gestor de paquetes de este proyecto. `pnpm` es exclusivo de `notariza-ui`.
- **Docker**, instalado y en ejecución — la red local corre en contenedores.
- **[`jq`](https://stedolan.github.io/jq/)** — lo usan los scripts de arranque y parada de la red.

## 2. Instalar el proyecto

```bash
git clone git@github.com:Dezen-code-the-trust/notariza-contracts.git
cd notariza-contracts
npm install
cp .env_sample .env
```

Edita `.env` con las credenciales de la **cuenta #0 de Hardhat** (mnemonic pública estándar,
exclusiva de desarrollo local — nunca usar en un entorno con valor real):

```env
ACCOUNT_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
ACCOUNT_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
LOCALHOST_URL=http://localhost:8545
```

Esa cuenta tiene permisos de administración sobre el Diamond de gobernanza en el bloque génesis
de la red local: es la que ejecuta los 3 pasos de despliegue (sección 4).

> **El paso `cp .env_sample .env` no es opcional.** Sin `ACCOUNT_PRIVATE_KEY`, el array
> `accounts` de la red queda vacío, `ethers.getSigners()` devuelve una lista vacía y los tests
> fallan con `UNSUPPORTED_OPERATION` (`contract runner does not support calling`) en lugar de con
> un error de configuración legible.

## 3. Levantar la red local de ISBE

La red local no forma parte de este repositorio: la aporta el template oficial de ISBE, que se
clona en una carpeta **hermana**, no dentro de este proyecto. Son 4 nodos Besu con consenso QBFT
y chain ID `11073`, con el Diamond de gobernanza ya presente en el bloque génesis en
`0x00000000000000000000000000000000000015Be` — la misma dirección que en PRE.

```bash
cd ..
git clone https://github.com/red-isbe/isbe-clients-template
cd isbe-clients-template
git checkout fa7e8b9966d6be69c498264eaf069aaca361eea3
npm install
cp .env_sample .env      # mismas credenciales de la cuenta #0
```

> Se fija el commit por SHA y no por tag porque **el repositorio del template no publica ni tags
> ni releases**. Sin fijar el commit, la infraestructura de red puede cambiar entre clones y las
> pruebas dejan de ser comparables.

Arranca la red (4 contenedores: `bootnode`, `node2`, `node3`, `node4`):

```bash
./isbe-network-case/startNetwork.sh
docker ps --filter label=project=besu   # deben verse los 4 en estado healthy
```

Comprobación de que el Diamond responde antes de seguir:

```bash
curl -s -X POST http://localhost:8545 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["0x00000000000000000000000000000000000015Be","latest"]}'
```

Si devuelve un `result` largo, la red está lista. Si devuelve `"0x"`, el problema es la red y no
este proyecto.

Para pararla: `./isbe-network-case/stopNetwork.sh`. El estado de la cadena persiste en
`QBFT-Network/`: no se pierde entre arranques, y **no debe borrarse** esa carpeta (contiene las
claves de los nodos, el génesis y las evidencias y DIDs de prueba ya registrados).

El template ofrece además `contracts/example-hashtimestamp/` como referencia de un módulo ya
adaptado al patrón. La misma pieza, en su versión de producción, está en
`node_modules/@red-isbe/isbe-contracts/contracts/hashtimestamp/` de este proyecto.

A partir de aquí, todos los comandos se ejecutan **desde la raíz de este repositorio**, con la
red del template corriendo en segundo plano. La conexión es por HTTP a `localhost:8545`: da igual
en qué carpeta esté cada proyecto.

## 4. Compilar

```bash
npx hardhat compile
```

`hardhat.config.ts` fija `solc 0.8.28`, `evmVersion: istanbul` y el optimizador a 200 runs — los
mismos flags con los que se valida el build reproducible (sección 7).

## 5. Desplegar el módulo

```bash
npx hardhat run scripts/deployNotariza.ts --network isbe
```

Ejecuta los 3 pasos oficiales de Modalidad 1 contra el Diamond de gobernanza, uno por
transacción:

1. **`deploy`** — registra el bytecode de `NotarizaFacet` bajo su resolver key.
2. **`setConfiguration`** — asocia esa versión del facet a un ID de configuración.
3. **`deployUseCase`** — crea el proxy del caso de uso a partir de esa configuración, con el mapa
   de roles inicial (`PAUSER_ROLE`, `_NOTARIZA_ADMIN_ROLE`).

El script imprime la dirección del **proxy** al final — es la dirección pública del contrato,
distinta de la del Diamond de gobernanza y de la de la implementación registrada en el paso 1.
Guárdala: la necesitan los pasos siguientes.

## 6. Tests y análisis estático

```bash
npx hardhat test --network isbe
```

La suite corre contra la red local real: no hay red en memoria que pueda sustituir al
`DidRegistry` del Diamond de gobernanza. Incluye unitarios de la lógica interna (vía
`NotarizaTestWrapper`), integración contra el proxy, introspección de selectores, constantes del
namespace y upgrade del facet.

Si vas a ejercitar manualmente el camino feliz de `notarizar` (por ejemplo con el script de
validación de la sección 7), registra antes identidad de prueba en el `DidRegistry`:

```bash
npx hardhat run scripts/registerTestDid.ts --network isbe
```

Registra DID a las cuentas #0 y #1 del mnemonic estándar de Hardhat. La suite de tests se
registra su identidad cuando la necesita (`test/helpers/cuentas.ts`); este script deja lista la
cuenta #1 que usa `validateNotariza.ts`.

Para reproducir el análisis estático (ver [`docs/slither-report.md`](slither-report.md)):

```bash
slither . --hardhat-artifacts-directory artifacts --filter-paths node_modules --exclude-dependencies
```

## 7. Validar el despliegue

```bash
NOTARIZA_PROXY=<dirección-del-proxy> npx hardhat run scripts/validateNotariza.ts --network isbe
```

Ejercita, siempre contra el **proxy** (nunca contra el facet directo — una función no enrutable
solo se detecta así), el checklist de validación: `paused()` y `hasRole()` responden con el mapa
de roles esperado · `estaNotarizado` sobre un hash nuevo da `false` · `notarizar` sin identidad
ISBE revierte con `IdentidadNoRegistrada` · `notarizar` con identidad activa emite `Notarizado` y
`verificar` devuelve la evidencia · re-notarizar el mismo hash revierte con `YaNotarizado`
conservando el timestamp original · `notarizar(bytes32(0))` revierte con `HashVacio`.

Opcionalmente, `scripts/checkStorage.ts` comprueba de forma empírica —leyendo slots de storage
directamente con `eth_getStorageAt`— que la evidencia se guarda en el slot derivado del namespace
y que no hay variables de estado sueltas fuera de él (ver la sección 6 de
[`docs/arquitectura.md`](arquitectura.md)):

```bash
NOTARIZA_PROXY=<dirección-del-proxy> npx hardhat run scripts/checkStorage.ts --network isbe
```

## 8. Build reproducible y verificación de bytecode

La versión de compilador y los flags están fijados en `hardhat.config.ts` (sección 4) y no se
tocan sin anotarlo en el historial de decisiones del proyecto: `solc 0.8.28`,
`evmVersion: istanbul` y optimizador activado a 200 runs.

Las dependencias están declaradas **con versión exacta**, sin rangos ni carets, y
`package-lock.json` está versionado. Un tercero que clone este repositorio en el mismo commit y
ejecute `npm ci` obtiene la misma resolución de dependencias y, con los mismos flags, el mismo
bytecode: el `bytecode` de
`artifacts/contracts/notariza/NotarizaFacet.sol/NotarizaFacet.json` es determinista para una
misma versión de solc, mismos flags y mismo código fuente.

Comprobación rápida de igualdad de bytecode entre dos builds:

```bash
node -p "const a=require('./artifacts/contracts/notariza/NotarizaFacet.sol/NotarizaFacet.json'); \
  require('crypto').createHash('sha256').update(a.bytecode).digest('hex')"
```

Para verificación en el explorador (Blockscout) o para comparar el build local con el que use
ISBE en PRE:

```bash
npm run standard-input   # genera standard-input.json a partir de artifacts/build-info/
```

Ese fichero es la entrada estándar de verificación de Solidity (compatible con
Etherscan/Blockscout): contiene todas las fuentes, la versión de compilador y los settings
exactos en un único JSON. No está versionado, porque es derivado y se regenera en cada
compilación.

## 9. Notas sobre las dependencias

`npm install` emite avisos de paquetes obsoletos y `npm audit` reporta vulnerabilidades. Todas
provienen del árbol de dependencias del template oficial de ISBE, que este proyecto reproduce
con versión exacta y de forma deliberada; ninguna afecta al código del módulo.

**No ejecutar `npm audit fix`.** Alteraría las versiones resueltas y con ellas potencialmente el
bytecode, rompiendo la equivalencia bytecode ↔ fuente que exige el propio proceso de conformidad
de ISBE. Cualquier actualización de dependencias se decide de forma explícita, se anota, y obliga
a repetir el despliegue de validación y el análisis estático.