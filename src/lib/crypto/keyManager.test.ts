import { describe, expect, it } from 'vitest'
import {
  deriveKeyFromPassword,
  deriveSyncKeyHexFromDbKey,
  generateSaltHex,
} from './keyManagerMain'

describe('keyManagerMain (derivación de claves)', () => {
  it('deriva clave SQLCipher determinista desde contraseña + sal', () => {
    const salt = generateSaltHex()
    const a = deriveKeyFromPassword('MiClaveSegura1', salt)
    const b = deriveKeyFromPassword('MiClaveSegura1', salt)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('deriva clave de sync distinta de la clave de BD', () => {
    const dbKey = deriveKeyFromPassword('test', generateSaltHex())
    const syncKey = deriveSyncKeyHexFromDbKey(dbKey)
    expect(syncKey).not.toBe(dbKey)
    expect(syncKey).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('produce la misma clave de sync para la misma clave de BD', () => {
    const dbKey = 'c'.repeat(64)
    expect(deriveSyncKeyHexFromDbKey(dbKey)).toBe(deriveSyncKeyHexFromDbKey(dbKey))
  })
})
