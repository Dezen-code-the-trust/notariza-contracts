# CLAUDE.md — notariza-contracts

Específico del módulo Solidity. Las reglas transversales (invariantes, git, secretos,
direcciones de red, namespace, `HISTORIAL.md`) están en el `CLAUDE.md` de la raíz del árbol de
trabajo. **No las repitas aquí.**

---

## 1. Los contratos de ISBE no son Solidity convencional

Modalidad 1 = facet del patrón Diamond. Se estructura en 4 ficheros más un wrapper de test, y
hereda de `@red-isbe/isbe-contracts`, **no de OpenZeppelin**. El modelo estructural a imitar es
el ejemplo `HashTimestamp`: está en el template original
(`isbe-clients-template/contracts/example-hashtimestamp/`) y también, en su versión de
producción, en `node_modules/@red-isbe/isbe-contracts/contracts/hashtimestamp/`.

La guía normativa es `guia-adaptacion-contratos.md` (raíz del template). Ante conflicto entre
esa guía y una práctica habitual de Solidity, **gana la guía**.

### Responsabilidad de cada fichero

| Fichero | Contiene | No contiene |
|---|---|---|
| `INotariza.sol` | `struct Evidencia`, eventos, errores tipados, firmas | ninguna lógica |
| `NotarizaInternal.sol` | struct de storage, acceso por slot, funciones `_*` con toda la lógica | funciones `external` |
| `Notariza.sol` | capa `external`: guards (`whenNotPaused`) y delegación a las internas | lógica de negocio |
| `NotarizaFacet.sol` | el contrato desplegable, `IEIP2535Introspection` | lógica |
| `testwrapper/notariza/NotarizaTestWrapper.sol` | expone las internas para unitarios | nada en producción |

`NotarizaInternal.sol` hereda de `DidDocumentDetailedInternal`, que ya aporta inicialización de
proxy, ERC165, RBAC con DIDs, ownership y pausabilidad.

### Storage: patrón exacto

```solidity
struct NotarizaStorage {
    mapping(bytes32 => INotariza.Evidencia) evidencias;
}

function _notarizaStorage() internal pure returns (NotarizaStorage storage $) {
    bytes32 position = _NOTARIZA_STORAGE_POSITION; // constants.sol
    assembly { $.slot := position }
}
```

Todo el estado del módulo dentro del struct. Ninguna variable de estado suelta: las facetas del
proxy comparten storage y una colisión corrompe datos ajenos sin avisar.

### `NotarizaFacet.sol`: las tres introspecciones

- `interfacesIntrospection()` → interfaceIds soportados
- `businessIdIntrospection()` → identificador del módulo
- `selectorsIntrospection()` → **TODOS** los selectores `external`

Al añadir o renombrar cualquier función `external`, actualizar `selectorsIntrospection()` en el
mismo commit. El test de introspección lo detecta; no lo saltes ni lo marques como `skip`.

---

## 2. Diseño fijado (T2)

```solidity
struct Evidencia {
    uint64  timestamp; // block.timestamp del sellado
    address emisor;    // msg.sender
    bytes32 did;       // didOf(msg.sender); bytes32(0) si no resuelve
}
```

Interfaz: `notarizar(bytes32)` (escritura, gate de identidad + `whenNotPaused`),
`verificar(bytes32) → Evidencia` y `estaNotarizado(bytes32) → bool` (ambas `view`, públicas,
sin gate).

Evento: `Notarizado(bytes32 indexed hash, address indexed emisor, bytes32 indexed did, uint64 timestamp)`.

Errores: `YaNotarizado(hash, timestampOriginal)`, `IdentidadNoRegistrada(address)`, `HashVacio()`.

**Regla de negocio: el primer sellado gana.** Re-notarizar revierte con `YaNotarizado`; la fecha
original es precisamente el valor probatorio, no un dato actualizable.

Roles iniciales: admin del módulo y pausa → EOAs de Enrique (`0xD193…c7B`) y Leo (`0x2f79…a9B`).
`_ISBE_PAUSER_ROLE` lo añade la infraestructura de ISBE automáticamente en Modalidad 1.

⚠️ **`DEFAULT_ADMIN_ROLE` no se puede pedir en los `rbacs` de `deployUseCase`**: la factoría
revierte con `ForbiddenRole` y lo concede ella misma a quien envía la transacción. Ver D-014 en
`HISTORIAL.md`; el mapa de roles de `docs/diseno-tecnico.md` §4 está desactualizado en ese punto.

`notarizar` **no lleva `onlyRole`**: el gate de escritura es la identidad ISBE del emisor, no un
rol del módulo. `_NOTARIZA_ADMIN_ROLE` queda reservado y hoy no se usa en el código.

---

## 3. Gate de identidad

El facet se ejecuta en el proxy del caso de uso, que es un contrato **distinto** del Diamond de
gobernanza. Consultar el DidRegistry es una **llamada externa (`staticcall`)** a `0x…15Be`: no es
acceso a storage propio ni `delegatecall`.

Interfaz: `IDidRegistryQuery`, en `contracts/identity/didregistry/interfaces/` de la librería.

Orden en `_notarizar`:

1. `isKnownDid(msg.sender)` → si `false`, revertir con `IdentidadNoRegistrada(msg.sender)`
2. `did = didOf(msg.sender)` → guardar en la `Evidencia`; si devuelve `bytes32(0)` (dirección
   conocida sin `capabilityInvocation` activa), guardar `0`: la evidencia sigue siendo válida
   por el `msg.sender`
3. Emitir evento con el DID indexado

---

## 4. Convenciones Solidity

- **`pragma solidity ^0.8.28`** — la versión fijada por el template. Versión exacta de solc y
  flags pinneados en `hardhat.config.ts`.
- **Orden dentro del contrato**: type declarations → constantes → modifiers → constructor (no
  hay) → external → public → internal → private. `view`/`pure` al final de su grupo.
- **Naming**: `PascalCase` contratos, structs y errores; `camelCase` funciones y variables;
  `SCREAMING_SNAKE_CASE` constantes; prefijo `_` en internas y en constantes de storage.
  Nombres de dominio en español.
- **NatSpec en español y obligatorio** en todo lo `external` y en los errores: `@notice`,
  `@param`, `@return`, `@dev` para lo no evidente. Es parte del expediente.
- **Custom errors siempre**, nunca `require` con string ni `revert()` desnudo. El error debe
  llevar los datos que permiten diagnosticar (`YaNotarizado` incluye el timestamp original).
- **Checks-Effects-Interactions.** Validar, escribir storage, emitir evento y solo después
  cualquier llamada externa.
- **Validar entradas en el borde `external`**, no en las internas.
- **Sin `assembly`** salvo el acceso al slot de storage, que es obligatorio.
- **Nada de números mágicos**: constantes con nombre en `constants/constants.sol`.
- **Los IDs de rol se importan de la librería como constante.** Nunca `keccak256("…")` para
  derivar un rol: 8 de las 31 constantes de `roles.sol` no coinciden con el hash de su string.

---

## 5. Testing

Hardhat + chai, sobre la red local (`isbe` en el `hardhat.config.ts` de la raíz).

**Regla de oro: los tests de integración llaman SIEMPRE al proxy, nunca al facet directo.** Un
test que pasa contra el facet directo puede estar probando código no enrutable.

Rutas críticas obligatorias:

- camino feliz: `notarizar` + `verificar`
- re-notarización → `YaNotarizado`, conservando el timestamp original
- hash vacío → `HashVacio`
- identidad no registrada → `IdentidadNoRegistrada`
- `didOf` = 0 → guarda `0` y la evidencia es válida
- pausa bloquea `notarizar` pero no `verificar`; reactivación restaura
- solo admin puede pausar (`hasRole`)
- todos los eventos con sus valores exactos

Tests estructurales, los que protegen de fallos silenciosos:

- **introspección**: `selectorsIntrospection()` vs. los selectores de la ABI compilada
- **constantes**: cada hex de `constants.sol` == `keccak256` de su string (lección del bug de
  `roles.sol`)
- **upgrade**: registrar una v2 del facet (mismo storage, cambio trivial de lógica) por los
  pasos 1 y 2, y verificar que el proxy conserva las evidencias existentes

Los unitarios de lógica interna van vía `NotarizaTestWrapper.sol`.

**Análisis estático**: `slither .`. Objetivo cero críticos/altos sin justificar. Cada hallazgo
se resuelve o se justifica por escrito en `docs/slither-report.md`.

---

## 6. Despliegue: los 3 pasos

Contra el Diamond de gobernanza (`0x…15Be`). En local con la cuenta admin (#0 de Hardhat, por
`.env`); en PRE lo ejecuta ISBE con nuestros parámetros.

1. `deploy` → registra el bytecode del facet (resolver key)
2. `setConfiguration` → asocia el facet a una configuración (config ID)
3. `deployUseCase` → crea el proxy del caso de uso (parámetros `roles`/`members`)

Anotar siempre: dirección del proxy, txid y gas de cada paso. La dirección pública del contrato
es la del **proxy**.

Validación post-despliegue (checklist reutilizable para PRE, en `docs/despliegue.md`):
`paused()` y `hasRole()` responden en el proxy y confirman el mapa de roles · notarizar con DID
de prueba funciona · verificar desde cualquier cuenta devuelve la Evidencia · notarizar sin DID
revierte · re-notarizar revierte con `YaNotarizado` · pausa desde admin bloquea escritura.

No uses `eip712Domain()` como comprobación: el README del template la propone, pero no existe en
la librería v0.2.1 y el proxy revierte con `FunctionNotFound`. Ver D-015.

El script `scripts/validateNotariza.ts` ejecuta este checklist contra el proxy.

`docs/despliegue.md` es insumo directo del expediente para ISBE: parámetros exactos (strings del
namespace **y** sus `keccak256`), mapa de roles con direcciones, y checklist con resultados.

---

## 7. El ABI es la frontera con la UI

`abi/INotariza.json` se publica como artefacto de release versionado. `notariza-ui` lo consume
pinneado a una versión, nunca copiado a mano.

Si cambia la interfaz pública: nueva versión del ABI, entrada en `HISTORIAL.md` y aviso a la
rama de UI. Un cambio de interfaz sin bump es la forma más rápida de romper la UI en silencio.

---

## 8. Qué no hacer aquí

- No añadir constructor. Inicialización única vía `initializer(businessId)`.
- No usar `new` ni `CREATE2`.
- No importar de OpenZeppelin.
- No escribir datos personales on-chain. Solo hashes y DIDs.
- No cambiar una posición de storage ya desplegada. Jamás. Ni "todavía no está en PRE".
- No editar los ficheros de `../contracts/`: son upstream.
- No hacer `delegatecall` al Diamond de gobernanza para leer DIDs: es `staticcall`.
