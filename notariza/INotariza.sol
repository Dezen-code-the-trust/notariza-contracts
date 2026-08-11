// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @title Interfaz del modulo Notariza
/// @notice Notarizacion de documentos sobre Red ISBE: sella on-chain el hash de un documento
///         junto a la identidad de quien lo presenta.
/// @dev Solo declaraciones. La logica vive en NotarizaInternal y la capa externa en Notariza.
///      No se almacena ningun dato personal: unicamente hashes y el DID de ISBE.
interface INotariza {
    /// @notice Evidencia de sellado de un documento
    /// @dev timestamp == 0 significa que el hash no esta notarizado
    /// @param timestamp Marca de tiempo del bloque en que se sello
    /// @param emisor Cuenta que presento el hash
    /// @param did DID del emisor resuelto contra el DidRegistry de ISBE; bytes32(0) si no resuelve
    struct Evidencia {
        uint64 timestamp;
        address emisor;
        bytes32 did;
    }

    /// @notice Emitido al sellar un hash por primera vez
    /// @param hash Hash del documento sellado
    /// @param emisor Cuenta que presento el hash
    /// @param did DID del emisor en el momento del sellado
    /// @param timestamp Marca de tiempo del bloque en que se sello
    event Notarizado(
        bytes32 indexed hash,
        address indexed emisor,
        bytes32 indexed did,
        uint64 timestamp
    );

    /// @notice El hash ya estaba notarizado; no se sobreescribe
    /// @dev El primer sellado gana: la fecha original es el valor probatorio
    /// @param hash Hash del documento que ya constaba sellado
    /// @param timestampOriginal Marca de tiempo del sellado original
    error YaNotarizado(bytes32 hash, uint64 timestampOriginal);

    /// @notice La cuenta no tiene identidad activa en el DidRegistry de ISBE
    /// @param cuenta Cuenta que intento notarizar
    error IdentidadNoRegistrada(address cuenta);

    /// @notice Se intento notarizar bytes32(0)
    error HashVacio();

    /// @notice Sella el hash de un documento
    /// @dev Requiere identidad ISBE activa y que el contrato no este pausado.
    ///      Revierte con YaNotarizado si el hash ya constaba sellado.
    /// @param _hash Hash del documento a sellar
    function notarizar(bytes32 _hash) external;

    /// @notice Devuelve la evidencia asociada a un hash
    /// @dev Lectura publica y sin gate. Si el hash no esta notarizado devuelve la evidencia
    ///      vacia (timestamp == 0), no revierte.
    /// @param _hash Hash del documento a consultar
    /// @return evidencia_ Evidencia registrada para ese hash
    function verificar(bytes32 _hash) external view returns (Evidencia memory evidencia_);

    /// @notice Indica si un hash ya esta notarizado
    /// @dev Atajo para no traer la evidencia completa. Lectura publica y sin gate.
    /// @param _hash Hash del documento a consultar
    /// @return notarizado_ True si el hash consta sellado, false en otro caso
    function estaNotarizado(bytes32 _hash) external view returns (bool notarizado_);
}
