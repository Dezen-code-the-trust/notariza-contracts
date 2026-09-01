import { ethers } from 'hardhat'

/** Diamond de gobernanza de ISBE (genesis). Misma direccion en local y en PRE. */
export const DIAMOND = '0x00000000000000000000000000000000000015BE'

export const NOTARIZA_RESOLVER_KEY = ethers.id('isbe.customers.dezen.notariza.resolver.key')
export const NOTARIZA_ADMIN_ROLE = ethers.id('isbe.customers.dezen.role.notariza.admin')

/**
 * _PAUSER_ROLE de @red-isbe/isbe-contracts/contracts/constants/roles.sol. Se copia el hex y no
 * se deriva del string: 8 de las 31 constantes de roles.sol no coinciden con el keccak256 de
 * su cadena documentada (ver invariante 6 del CLAUDE.md raiz).
 */
export const PAUSER_ROLE = '0x8c911f4537972e7549dbbd37a96b929a4b480f4fb156fc6344524bdf2ca50aa1'
