# CLAUDE.md — notariza-contracts

Específico del módulo Solidity.

Este repositorio es un **proyecto Hardhat autocontenido**: `hardhat.config.ts`, `package.json` y
`package-lock.json` están versionados aquí. El template oficial de ISBE
(`isbe-clients-template`) se clona aparte y su único papel es levantar la red local; no se
integra este repo dentro de él.

---

## 1. Los contratos de ISBE no son Solidity convencional

Modalidad 1 = facet del patrón Diamond. Se estructura en 4 ficheros más un wrapper de test, y
hereda de `@red-isbe/isbe-contracts`, **no de OpenZeppelin**. El modelo estructural a imitar es
el ejemplo `HashTimestamp`, disponible en su versión de producción en
`node_modules/@red-isbe/isbe-contracts/contracts/hashtimestamp/` (y también, como ejemplo
adaptado al template, en `contracts/example-hashtimestamp/` del clon de
`isbe-clients-template`).

La guía normativa es `guia-adaptacion-contratos.md`, en la raíz del clon del template. Ante
conflicto entre esa guía y una práctica habitual de Solidity, **gana la guía**.

### Responsabilidad de cada fichero

| Fichero                                                  | Contiene                                                              | No contiene          |
| -------------------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| `contracts/notariza/INotariza.sol`                       | `struct Evidencia`, eventos, errores tipados, firmas                  | ninguna lógica       |
| `contracts/notariza/NotarizaInternal.sol`                | struct de storage, acceso por slot, funciones `_*` con toda la lógica | funciones `external` |
| `contracts/notariza/Notariza.sol`                        | capa `external`: guards (`whenNotPaused`) y delegación a las internas | lógica de negocio    |
| `contracts/notariza/NotarizaFacet.sol`                   | el contrato desplegable, `IEIP2535Introspection`                      | lógica               |
| `contracts/testwrapper/notariza/NotarizaTestWrapper.sol` | expone las internas para unitarios                                    | nada en producción   |

`NotarizaInternal.sol` hereda de `DidDocumentDetailedInternal`, que ya aporta inicialización de
proxy, ERC165, RBAC con DIDs, ownership y pausabilidad. Esa clase base hereda a su vez de
`contracts/core/Common.sol` de la librería, que es el contrato base que exige la política
ECO1020 del ecosistema: son el mismo requisito con nomenclatura distinta.

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
mismo commit, y la tabla de interfaz pública del `README.md`. El test de introspección lo
detecta; no lo saltes ni lo marques como `skip`.

---

## 2. Diseño fijado

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

Roles iniciales: admin del módulo y pausa → EOAs designadas por Dezen, solicitadas
explícitamente en los `rbacs` de `deployUseCase`.

⚠️ **`_ISBE_PAUSER_ROLE` no se añade automáticamente.** El enunciado original del proyecto
afirmaba que la infraestructura de ISBE lo concede sola en Modalidad 1; la inspección de
`ISBEPause._checkPauserRoles()` en la librería demuestra que no es así. El rol de pausa que hay
que solicitar es `_PAUSER_ROLE`, importado como constante de `roles.sol`.

⚠️ **`DEFAULT_ADMIN_ROLE` no se puede pedir en los `rbacs` de `deployUseCase`**: la factoría
revierte con `ForbiddenRole` si se solicita explícitamente, y lo concede ella misma a quien
envía la transacción. Consecuencia para el expediente y origen de esta regla en
`docs/arquitectura.md`, sección 8.

⚠️ **`rbacs: []` es una trampa silenciosa.** El script de ejemplo de HashTimestamp pasa un array
vacío, lo que deja el caso de uso sin ninguna cuenta con el rol requerido. Siempre poblar
`rbacs` explícitamente.

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
  flags pinneados en `hardhat.config.ts` de este repo.
- **Orden dentro del contrato**: type declarations → constantes → modifiers → constructor (no
  hay) → external → public → internal → private. `view`/`pure` al final de su grupo.
- **Naming**: `PascalCase` contratos, structs y errores; `camelCase` funciones y variables;
  `SCREAMING_SNAKE_CASE` constantes; prefijo `_` en internas y en constantes de storage.
  Nombres de dominio en español.
- **NatSpec en español y obligatorio** en todo lo `external` y en los errores: `@notice`,
  `@param`, `@return`, `@dev` para lo no evidente. Es parte del expediente: la documentación
  técnica de ISBE exige que todo método público esté anotado y contrastado, y de no estarlo
  requeriría integrar una whitelist.
- **Custom errors siempre**, nunca `require` con string ni `revert()` desnudo. El error debe
  llevar los datos que permiten diagnosticar (`YaNotarizado` incluye el timestamp original).
- **Checks-Effects-Interactions.** Validar, escribir storage, emitir evento y solo después
  cualquier llamada externa.
- **Validar entradas en el borde `external`**, no en las internas.
- **Sin `assembly`** salvo el acceso al slot de storage, que es obligatorio.
- **Nada de números mágicos**: constantes con nombre en `contracts/constants/constants.sol`.
- **Los IDs de rol se importan de la librería como constante.** Nunca `keccak256("…")` para
  derivar un rol: 8 de las 31 constantes de `roles.sol` no coinciden con el hash de su string, y
  el fichero sigue sin corregirse en el repositorio de la librería.

---

## 5. Testing

Hardhat + chai, sobre la red local (red `isbe` en `hardhat.config.ts`, con la red del template
corriendo en segundo plano).

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

⚠️ **Un `0 passing` con código de salida 0 no es una suite verde.** Si Mocha no descubre
ficheros, `npx hardhat test` sale con éxito en silencio. Comprobar siempre el número de tests
ejecutados, que hoy son **29**.

⚠️ **Sin `.env`, los tests fallan de forma engañosa.** Sin `ACCOUNT_PRIVATE_KEY` el array
`accounts` queda vacío y los tests revientan con `UNSUPPORTED_OPERATION`
(`contract runner does not support calling`), que parece un problema de ethers y es un problema
de configuración.

**Análisis estático**: `slither .`. Objetivo cero críticos/altos sin justificar. Cada hallazgo
se resuelve o se justifica por escrito en `docs/slither-report.md`.

---

## 6. Despliegue: los 3 pasos

Contra el Diamond de gobernanza (`0x…15Be`). En local con la cuenta admin (#0 de Hardhat, por
`.env`); en PRE lo ejecuta ISBE con nuestros parámetros y con su propia cuenta — nuestras EOAs no
tienen rol de despliegue en el Diamond.

1. `deploy` → registra el bytecode del facet (resolver key)
2. `setConfiguration` → asocia el facet a una configuración (config ID)
3. `deployUseCase` → crea el proxy del caso de uso (parámetros `roles`/`members`)

Anotar siempre: dirección del proxy, txid y gas de cada paso. La dirección pública del contrato
es la del **proxy**.

`scripts/deployNotariza.ts` ejecuta los 3 pasos; `scripts/validateNotariza.ts` ejecuta el
checklist post-despliegue contra el proxy. Los resultados van a `docs/despliegue.md`, que es el
insumo directo del expediente para ISBE: parámetros exactos (strings del namespace **y** sus
`keccak256`), mapa de roles con direcciones, y checklist con resultados.

No uses `eip712Domain()` como comprobación: el README del template la propone, pero la función no
existe en ningún `.sol` de `@red-isbe/isbe-contracts` — ni en la versión publicada en npm ni en
el HEAD del repositorio de la librería — y el proxy revierte con `FunctionNotFound`. Es un error
de la documentación de ISBE, que merece la pena reportar junto con el expediente.

---

## 7. El ABI es la frontera con la UI

`abi/INotariza.json` se publica como artefacto de release versionado. `notariza-ui` lo consume
pinneado a una versión, nunca copiado a mano.

---

## 8. Qué no hacer aquí

- No añadir constructor. Inicialización única vía `initializer(businessId)`.
- No usar `new` ni `CREATE2` para crear contratos. La documentación de Modalidad 1 lo prohíbe:
  toda creación se canaliza por la infraestructura de ISBE. (Las asignaciones de arrays en
  memoria, `new bytes4[](n)`, no son creación de contratos y sí están permitidas.)
- No importar de OpenZeppelin.
- No escribir datos personales on-chain. Solo hashes y DIDs.
- No cambiar una posición de storage ya desplegada. Jamás. Ni "todavía no está en PRE".
- No hacer `delegatecall` al Diamond de gobernanza para leer DIDs: es `staticcall`.
- No modificar el clon de `isbe-clients-template`: es upstream y está fijado por SHA. Si algo del
  entorno local necesita un ajuste, va en este repo o en `docs/entorno-local.md`, nunca como
  parche local en el template.
- No ejecutar `npm audit fix` ni actualizar dependencias sin decisión explícita: cambiaría el
  bytecode y rompería la equivalencia bytecode ↔ fuente que exige el proceso de conformidad.