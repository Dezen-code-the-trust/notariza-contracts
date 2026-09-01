// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {_NOTARIZA_STORAGE_POSITION, _DIAMOND} from '../constants/constants.sol';
import {INotariza} from './INotariza.sol';
import {DidDocumentDetailedInternal} from '@red-isbe/isbe-contracts/contracts/identity/didregistry/DidDocumentDetailedInternal.sol';
import {IDidRegistryQuery} from '@red-isbe/isbe-contracts/contracts/identity/didregistry/interfaces/IDidRegistryQuery.sol';

/// @title NotarizaInternal
/// @notice Logica interna y storage del modulo Notariza
/// @dev Pensado para ser usado solo por contratos que extiendan Notariza.
///      Hereda de DidDocumentDetailedInternal, que ya aporta inicializacion de proxy, ERC165,
///      control de acceso por roles con DIDs, ownership y pausabilidad.
abstract contract NotarizaInternal is DidDocumentDetailedInternal {
    /// @notice Estado completo del modulo
    /// @dev Todo el estado va dentro del struct: las facetas de un proxy comparten storage y
    ///      una variable suelta colisionaria con la de otra faceta sin previo aviso.
    struct NotarizaStorage {
        mapping(bytes32 => INotariza.Evidencia) evidencias;
    }

    /// @notice Sella un hash y emite el evento correspondiente
    /// @dev Orden de comprobaciones de mas barata a mas cara: hash vacio, identidad y por
    ///      ultimo la lectura de storage que detecta el hash ya sellado.
    ///      La pausa se comprueba antes, en el modifier whenNotPaused de la capa externa.
    ///      La resolucion de identidad vive en _resolverIdentidad, punto de extension para
    ///      test (ver su NatSpec).
    /// @param _hash Hash del documento a sellar
    function _notarizar(bytes32 _hash) internal virtual {
        _comprobarHashNoVacio(_hash);

        bytes32 did = _resolverIdentidad(msg.sender);

        _comprobarNoNotarizado(_hash);

        uint64 timestamp = uint64(_blockTimestamp());
        _notarizaStorage().evidencias[_hash] = INotariza.Evidencia({
            timestamp: timestamp,
            emisor: msg.sender,
            did: did
        });

        emit INotariza.Notarizado(_hash, msg.sender, did, timestamp);
    }

    /// @notice Resuelve el DID de una cuenta contra el DidRegistry de ISBE
    /// @dev Punto de extension pensado para test. En produccion siempre resuelve contra el
    ///      Diamond de gobernanza real mediante una llamada externa (staticcall), nunca
    ///      delegatecall ni acceso a storage propio. NotarizaTestWrapper la sobreescribe
    ///      unicamente para forzar did = 0 con isKnownDid() == true, caso que la libreria
    ///      red-isbe/isbe-contracts v0.2.1 no deja alcanzar por el camino real: isKnownDid y
    ///      didOf comparten el mismo guard de capabilityInvocation activa
    ///      (DidDocumentDetailedInternal.sol). La comprobacion se mantiene de todos modos
    ///      porque es la que protege en produccion si ese acoplamiento cambia en una version
    ///      futura de la libreria. Ver D-031 en HISTORIAL.md.
    /// @param _cuenta Cuenta a resolver
    /// @return did DID de la cuenta; bytes32(0) si no tiene capabilityInvocation activa
    function _resolverIdentidad(
        address _cuenta
    ) internal view virtual returns (bytes32 did) {
        if (!IDidRegistryQuery(_DIAMOND).isKnownDid(_cuenta)) {
            revert INotariza.IdentidadNoRegistrada(_cuenta);
        }
        return IDidRegistryQuery(_DIAMOND).didOf(_cuenta);
    }

    /// @notice Devuelve la evidencia registrada para un hash
    /// @param _hash Hash del documento a consultar
    /// @return La evidencia; vacia (timestamp == 0) si el hash no esta notarizado
    function _verificar(
        bytes32 _hash
    ) internal view virtual returns (INotariza.Evidencia memory) {
        return _notarizaStorage().evidencias[_hash];
    }

    /// @notice Indica si un hash ya esta notarizado
    /// @param _hash Hash del documento a consultar
    /// @return True si consta sellado, false en otro caso
    function _estaNotarizado(
        bytes32 _hash
    ) internal view virtual returns (bool) {
        return _notarizaStorage().evidencias[_hash].timestamp != 0;
    }

    /// @notice Revierte si el hash es bytes32(0)
    /// @dev Error propio en lugar del modifier bytes32IsNotZero de la libreria, que revierte
    ///      con EmptyBytes32: la UI mapea nuestros errores tipados a mensajes concretos.
    /// @param _hash Hash a validar
    function _comprobarHashNoVacio(bytes32 _hash) internal pure virtual {
        require(_hash != bytes32(0), INotariza.HashVacio());
    }

    /// @notice Revierte si el hash ya estaba sellado
    /// @dev El primer sellado gana: se devuelve el timestamp original para que la UI pueda
    ///      mostrar la evidencia existente sin una segunda llamada.
    /// @param _hash Hash a validar
    function _comprobarNoNotarizado(bytes32 _hash) internal view virtual {
        uint64 timestampOriginal = _notarizaStorage().evidencias[_hash].timestamp;
        require(
            timestampOriginal == 0,
            INotariza.YaNotarizado(_hash, timestampOriginal)
        );
    }

    /// @notice Devuelve el storage del modulo
    /// @dev Storage no estructurado en slot fijo derivado del namespace del proyecto
    /// @return storage_ El struct de storage de Notariza
    function _notarizaStorage()
        internal
        pure
        returns (NotarizaStorage storage storage_)
    {
        bytes32 position = _NOTARIZA_STORAGE_POSITION;
        // slither-disable-start assembly
        // solhint-disable-next-line no-inline-assembly
        assembly {
            storage_.slot := position
        }
        // slither-disable-end assembly
    }
}
