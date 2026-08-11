// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {INotariza} from './INotariza.sol';
import {NotarizaInternal} from './NotarizaInternal.sol';

/// @title Notariza
/// @notice Capa externa del modulo Notariza
/// @dev Hereda de INotariza y NotarizaInternal. Aplica los guards del modelo de seguridad de
///      ISBE y delega toda la logica en las funciones internas.
///      notarizar no lleva onlyRole: el gate de escritura es la identidad ISBE del emisor, no
///      un rol del modulo. _NOTARIZA_ADMIN_ROLE queda reservado para administracion futura.
abstract contract Notariza is INotariza, NotarizaInternal {
    /// @inheritdoc INotariza
    function notarizar(bytes32 _hash) external override whenNotPaused {
        _notarizar(_hash);
    }

    /// @inheritdoc INotariza
    function verificar(
        bytes32 _hash
    ) external view override returns (Evidencia memory evidencia_) {
        return _verificar(_hash);
    }

    /// @inheritdoc INotariza
    function estaNotarizado(
        bytes32 _hash
    ) external view override returns (bool notarizado_) {
        return _estaNotarizado(_hash);
    }

    /// @notice Interfaces soportadas por el modulo, para ERC165
    /// @return interfaces_ Lista de interfaceIds implementados
    function _implementedInterfaces()
        internal
        pure
        virtual
        override
        returns (bytes4[] memory interfaces_)
    {
        uint256 interfacesLength = 1;
        interfaces_ = new bytes4[](interfacesLength);
        interfaces_[--interfacesLength] = type(INotariza).interfaceId;
    }
}
