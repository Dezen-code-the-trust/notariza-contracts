// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;
// solhint-disable max-line-length

/*****  NOTARIZA *****/

// Convencion oficial de namespace de ISBE: isbe.customers.{cliente}.{proyecto}.{elemento}
// Se declaran como keccak256('cadena') y no como hex literal para que el compilador las
// derive del texto y no puedan desincronizarse de el.

/// @dev Posicion de storage del modulo. INMUTABLE una vez desplegado.
bytes32 constant _NOTARIZA_STORAGE_POSITION = keccak256('isbe.customers.dezen.notariza.storage');

/// @dev Clave de registro del facet (paso 1: deploy). La devuelve businessIdIntrospection().
bytes32 constant _NOTARIZA_RESOLVER_KEY = keccak256('isbe.customers.dezen.notariza.resolver.key');

/// @dev Identificador de configuracion (pasos 2 y 3: setConfiguration y deployUseCase).
bytes32 constant _NOTARIZA_CONFIG_ID = keccak256('isbe.customers.dezen.notariza.configuration');

/// @dev Rol de administracion del modulo. Reservado: notarizar no exige rol, solo identidad ISBE.
bytes32 constant _NOTARIZA_ADMIN_ROLE = keccak256('isbe.customers.dezen.role.notariza.admin');
