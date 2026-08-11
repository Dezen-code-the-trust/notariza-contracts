// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {_NOTARIZA_RESOLVER_KEY} from '../constants/constants.sol';
import {Notariza} from './Notariza.sol';
import {IEIP2535Introspection} from '@red-isbe/isbe-contracts/contracts/proxies/eip2535/interfaces/IEIP2535Introspection.sol';

/// @title NotarizaFacet
/// @notice Facet desplegable del modulo Notariza para el patron Diamond de ISBE
/// @dev Nunca se llama directamente: todas las invocaciones van al proxy del caso de uso.
contract NotarizaFacet is Notariza, IEIP2535Introspection {
    /// @notice Interfaces soportadas por el facet
    /// @return interfaces_ Lista de interfaceIds implementados
    function interfacesIntrospection()
        external
        pure
        returns (bytes4[] memory interfaces_)
    {
        return _implementedInterfaces();
    }

    /// @notice Identificador de negocio del modulo
    /// @return businessId_ La clave de registro del facet en el Diamond de gobernanza
    function businessIdIntrospection()
        external
        pure
        override
        returns (bytes32 businessId_)
    {
        businessId_ = _NOTARIZA_RESOLVER_KEY;
    }

    /// @notice Selectores de todas las funciones external del modulo
    /// @dev Una funcion external que falte aqui compila y despliega, pero no es enrutable a
    ///      traves del proxy: al llamarla simplemente no existe. Actualizar en el mismo commit
    ///      en que se anada o renombre cualquier funcion external.
    /// @return selectors_ Lista de selectores enrutables
    function selectorsIntrospection()
        external
        pure
        override
        returns (bytes4[] memory selectors_)
    {
        uint256 selectorsLength = 3;
        selectors_ = new bytes4[](selectorsLength);
        selectors_[--selectorsLength] = this.notarizar.selector;
        selectors_[--selectorsLength] = this.verificar.selector;
        selectors_[--selectorsLength] = this.estaNotarizado.selector;
    }
}
