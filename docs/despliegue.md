# Despliegue — Notariza

> **Estado: sin desplegar en red local todavía.** Este documento es la plantilla de parámetros y
> el checklist de validación que se rellenan al completar el despliegue en red local (tarea T6).
> Los valores de namespace de abajo son fijos desde el código (`constants/constants.sol`) y no
> cambian con el despliegue; la dirección del **proxy**, los `txid` y el gas de cada paso sí son
> propios de cada despliegue concreto y se añaden aquí en cuanto exista uno.

Para el porqué de cada parámetro y de los 3 pasos, ver las secciones 3 y 7 de
`[docs/arquitectura.md](arquitectura.md)`. Este documento es el insumo directo para el
expediente de homologación ante ISBE: parámetros exactos, mapa de roles solicitado y resultado
del checklist de validación.

## 1. Namespace y parámetros fijos

Namespace del proyecto (convención oficial de ISBE, `isbe.customers.{cliente}.{proyecto}.{elemento}`).
Los cuatro valores son constantes en `constants/constants.sol`, declaradas como `keccak256('cadena')`
para que el compilador las derive del texto y no puedan desincronizarse — los hashes de abajo son
ese mismo cálculo, no un valor aparte que se pueda desajustar:


| Constante                    | Cadena                                        | `keccak256`                                                          |
| ---------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `_NOTARIZA_STORAGE_POSITION` | `isbe.customers.dezen.notariza.storage`       | `0x225406b817fd6fd747d856588a4c6dd7ceeda05d24b0b39a495ac58da4d41a32` |
| `_NOTARIZA_RESOLVER_KEY`     | `isbe.customers.dezen.notariza.resolver.key`  | `0xddecf9623410d824972a8d1b68c871891e7da22734810c4423d324111a30c8d3` |
| `_NOTARIZA_CONFIG_ID`        | `isbe.customers.dezen.notariza.configuration` | `0x2821cd02e3604785f833ec0c33db0625a1185fa7670465331f2252712e18fc6b` |
| `_NOTARIZA_ADMIN_ROLE`       | `isbe.customers.dezen.role.notariza.admin`    | `0xa6a1640ad2b518444c8b586b414cb713253572a3b308210207f5058e71ef5645` |


`_NOTARIZA_STORAGE_POSITION` es la única de las cuatro que es **inmutable una vez desplegado**
(ver la sección 6 de `docs/arquitectura.md`): las otras tres identifican el registro del facet y su
configuración en la factoría, no una posición de storage.

El rol de pausa (`PAUSER_ROLE`) no se deriva de un string: es una constante de
`@red-isbe/isbe-contracts/contracts/constants/roles.sol`, copiada literalmente en los scripts de
despliegue por la regla del proyecto de no derivar IDs de rol con `keccak256("…")` (8 de las 31
constantes de esa librería no coinciden con el hash de su string documentado).

Diamond de gobernanza (mismo en red local y en PRE): `0x00000000000000000000000000000000000015Be`.

## 2. Mapa de roles solicitado

`deployUseCase` solo admite fijar los roles que la factoría permite: `PAUSER_ROLE` y
`_NOTARIZA_ADMIN_ROLE`. `DEFAULT_ADMIN_ROLE` no se solicita — la factoría lo rechaza con
`ForbiddenRole` si se pide explícitamente, y lo concede ella misma a quien envía la transacción
`deployUseCase` (ver la sección 8 de `docs/arquitectura.md`).


| Rol                    | Dirección(es)                                              | Origen                                            |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `PAUSER_ROLE`          | `<DIRECCION_ADMIN_1>`                                      | EOA designada por Dezen                           |
| `_NOTARIZA_ADMIN_ROLE` | `<DIRECCION_ADMIN_1>`                                      | EOA designada por Dezen                           |
| `DEFAULT_ADMIN_ROLE`   | *(la concede la factoría a quien ejecuta `deployUseCase`)* | En red local, la cuenta admin local; en PRE, ISBE |


Las direcciones reales de las EOAs de Dezen viven en el `.env` de la raíz del árbol de trabajo
(no versionado en ningún repo; ver `.env_sample` para el formato). En red local, el script
`contracts/scripts/deployNotariza.ts` usa una única cuenta admin para ambos roles como valor
provisional de desarrollo — el mapa de roles real que se solicita a ISBE para PRE puede tener
cuentas distintas por rol y se fija aquí antes de la solicitud.

## 3. Resultado del despliegue


| Dato                                   | Valor         |
| -------------------------------------- | ------------- |
| Proxy de Notariza                      | `<pendiente>` |
| Implementación (paso 1)                | `<pendiente>` |
| Chain ID                               | `11073`       |
| Paso 1 `deploy` — txid / gas           | `<pendiente>` |
| Paso 2 `setConfiguration` — txid / gas | `<pendiente>` |
| Paso 3 `deployUseCase` — txid / gas    | `<pendiente>` |


## 4. Checklist de validación post-despliegue

Reutilizable para el despliegue en PRE. Lo ejecuta
`contracts/scripts/validateNotariza.ts` contra el **proxy** (nunca contra el facet directo):


| Comprobación                                                                                         | Resultado     |
| ---------------------------------------------------------------------------------------------------- | ------------- |
| `paused()` responde `false` recién desplegado                                                        | `<pendiente>` |
| `hasRole()` confirma el mapa de roles de la sección 2                                                | `<pendiente>` |
| `estaNotarizado(hash)` sobre un hash nuevo devuelve `false`                                          | `<pendiente>` |
| `notarizar` sin identidad ISBE revierte con `IdentidadNoRegistrada`                                  | `<pendiente>` |
| `notarizar` con identidad ISBE activa emite `Notarizado` y `verificar` devuelve la evidencia         | `<pendiente>` |
| Re-notarizar el mismo hash revierte con `YaNotarizado`, conservando el timestamp original            | `<pendiente>` |
| `notarizar(bytes32(0))` revierte con `HashVacio`                                                     | `<pendiente>` |
| Pausa desde `PAUSER_ROLE`/admin bloquea `notarizar` sin afectar a `verificar`; reactivación restaura | `<pendiente>` |


**Nota sobre `eip712Domain()`:** el `README.md` del template de ISBE la propone como
comprobación post-despliegue, pero esa función no existe en ningún `.sol` de
`@red-isbe/isbe-contracts` v0.2.1 (solo en artefactos de OpenZeppelin que la cadena de herencia
del proyecto no usa), y el proxy revierte con `FunctionNotFound`. `validateNotariza.ts` comprueba
en su lugar `paused()` y `hasRole()`, que sí están enrutados y además validan el mapa de roles.