# notariza-contracts

Módulo Notariza para Red ISBE (Modalidad 1, patrón Diamond). Ver el `CLAUDE.md` de este repo
para las convenciones de código y el `CLAUDE.md` de la raíz del árbol de trabajo para el
contexto completo del proyecto.

## Requisitos previos

Este repo **no es un proyecto Hardhat autocontenido**: ocupa la carpeta de fuentes
(`contracts/`) del template oficial de ISBE `isbe-clients-template`, que aporta
`hardhat.config.ts`, `package.json` y el `package-lock.json` con las versiones exactas de
dependencias. Antes de compilar:

1. Clonar `isbe-clients-template` (anotar el tag o commit exacto contra el que se ha validado
   este repo — pendiente de fijar en el expediente de ISBE).
2. Clonar este repo dentro, en `<template>/contracts/` (sustituyendo la carpeta de ejemplo del
   template).
3. Node.js en la versión que exige el `engines` del template (comprobar `package.json` de la
   raíz) y `npm` (el gestor de paquetes de los contratos es `npm`, no `pnpm`: eso es solo para
   `notariza-ui`).

## Build reproducible

La versión de compilador y los flags están fijados en `hardhat.config.ts` de la raíz y no se
tocan sin anotarlo en `HISTORIAL.md`:

- `solc 0.8.28`
- `evmVersion: istanbul`
- optimizer activado, `runs: 200`
- versión de `@red-isbe/isbe-contracts` fijada en `package.json`/`package-lock.json` de la raíz
  (`^0.2.1` en el momento de escribir esto; el lockfile fija la resolución exacta)

Procedimiento, desde la raíz del árbol de trabajo:

```bash
npm install          # usa package-lock.json commiteado: build reproducible, no "npm update"
npx hardhat compile
```

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
compararlo entre dos builds (por ejemplo el local y el que use ISBE en PRE) es la forma de
demostrar que el bytecode desplegado corresponde exactamente a este código fuente.

## Tests y análisis estático

Requiere la red local de ISBE levantada (`./isbe-network-case/startNetwork.sh` desde la raíz):
los tests hacen llamadas reales al DidRegistry del Diamond de gobernanza, no hay red de test en
memoria que lo sustituya.

```bash
npx hardhat test --network isbe      # suite completa: unitarios, integracion, introspeccion,
                                      # constantes y upgrade
slither . --hardhat-artifacts-directory artifacts --filter-paths "node_modules|isbe-network-case" --exclude-dependencies  # analisis estatico; ver docs/slither-report.md
```

## Despliegue

Ver `CLAUDE.md` §6 (comandos) y §6 del `CLAUDE.md` de este repo (los 3 pasos). Los scripts
están en `scripts/`.
