// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {_NOTARIZA_RESOLVER_KEY} from '../../constants/constants.sol';
import {Notariza} from '../../notariza/Notariza.sol';
import {IEIP2535Introspection} from '@red-isbe/isbe-contracts/contracts/proxies/eip2535/interfaces/IEIP2535Introspection.sol';

/// @title NotarizaFacetV2
/// @notice Segunda version de prueba del facet Notariza, usada solo por el test de upgrade
///         del Diamond: mismo storage que NotarizaFacet, con un cambio trivial de logica
///         (una funcion nueva de solo lectura) para demostrar que actualizar el facet conserva
///         las evidencias ya selladas. Nunca se despliega en produccion.
/// @dev Comparte la misma _NOTARIZA_RESOLVER_KEY que NotarizaFacet: se registra como una nueva
///      version del mismo businessId, no como un modulo distinto.
contract NotarizaFacetV2 is Notariza, IEIP2535Introspection {
    /// @notice Interfaces soportadas por el facet
    function interfacesIntrospection()
        external
        pure
        returns (bytes4[] memory interfaces_)
    {
        return _implementedInterfaces();
    }

    /// @notice Identificador de negocio del modulo (igual que en la v1)
    function businessIdIntrospection()
        external
        pure
        override
        returns (bytes32 businessId_)
    {
        businessId_ = _NOTARIZA_RESOLVER_KEY;
    }

    /// @notice Cambio trivial de logica que distingue esta version de la v1
    /// @return version_ Identificador legible de la version del facet
    function versionModulo() external pure returns (string memory version_) {
        return 'v2-test-upgrade';
    }

    /// @notice Selectores de todas las funciones external del modulo en esta version
    function selectorsIntrospection()
        external
        pure
        override
        returns (bytes4[] memory selectors_)
    {
        uint256 selectorsLength = 4;
        selectors_ = new bytes4[](selectorsLength);
        selectors_[--selectorsLength] = this.notarizar.selector;
        selectors_[--selectorsLength] = this.verificar.selector;
        selectors_[--selectorsLength] = this.estaNotarizado.selector;
        selectors_[--selectorsLength] = this.versionModulo.selector;
    }
}
