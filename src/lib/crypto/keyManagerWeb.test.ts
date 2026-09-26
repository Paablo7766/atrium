import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deriveKeyFromPassword as deriveKeyNode,
  deriveSyncKeyHexFromDbKey as deriveSyncKeyNode,
  generateSaltHex as generateSaltNode,
} from './keyManagerMain'
import {
  deriveKeyFromPassword,
  deriveSyncKeyHexFromDbKey,
  getCryptoStatus,
  getWebCryptoMeta,
  getWebKeyHex,
  resetWebCryptoForTests,
  setupMasterPassword,
  setupSecureStorageKey,
  tryAutoUnlock,
  unlockWithPassword,
  WEB_CRYPTO_META_KEY,
} from './keyManagerWeb'
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

describe('keyManagerWeb', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage()
    resetWebCryptoForTests()
  })

  afterEach(async () => {
    resetWebCryptoForTests()
    await deleteJournalDb()
  })

  it('deriva la misma clave PBKDF2 que el escritorio (200.000 iteraciones)', async () => {
    const salt = generateSaltNode()
    const password = 'MiClaveSegura1'
    const web = await deriveKeyFromPassword(password, salt)
    expect(web).toBe(deriveKeyNode(password, salt))
    expect(web).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('deriva la misma clave de sync HKDF que el escritorio', async () => {
    const dbKey = 'c'.repeat(64)
    expect(await deriveSyncKeyHexFromDbKey(dbKey)).toBe(deriveSyncKeyNode(dbKey))
  })

  it('persiste solo la sal, nunca la clave ni la contraseña', async () => {
    const result = await setupMasterPassword('ClaveLarga1')
    expect(result.ok).toBe(true)
    const meta = getWebCryptoMeta()
    expect(meta?.salt).toMatch(/^[0-9a-f]{32}$/i)
    expect(meta?.iterations).toBe(200_000)
    const raw = localStorage.getItem(WEB_CRYPTO_META_KEY) ?? ''
    expect(raw).toContain(meta!.salt)
    expect(raw.toLowerCase()).not.toContain('clavelarga1')
    const key = getWebKeyHex()
    expect(key).toMatch(/^[0-9a-f]{64}$/i)
    expect(raw).not.toContain(key)
  })

  it('desbloquea con la contraseña correcta y rechaza la incorrecta', async () => {
    await setupMasterPassword('ClaveLarga1')
    const metaRaw = localStorage.getItem(WEB_CRYPTO_META_KEY)
    expect(metaRaw).toBeTruthy()
    resetWebCryptoForTests()
    localStorage.setItem(WEB_CRYPTO_META_KEY, metaRaw!)

    const denied = await unlockWithPassword('otraClave99')
    expect(denied.ok).toBe(false)
    expect(getWebKeyHex()).toBeNull()

    const ok = await unlockWithPassword('ClaveLarga1')
    expect(ok).toEqual({ ok: true })
    expect(getWebKeyHex()).toMatch(/^[0-9a-f]{64}$/i)

    const status = await getCryptoStatus()
    expect(status.configured).toBe(true)
    expect(status.secureStorageAvailable).toBe(false)
    expect(status.needsUnlock).toBe(false)
  })

  it('no ofrece clave automática del sistema', async () => {
    const setup = await setupSecureStorageKey()
    expect(setup.ok).toBe(false)
    const auto = await tryAutoUnlock()
    expect(auto.ok).toBe(false)
    const status = await getCryptoStatus()
    expect(status.secureStorageAvailable).toBe(false)
  })

  it('no reconfigura el cifrado si ya hay canario y clave en memoria', async () => {
    const first = await setupMasterPassword('ClaveLarga1')
    expect(first.ok).toBe(true)
    const second = await setupMasterPassword('OtraClave22')
    expect(second).toEqual({ ok: false, error: 'El cifrado ya está configurado.' })
    expect(getWebKeyHex()).toMatch(/^[0-9a-f]{64}$/i)
  })
})
