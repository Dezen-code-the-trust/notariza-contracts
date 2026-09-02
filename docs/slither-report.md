# Informe Slither — notariza-contracts

**Fecha del análisis:** 2026-09-01 · **Slither:** `0.11.6`
**Comando:** `slither . --hardhat-artifacts-directory artifacts --filter-paths "node_modules|isbe-network-case" --exclude-dependencies`
**Alcance:** `contracts/notariza/`, `contracts/testwrapper/`, `contracts/constants/`. Se excluye
el código de `@red-isbe/isbe-contracts` (no es nuestro) y el de `isbe-network-case/`.

## Resumen

| Severidad | Hallazgos | Sin resolver |
|---|---|---|
| High | 0 | 0 |
| Medium | 0 | 0 |
| Low | 0 | 0 |
| Informational | 4 | 0 (justificados) |

**Objetivo cumplido:** cero hallazgos High/Medium sin resolver o sin justificar por escrito.

Slither analizó 47 contratos con 102 detectores y reportó únicamente 4 resultados, todos del
detector `naming-convention` (severidad Informational), todos sobre ficheros propios del
módulo. No apareció ningún hallazgo High ni Medium. En particular, el patrón `assembly` de
`_notarizaStorage()` en `contracts/notariza/NotarizaInternal.sol` **no** aparece en la salida:
las directivas `slither-disable-start assembly` / `slither-disable-end` que rodean esa función
funcionan correctamente y Slither omite el detector `assembly` ahí, tal y como se esperaba.

## Hallazgos

### [Informational] Parámetro `_hash` no está en mixedCase — `contracts/notariza/Notariza.sol:15`

**Detector:** `naming-convention`.
**Descripción:** Slither exige que los parámetros de función sigan `mixedCase` estricto (sin
guion bajo inicial); el parámetro `_hash` de `notarizar(bytes32 _hash)` empieza por `_`.
**Resolución / Justificación:** falso positivo respecto a la convención real del proyecto, no
un defecto. El prefijo `_` en parámetros de entrada (y el sufijo `_` en valores de retorno con
nombre, p. ej. `evidencia_`, `notarizado_`) es la convención de nombrado que usa el propio
módulo de referencia de ISBE, `HashTimestamp`
(`node_modules/@red-isbe/isbe-contracts/contracts/hashtimestamp/{IHashTimestamp,HashTimestamp,HashTimestampInternal}.sol`,
p. ej. `function timestampHash(bytes32 _hash) external` en `IHashTimestamp.sol:34`), que es el
modelo estructural que este repo debe imitar según el `CLAUDE.md` del proyecto. Se mantiene el
código tal cual: cambiarlo rompería la coherencia con el patrón que ISBE espera al revisar.

### [Informational] Parámetro `_hash` no está en mixedCase — `contracts/notariza/Notariza.sol:21`

**Detector:** `naming-convention`.
**Descripción:** mismo caso que el anterior, en el parámetro `_hash` de
`verificar(bytes32 _hash)`.
**Resolución / Justificación:** misma justificación que el hallazgo anterior — convención de
nombrado heredada del patrón `HashTimestamp` de ISBE, aplicada de forma consistente en toda la
interfaz `INotariza` y su implementación.

### [Informational] Parámetro `_hash` no está en mixedCase — `contracts/notariza/Notariza.sol:28`

**Detector:** `naming-convention`.
**Descripción:** mismo caso, en el parámetro `_hash` de `estaNotarizado(bytes32 _hash)`.
**Resolución / Justificación:** misma justificación que los dos hallazgos anteriores.

### [Informational] Parámetro `_forzar` no está en mixedCase — `contracts/testwrapper/notariza/NotarizaTestWrapper.sol:55`

**Detector:** `naming-convention`.
**Descripción:** el parámetro `_forzar` de `forzarDidCeroParaTest(bool _forzar)`, en el
wrapper de test, empieza por `_`.
**Resolución / Justificación:** mismo patrón de nombrado que el resto del módulo, aplicado por
consistencia también en el wrapper de test (que no forma parte de producción pero sigue las
mismas convenciones de código que `contracts/notariza/`). Se acepta por la misma razón: es la
convención de ISBE, no un descuido.

### Sin hallazgos

No se han encontrado hallazgos de severidad High, Medium ni Low sobre los ficheros propios del
módulo (`contracts/notariza/`, `contracts/testwrapper/`, `contracts/constants/`).
