# Entorno local — Notariza

Guía paso a paso para levantar la red local de ISBE, integrar este repositorio dentro del
template oficial, y compilar, desplegar y validar el módulo Notariza contra ella. Para el
porqué de cada pieza, ver [`docs/arquitectura.md`](arquitectura.md); para las convenciones de
código, `CLAUDE.md`.

## 1. Requisitos previos

- **Node.js ≥ 18** — exigido por el `README.md` del template `isbe-clients-template`. El
  `package.json` de la raíz del template no fija una versión con `engines` ni hay `.nvmrc`, así
  que basta con cualquier Node ≥ 18 instalado.
- **npm** — es el gestor de paquetes del proyecto Hardhat de la raíz y de este repo (`contracts/`
  no tiene `package.json` propio: usa el de la raíz). `pnpm` es exclusivo de `notariza-ui`.
- **Docker**, instalado y en ejecución — la red local corre en contenedores.
- **[`jq`](https://stedolan.github.io/jq/)** — lo usan los scripts de arranque/parada de la red
  local.

## 2. Clonar el template y levantar la red local

Este repo **no es un proyecto Hardhat autocontenido**: depende de `isbe-clients-template`, que
aporta `hardhat.config.ts`, el `package.json` de la raíz (con las dependencias, incluida
`@red-isbe/isbe-contracts`) y la infraestructura de red local (`isbe-network-case/`: 4 nodos
Besu con consenso QBFT, chain ID `11073`).

```bash
git clone <URL_TEMPLATE_ISBE> notariza-template
cd notariza-template
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
de la red local: es la que ejecuta los 3 pasos de despliegue (sección 5).

Levanta la red (4 contenedores: `bootnode`, `node2`, `node3`, `node4`):

```bash
./isbe-network-case/startNetwork.sh
docker ps --filter label=project=besu   # deben verse los 4 en estado healthy
```

Para pararla más tarde: `./isbe-network-case/stopNetwork.sh`. El estado de la cadena persiste en
`QBFT-Network/`: no se pierde entre arranques, y **no debe borrarse** esa carpeta (contiene las
claves de los nodos y el Diamond ya desplegado en el génesis).

## 3. Integrar este repositorio dentro del template

Es la parte con más fricción del setup: hay que sustituir contenido del template por el
contenido de este repo, y comprobar dos ajustes de configuración que siguen siendo del template
(upstream, no versionados en este repo).

### 3.1. Sustituir la carpeta `contracts/` del template

El template trae su propia carpeta `contracts/`, con `constants/`, un ejemplo genérico para
adaptar y `contracts/example-hashtimestamp/` como referencia completa de un módulo ya adaptado.
Este repo ocupa esa misma carpeta **entera**, no una subcarpeta:

```bash
cd notariza-template
rm -rf contracts     # el contenido de ejemplo del template no se versiona en este repo
git clone git@github.com:Dezen-code-the-trust/notariza-contracts.git contracts
```

Tras este paso, `contracts/example-hashtimestamp/` ya no está en el árbol de trabajo. Si
necesitas consultarlo como referencia sin repetir este paso en otro sitio, dos alternativas:

- la versión de producción de la misma librería, en
  `node_modules/@red-isbe/isbe-contracts/contracts/hashtimestamp/`
- un segundo clon del template, limpio, sin aplicar este paso de sustitución

### 3.2. Comprobar `hardhat.config.ts` de la raíz (upstream, no versionado en este repo)

Por defecto Hardhat busca los tests en `<raíz>/test/`. Como los de este módulo viven en
`contracts/test/`, hace falta indicarlo explícitamente — si no, `npx hardhat test` sin ruta
descubre 0 ficheros y **sale con éxito, en silencio**, dando una falsa sensación de suite verde:

```typescript
const config: HardhatUserConfig = {
    // ...
    paths: {
        tests: './contracts/test',
    },
    mocha: {
        // Los tests corren contra la red local real (--network isbe), no una red en memoria:
        // cada tx espera confirmación de bloque real. El timeout por defecto de Mocha (2000ms)
        // y el de hardhat-toolbox (40000ms) se quedan cortos.
        timeout: 180_000,
    },
    networks: {
        isbe: {
            url: process.env.LOCALHOST_URL ?? 'http://localhost:8545',
            chainId: 11073,
            accounts: process.env.ACCOUNT_PRIVATE_KEY ? [process.env.ACCOUNT_PRIVATE_KEY] : [],
        },
    },
    // ...
}
```

Todos los comandos de las secciones siguientes se ejecutan **desde la raíz del árbol**
(`notariza-template/`), nunca desde dentro de `contracts/`: el proyecto Hardhat es la raíz, y es
la que sabe resolver `@red-isbe/isbe-contracts` y el resto de dependencias.

## 4. Compilar

```bash
npx hardhat compile
```

Fija `solc 0.8.28`, `evmVersion: istanbul` y el optimizador a 200 runs — los mismos flags con los
que se valida el build reproducible (sección 8).

## 5. Desplegar el módulo

```bash
npx hardhat run contracts/scripts/deployNotariza.ts --network isbe
```

Ejecuta los 3 pasos oficiales de Modalidad 1 contra el Diamond de gobernanza, uno por
transacción:

1. **`deploy`** — registra el bytecode de `NotarizaFacet` bajo su resolver key.
2. **`setConfiguration`** — asocia esa versión del facet a un ID de configuración.
3. **`deployUseCase`** — crea el proxy del caso de uso a partir de esa configuración, con el
   mapa de roles inicial (`PAUSER_ROLE`, `_NOTARIZA_ADMIN_ROLE`).

El script imprime la dirección del **proxy** al final del despliegue — es la dirección pública
del contrato, distinta de la del Diamond de gobernanza y de la de la implementación registrada
en el paso 1. Guárdala: la necesitan los pasos siguientes.

## 6. Ejecutar la suite de tests

```bash
npx hardhat test --network isbe
```

Corre contra la red local real — no hay red en memoria que sustituya al `DidRegistry` del
Diamond de gobernanza: unitarios de la lógica interna (vía `NotarizaTestWrapper`), integración
contra el proxy, introspección de selectores, constantes del namespace y upgrade del facet.

Si vas a ejercitar manualmente el camino feliz de `notarizar` (por ejemplo con el script de
validación del paso siguiente), registra antes identidad de prueba en el `DidRegistry`:

```bash
npx hardhat run contracts/scripts/registerTestDid.ts --network isbe
```

Registra DID a las cuentas #0 y #1 del mnemonic estándar de Hardhat. La propia suite de tests se
registra su identidad cuando la necesita (`test/helpers/cuentas.ts`); este script deja lista la
cuenta #1 que usa `validateNotariza.ts`.

Para reproducir el análisis estático (ver [`docs/slither-report.md`](slither-report.md)):

```bash
slither . --hardhat-artifacts-directory artifacts --filter-paths "node_modules|isbe-network-case" --exclude-dependencies
```

## 7. Validar el despliegue

```bash
NOTARIZA_PROXY=<dirección-del-proxy> npx hardhat run contracts/scripts/validateNotariza.ts --network isbe
```

Ejercita, siempre contra el **proxy** (nunca contra el facet directo — una función no enrutable
solo se detecta así), el checklist de validación: `paused()` y `hasRole()` responden con el mapa
de roles esperado · `estaNotarizado` sobre un hash nuevo da `false` · `notarizar` sin identidad
ISBE revierte con `IdentidadNoRegistrada` · `notarizar` con identidad activa emite `Notarizado` y
`verificar` devuelve la evidencia · re-notarizar el mismo hash revierte con `YaNotarizado`
conservando el timestamp original · `notarizar(bytes32(0))` revierte con `HashVacio`.

Opcionalmente, `contracts/scripts/checkStorage.ts` comprueba de forma empírica —leyendo slots de
storage directamente con `eth_getStorageAt`— que la evidencia se guarda en el slot derivado del
namespace y que no hay variables de estado sueltas fuera de él (ver la sección 6 de
[`docs/arquitectura.md`](arquitectura.md)):

```bash
NOTARIZA_PROXY=<dirección-del-proxy> npx hardhat run contracts/scripts/checkStorage.ts --network isbe
```

## 8. Build reproducible y verificación de bytecode (opcional)

La versión de compilador y los flags están fijados en `hardhat.config.ts` (sección 3.2) y no se
tocan sin anotarlo en el historial de decisiones del proyecto: `solc 0.8.28`,
`evmVersion: istanbul`,
optimizador activado a 200 runs, y la versión de `@red-isbe/isbe-contracts` fijada en el
`package.json`/`package-lock.json` de la raíz (`^0.2.1`; el lockfile fija la resolución exacta).

Un tercero que clone el mismo tag del template y este repo en el mismo commit, con el mismo
`package-lock.json`, obtiene el mismo bytecode: el `bytecode` de
`artifacts/contracts/notariza/NotarizaFacet.sol/NotarizaFacet.json` es determinista para una
misma versión de solc, mismos flags y mismo código fuente.

Para verificación en el explorador (Blockscout) o para comparar bytecode entre dos builds, el
`package.json` de la raíz expone:

```bash
npm run standard-input   # genera standard-input.json a partir de artifacts/build-info/
```

Ese fichero es la entrada estándar de verificación de Solidity (Etherscan/Blockscout-compatible):
compararlo entre dos builds (por ejemplo el local y el que use ISBE en PRE) demuestra que el
bytecode desplegado corresponde exactamente a este código fuente.
