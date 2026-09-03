# Despliegue — Notariza

> Los valores de namespace de abajo son fijos desde el código (`contracts/constants/constants.sol`)
> y no cambian con el despliegue; la dirección del **proxy**, los `txid` y el gas de cada paso sí
> son propios de cada despliegue concreto.

Para el porqué de cada parámetro y de los 3 pasos, ver las secciones 3 y 7 de
[docs/arquitectura.md](arquitectura.md). Este documento es el insumo directo para el expediente
de solicitud de despliegue ante ISBE: parámetros exactos, mapa de roles solicitado y resultado
del checklist de validación.

> **El mapa de roles de la sección 2 es definitivo y no se puede corregir después.**
> El formulario de registro de smart contracts del Portal de ISBE no tiene campo para roles —
> solo admite nombre, URL de repositorio, comentarios y entorno de destino—, así que este
> documento es el único canal por el que llegan a ISBE. Y como `DEFAULT_ADMIN_ROLE` lo recibe
> quien firma `deployUseCase`, que en PRE es ISBE y no Dezen, cualquier concesión posterior de
> roles depende de una acción explícita suya.

## 1. Namespace y parámetros fijos

Namespace del proyecto (convención oficial de ISBE, `isbe.customers.{cliente}.{proyecto}.{elemento}`).
Los cuatro valores son constantes en `contracts/constants/constants.sol`, declaradas como
`keccak256('cadena')` para que el compilador las derive del texto y no puedan desincronizarse —
los hashes de abajo son ese mismo cálculo, no un valor aparte que se pueda desajustar:

| Constante                    | Cadena                                        | `keccak256`                                                          |
| ---------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `_NOTARIZA_STORAGE_POSITION` | `isbe.customers.dezen.notariza.storage`       | `0x225406b817fd6fd747d856588a4c6dd7ceeda05d24b0b39a495ac58da4d41a32` |
| `_NOTARIZA_RESOLVER_KEY`     | `isbe.customers.dezen.notariza.resolver.key`  | `0xddecf9623410d824972a8d1b68c871891e7da22734810c4423d324111a30c8d3` |
| `_NOTARIZA_CONFIG_ID`        | `isbe.customers.dezen.notariza.configuration` | `0x2821cd02e3604785f833ec0c33db0625a1185fa7670465331f2252712e18fc6b` |
| `_NOTARIZA_ADMIN_ROLE`       | `isbe.customers.dezen.role.notariza.admin`    | `0xa6a1640ad2b518444c8b586b414cb713253572a3b308210207f5058e71ef5645` |

`_NOTARIZA_STORAGE_POSITION` es la única de las cuatro que es **inmutable una vez desplegado**
(ver la sección 6 de `docs/arquitectura.md`): las otras tres identifican el registro del facet y
su configuración en la factoría, no una posición de storage.

El rol de pausa (`PAUSER_ROLE`) no se deriva de un string: es una constante de
`@red-isbe/isbe-contracts/contracts/constants/roles.sol`, copiada literalmente en los scripts de
despliegue por la regla del proyecto de no derivar IDs de rol con `keccak256("…")` (8 de las 31
constantes de esa librería no coinciden con el hash de su string documentado).

Diamond de gobernanza (mismo en red local y en PRE): `0x00000000000000000000000000000000000015Be`.

### Metadatos de compilación

Parámetros con los que se produce el bytecode que se entrega. Son entrada obligatoria del
expediente y deben coincidir exactamente con lo que recompile ISBE:

| Parámetro | Valor |
| --- | --- |
| Compilador | `solc 0.8.28` |
| `evmVersion` | `istanbul` |
| Optimizador | activado, 200 runs |
| Librería | `@red-isbe/isbe-contracts` `0.2.1` (versión exacta, sin rango) |
| Resolución de dependencias | fijada en `package-lock.json`, versionado en el repo |
| Entrada de verificación | `npm run standard-input` → `standard-input.json` |

## 2. Mapa de roles solicitado

`deployUseCase` solo admite fijar los roles que la factoría permite: `PAUSER_ROLE` y
`_NOTARIZA_ADMIN_ROLE`. `DEFAULT_ADMIN_ROLE` no se solicita — la factoría lo rechaza con
`ForbiddenRole` si se pide explícitamente, y lo concede ella misma a quien envía la transacción
`deployUseCase` (ver la sección 8 de `docs/arquitectura.md`).

| Rol                    | Dirección(es)                                                                                | Origen                                            |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `PAUSER_ROLE`          | `0xD193F604C82C5f37F88de054B99a9a6Adf7cec7B`<br>`0x2f7970674B6410f90b8Bc43D8188EF35ab3f1a9B` | EOAs designadas por Dezen                         |
| `_NOTARIZA_ADMIN_ROLE` | `0xD193F604C82C5f37F88de054B99a9a6Adf7cec7B`<br>`0x2f7970674B6410f90b8Bc43D8188EF35ab3f1a9B` | EOAs designadas por Dezen                         |
| `DEFAULT_ADMIN_ROLE`   | *(la concede la factoría a quien ejecuta `deployUseCase`)*                                   | En red local, la cuenta admin local; en PRE, ISBE |

Ambas direcciones están en formato checksum EIP-55 y ambas reciben **los dos roles**: no se
separa administración de pausa entre personas, para que ninguna de las dos operaciones dependa
de la disponibilidad de una sola persona.

`scripts/deployNotariza.ts` admite fijar dos administradores distintos con las variables
`ADMIN_1`/`ADMIN_2`, cada uno con ambos roles — la estructura que se solicitará a ISBE. Sin
fijarlas, ambos roles los recibe la única cuenta que firma el despliegue: un valor por defecto
pensado para pruebas rápidas de un solo administrador, **no válido para PRE**.

## 3. Resultado del despliegue en red local

> Este despliegue y su checklist se validaron con cuentas de prueba de Hardhat, no con las
> direcciones reales de los administradores designados por Dezen, porque el mecanismo de
> concesión de roles de `deployUseCase` no depende de la dirección concreta solicitada (solo
> rechaza los roles reservados, ver la sección 2). El mapa de roles real que se solicitará a
> ISBE usa las direcciones de los dos administradores (ver sección 2), no las de este despliegue
> de prueba. Concretamente, se desplegó con `ADMIN_1` = cuenta #1 y `ADMIN_2` = cuenta #2 del
> mnemonic estándar de Hardhat (`test test test ... junk`), cada una con `PAUSER_ROLE` y
> `_NOTARIZA_ADMIN_ROLE`, confirmado con `hasRole()` sobre el proxy resultante.

| Dato                                   | Valor                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Proxy de Notariza                      | `0x586aF185D6888040f73a1465265B90f34F112a4C`                                      |
| Implementación (paso 1)                | `0xD1E767120d85A3C217405Cd2A018F0E10B9ff0F4`                                      |
| Chain ID                               | `11073`                                                                           |
| Paso 1 `deploy` — txid / gas           | `0xd22e358634d3dd072d0f4c573e092f3f6c0b07ffac95f7092895e7833e5ee413` / `487977`   |
| Paso 2 `setConfiguration` — txid / gas | `0xfa626ad30efad5a0eac5ea76fc71c50dce2487bd43ad1e0552fb76c6aed19efe` / `1963271`  |
| Paso 3 `deployUseCase` — txid / gas    | `0xcb520d57933a6873bd4bdfe40340fd77350d9f9a536d311b1075c0f447161f73` / `1422990`  |

### Parámetros a validar antes de PRE

- **Límite de gas.** `scripts/deployNotariza.ts` envía las tres transacciones con
  `gasLimit: 25_000_000`, valor holgado para la red local. El límite de gas por bloque de PRE no
  está verificado: confirmarlo con ISBE o estimar el gas en su lugar.
- **Versión en `setConfiguration`.** El script pasa `version: 1`, correcto para un primer
  registro del resolver key. Si la clave llegara a registrarse más de una vez (un intento previo,
  un reenvío del expediente), el paso 1 devolvería versión 2 y el paso 2 apuntaría la
  configuración a la versión antigua. Usar la versión que devuelve el paso 1.

## 4. Checklist de validación post-despliegue

Reutilizable para el despliegue en PRE. Lo ejecuta `scripts/validateNotariza.ts` contra el
**proxy** (nunca contra el facet directo):

| Comprobación                                                                                           | Resultado |
| ------------------------------------------------------------------------------------------------------ | --------- |
| `paused()` responde `false` recién desplegado                                                          | ✅        |
| `hasRole()` confirma el mapa de roles de la sección 2 (estructura: dos cuentas, ambas con ambos roles) | ✅        |
| `estaNotarizado(hash)` sobre un hash nuevo devuelve `false`                                            | ✅        |
| `notarizar` sin identidad ISBE revierte con `IdentidadNoRegistrada`                                    | ✅        |
| `notarizar` con identidad ISBE activa emite `Notarizado` y `verificar` devuelve la evidencia           | ✅        |
| Re-notarizar el mismo hash revierte con `YaNotarizado`, conservando el timestamp original              | ✅        |
| `notarizar(bytes32(0))` revierte con `HashVacio`                                                       | ✅        |
| Pausa desde `PAUSER_ROLE`/admin bloquea `notarizar` sin afectar a `verificar`; reactivación restaura   | ✅        |

**Nota sobre `eip712Domain()`:** el `README.md` del template de ISBE la propone como
comprobación post-despliegue, pero esa función no existe en ningún `.sol` de
`@red-isbe/isbe-contracts` —ni en la versión publicada en npm ni en el HEAD del repositorio de la
librería— y el proxy revierte con `FunctionNotFound`. `validateNotariza.ts` comprueba en su lugar
`paused()` y `hasRole()`, que sí están enrutados y además validan el mapa de roles.