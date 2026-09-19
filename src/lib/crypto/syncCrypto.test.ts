import { describe, expect, it } from 'vitest'
import {
  decryptJson,
  deriveSyncKeyFromDbKeyHex,
  encryptJson,
  SYNC_CIPHER_VERSION,
} from './syncCrypto'

describe('syncCrypto', () => {
  it('cifra y descifra JSON con AES-GCM', async () => {
    const dbKeyHex = 'a'.repeat(64)
    const key = await deriveSyncKeyFromDbKeyHex(dbKeyHex)
    const payload = { version: 2 as const, settings: { traderName: 'Test' }, accounts: [] }
    const blob = await encryptJson(payload, key)
    expect(blob.cipherVersion).toBe(SYNC_CIPHER_VERSION)
    expect(blob.ciphertext).toBeTruthy()
    expect(blob.nonce).toBeTruthy()
    const round = await decryptJson<typeof payload>(blob, key)
    expect(round.settings.traderName).toBe('Test')
  })

  it('rechaza versión de cifrado desconocida', async () => {
    const dbKeyHex = 'b'.repeat(64)
    const key = await deriveSyncKeyFromDbKeyHex(dbKeyHex)
    await expect(
      decryptJson({ ciphertext: 'aa', nonce: 'bb', cipherVersion: 99 }, key),
    ).rejects.toThrow(/Versión de cifrado/)
  })
})
