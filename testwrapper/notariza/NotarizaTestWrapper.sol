// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {NotarizaFacet} from '../../notariza/NotarizaFacet.sol';
import {INotariza} from '../../notariza/INotariza.sol';
import {_DIAMOND} from '../../constants/constants.sol';
import {IAccessControlEoa} from '@red-isbe/isbe-contracts/contracts/access/accessControl/IAccessControlEoa.sol';
import {IDidRegistryQuery} from '@red-isbe/isbe-contracts/contracts/identity/didregistry/interfaces/IDidRegistryQuery.sol';
import {_DEFAULT_ADMIN_ROLE, _PAUSER_ROLE} from '@red-isbe/isbe-contracts/contracts/constants/roles.sol';

/// @title NotarizaTestWrapper
/// @notice Wrapper de test que expone ayudas de inicializacion y pausa sobre NotarizaFacet
/// @dev Solo para tests unitarios de la logica interna, sin la infraestructura de gobernanza.
///      Nunca se despliega en produccion. Los tests de integracion van siempre contra el proxy.
contract NotarizaTestWrapper is NotarizaFacet {
    /// @notice Si esta activo, _resolverIdentidad devuelve did = bytes32(0) para cuentas con
    ///         identidad conocida, en vez de propagar el did real devuelto por el DidRegistry.
    /// @dev Variable de estado suelta, fuera de NotarizaStorage: aceptable en este contrato
    ///      porque nunca se despliega detras del proxy y por tanto no comparte storage con
    ///      ninguna otra faceta. Ver D-031 en HISTORIAL.md.
    bool private _forzarDidCeroParaTest;

    /// @notice Inicializa los roles para pruebas aisladas
    /// @param cuentaAdmin Cuenta a la que se conceden _DEFAULT_ADMIN_ROLE y _PAUSER_ROLE
    function initializeForTest(address cuentaAdmin) external {
        address[] memory miembros = new address[](1);
        miembros[0] = cuentaAdmin;

        IAccessControlEoa.Rbac[] memory rbacs = new IAccessControlEoa.Rbac[](2);
        rbacs[0] = IAccessControlEoa.Rbac({
            role: _DEFAULT_ADMIN_ROLE,
            members: miembros
        });
        rbacs[1] = IAccessControlEoa.Rbac({
            role: _PAUSER_ROLE,
            members: miembros
        });

        _initializeRbacs(rbacs);
    }

    /// @notice Pausa el contrato para probar el comportamiento de whenNotPaused
    function pauseForTest() external {
        _pauseStorage().pause = true;
    }

    /// @notice Reactiva el contrato tras una pausa de prueba
    function unpauseForTest() external {
        _pauseStorage().pause = false;
    }

    /// @notice Activa o desactiva el forzado de did = 0 para el test de la rama defensiva de
    ///         _resolverIdentidad (ver D-031 en HISTORIAL.md)
    /// @param _forzar True para forzar did = 0 en la siguiente notarizacion
    function forzarDidCeroParaTest(bool _forzar) external {
        _forzarDidCeroParaTest = _forzar;
    }

    /// @notice Igual que NotarizaInternal._resolverIdentidad, salvo que devuelve did = 0 con
    ///         identidad conocida cuando forzarDidCeroParaTest(true) esta activo
    function _resolverIdentidad(
        address _cuenta
    ) internal view override returns (bytes32) {
        if (!IDidRegistryQuery(_DIAMOND).isKnownDid(_cuenta)) {
            revert INotariza.IdentidadNoRegistrada(_cuenta);
        }
        if (_forzarDidCeroParaTest) return bytes32(0);
        return IDidRegistryQuery(_DIAMOND).didOf(_cuenta);
    }
}
