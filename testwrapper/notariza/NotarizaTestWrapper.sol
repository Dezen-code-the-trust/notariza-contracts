// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {NotarizaFacet} from '../../notariza/NotarizaFacet.sol';
import {IAccessControlEoa} from '@red-isbe/isbe-contracts/contracts/access/accessControl/IAccessControlEoa.sol';
import {_DEFAULT_ADMIN_ROLE, _PAUSER_ROLE} from '@red-isbe/isbe-contracts/contracts/constants/roles.sol';

/// @title NotarizaTestWrapper
/// @notice Wrapper de test que expone ayudas de inicializacion y pausa sobre NotarizaFacet
/// @dev Solo para tests unitarios de la logica interna, sin la infraestructura de gobernanza.
///      Nunca se despliega en produccion. Los tests de integracion van siempre contra el proxy.
contract NotarizaTestWrapper is NotarizaFacet {
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
}
