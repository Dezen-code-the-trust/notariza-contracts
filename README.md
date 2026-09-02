# notariza-contracts

Notariza sella on-chain el hash de un documento junto con quién lo presentó y cuándo, exigiendo
una identidad activa en Red ISBE (un DID en su `DidRegistry`). El documento en sí nunca sale del
navegador del usuario: solo su hash llega a la cadena.

Este repositorio contiene el módulo Solidity — el contrato — desplegado bajo la **Modalidad 1**
de ISBE (patrón Diamond, EIP-2535). Es el repo hermano de
[`notariza-ui`](https://github.com/Dezen-code-the-trust/notariza-ui), que consume el ABI
publicado aquí ([`abi/INotariza.json`](abi/INotariza.json)) como interfaz web.

## Arquitectura

El Diamond de gobernanza de ISBE y el proxy del caso de uso de Notariza son contratos distintos,
en direcciones distintas. El proxy consulta la identidad del emisor contra el Diamond con una
llamada externa de solo lectura (`staticcall`), nunca `delegatecall`:

```mermaid
flowchart LR
    Usuario(["Usuario / UI"])

    subgraph Gobernanza["Diamond de gobernanza — 0x00…15Be (misma dirección en local y PRE)"]
        Factory["IsbeFactory"]
        DidRegistry["DidRegistryQuery"]
    end

    subgraph CasoUso["Proxy de Notariza — dirección propia, distinta del Diamond"]
        Facet["NotarizaFacet"]
        Storage[("NotarizaStorage")]
    end

    Usuario -->|"notarizar / verificar / estaNotarizado"| Facet
    Facet -->|"staticcall: isKnownDid / didOf"| DidRegistry
    Factory -.->|"deploy / setConfiguration / deployUseCase"| Facet
    Facet --> Storage
```

El módulo, como toda faceta de Modalidad 1, se estructura en 4 ficheros con responsabilidades
que no se solapan:

```mermaid
flowchart TB
    INotariza["INotariza.sol<br/>interfaz: struct Evidencia,<br/>eventos, errores tipados"]
    Internal["NotarizaInternal.sol<br/>storage del módulo y lógica _*<br/>(acceso al slot fijo)"]
    External["Notariza.sol<br/>capa external: guards<br/>(whenNotPaused) + delegación"]
    Facet["NotarizaFacet.sol<br/>contrato desplegable +<br/>introspección EIP-2535"]

    Facet --> External
    External --> Internal
    External -.->|"implementa"| INotariza
    Internal -.->|"usa structs de"| INotariza
```

Detalle completo — por qué Modalidad 1, el flujo de identidad, el storage no estructurado, los 3
pasos de despliegue y las reglas del patrón que no se pueden romper — en
[`docs/arquitectura.md`](docs/arquitectura.md).

## Probar en local

```bash
npx hardhat compile
npx hardhat test --network isbe
```

Requiere la red local de ISBE levantada y este repo integrado dentro del template
`isbe-clients-template` (el proyecto Hardhat es la raíz de ese template, no este repo). Guía
completa, paso a paso, en [`docs/entorno-local.md`](docs/entorno-local.md).

## Estructura del repositorio

```
contracts/                          ← raíz de este repo
├── abi/INotariza.json              — ABI de release, consumido por notariza-ui
├── constants/constants.sol         — namespace, resolver key, config id, rol admin, Diamond
├── notariza/
│   ├── INotariza.sol                — interfaz: struct Evidencia, eventos, errores
│   ├── NotarizaInternal.sol         — storage del módulo y lógica interna
│   ├── Notariza.sol                 — capa external: guards + delegación
│   └── NotarizaFacet.sol            — contrato desplegable, introspección EIP-2535
├── testwrapper/notariza/
│   ├── NotarizaTestWrapper.sol      — expone la lógica interna para tests unitarios
│   └── NotarizaFacetV2.sol          — v2 de prueba, solo para el test de upgrade
├── scripts/
│   ├── deployNotariza.ts            — despliegue en 3 pasos contra el Diamond
│   ├── validateNotariza.ts          — checklist de validación post-despliegue
│   ├── registerTestDid.ts           — registra DID de prueba en la red local
│   └── checkStorage.ts              — verificación empírica del slot de storage
├── test/
│   ├── constants.test.ts            — cada constante == keccak256 de su string
│   ├── helpers/                     — despliegue, cuentas de prueba, constantes compartidas
│   └── notariza/                    — unitarios, integración, introspección, upgrade
└── docs/
    ├── arquitectura.md              — diseño técnico y reglas del patrón
    ├── entorno-local.md             — cómo levantar la red y desplegar
    ├── despliegue.md                — parámetros de despliegue y checklist
    └── slither-report.md            — informe de análisis estático
```

## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md) — diseño técnico: por qué Modalidad 1, el
  Diamond de gobernanza frente al proxy, el flujo de identidad, el storage no estructurado y las
  reglas del patrón.
- [`docs/entorno-local.md`](docs/entorno-local.md) — cómo levantar la red local, integrar este
  repo en el template de ISBE, compilar, desplegar, testear y validar.
- [`docs/despliegue.md`](docs/despliegue.md) — parámetros de despliegue (namespace, mapa de
  roles) y checklist de validación post-despliegue.
- [`docs/slither-report.md`](docs/slither-report.md) — informe de análisis estático.
