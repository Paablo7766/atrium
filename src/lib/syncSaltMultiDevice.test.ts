import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deriveSyncKeyHexFromDbKey,
  getWebCryptoMeta,
  getWebKeyHex,
  resetWebCryptoForTests,
  setupMasterPassword,
  stageLocalSalt,
} from '@/lib/crypto/keyManagerWeb'
import { deleteJournalDb } from '@/lib/db/web'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }
}

/** Simula el almacén remoto de sal en Supabase (user_crypto_salts). */
type RemoteSaltStore = { salt: string | null; iterations: number }

function simulateDevice(localStorage: Storage) {
  globalThis.localStorage = localStorage
  resetWebCryptoForTests()
}

describe('syncSalt multi-device', () => {
  let remote: RemoteSaltStore

  beforeEach(() => {
    remote = { salt: null, iterations: 200_000 }
  })

  afterEach(async () => {
    resetWebCryptoForTests()
    await deleteJournalDb()
  })

  it('dos dispositivos con la misma cuenta y contraseña derivan la misma clave tras sincronizar la sal', async () => {
    const password = 'ClaveLarga1'

    simulateDevice(new MemoryStorage())
    const first = await setupMasterPassword(password)
    expect(first.ok).toBe(true)
    const meta1 = getWebCryptoMeta()
    expect(meta1?.salt).toMatch(/^[0-9a-f]{32}$/i)
    const keyDevice1 = getWebKeyHex()
    expect(keyDevice1).toMatch(/^[0-9a-f]{64}$/i)

    remote.salt = meta1!.salt ?? null
    remote.iterations = meta1!.iterations

    simulateDevice(new MemoryStorage())
    stageLocalSalt(remote.salt!, remote.iterations)
    const second = await setupMasterPassword(password, { saltHex: remote.salt! })
    expect(second.ok).toBe(true)
    const keyDevice2 = getWebKeyHex()

    expect(keyDevice2).toBe(keyDevice1)
    expect(await deriveSyncKeyHexFromDbKey(keyDevice1!)).toBe(await deriveSyncKeyHexFromDbKey(keyDevice2!))
  })

  it('rechaza contraseña incorrecta cuando hay datos remotos que verificar', async () => {
    const password = 'ClaveLarga1'
    const wrong = 'OtraClave9'

    simulateDevice(new MemoryStorage())
    await setupMasterPassword(password)
    remote.salt = getWebCryptoMeta()!.salt ?? null
    const expectedDbKeyHex = getWebKeyHex()

    simulateDevice(new MemoryStorage())
    stageLocalSalt(remote.salt!, remote.iterations)

    const denied = await setupMasterPassword(wrong, {
      saltHex: remote.salt!,
      verifyWithCloud: async (derivedKeyHex) => {
        if (derivedKeyHex !== expectedDbKeyHex) {
          return { ok: false, error: 'Contraseña incorrecta.' }
        }
        return { ok: true, hasRemoteData: true }
      },
    })

    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.error).toBe('Contraseña incorrecta.')
    expect(getWebKeyHex()).toBeNull()
  })
})
