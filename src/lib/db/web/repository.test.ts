import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type PersistedData } from '@/types'
import { setupMasterPassword, resetWebCryptoForTests, WEB_CRYPTO_META_KEY } from '@/lib/crypto/keyManagerWeb'
import {
  deleteJournalDb,
  exportEncryptedBackup,
  importEncryptedBackup,
  isDatabaseEmpty,
  loadJournal,
  openJournalDb,
  saveJournal,
} from '@/lib/db/web'
import { isEncryptedBlob } from '@/lib/db/web/recordCrypto'

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

function sampleJournal(): PersistedData {
  const now = new Date().toISOString()
  return {
    version: 2,
    settings: {
      ...DEFAULT_SETTINGS,
      traderName: 'Pablo',
      onboardingCompleted: true,
      playbook: [{ id: 'pb1', name: 'ORB', notes: '', checklist: [{ id: 'c1', label: 'Rango' }], createdAt: now, updatedAt: now }],
    },
    accounts: [
      {
        id: 'acc-1',
        name: 'Cuenta principal',
        broker: 'XTB',
        type: 'live',
        color: 'green',
        currency: 'USD',
        startingBalance: 10000,
        riskPerTrade: 1,
        dailyLossLimit: 0,
        createdAt: now,
        trades: [
          {
            id: 'tr-1',
            symbol: 'EURUSD-SECRET',
            market: 'Forex',
            direction: 'LONG',
            status: 'CLOSED',
            entryDate: now,
            exitDate: now,
            entryPrice: 1.08,
            exitPrice: 1.09,
            quantity: 1,
            multiplier: 1,
            fees: 0,
            strategy: 'ORB',
            tags: [],
            notes: 'nota-secreta',
            rating: 4,
            createdAt: now,
            updatedAt: now,
          },
        ],
        notes: [{ id: 'n-1', date: '2026-09-20', mood: 4, title: 'Sesión', content: 'contenido-secreto', updatedAt: now }],
        cashflows: [{ id: 'cf-1', date: now, kind: 'deposit', amount: 500, note: 'ingreso-secreto' }],
      },
    ],
  }
}

describe('web repository (IndexedDB + AES-GCM)', () => {
  beforeEach(async () => {
    globalThis.localStorage = new MemoryStorage()
    resetWebCryptoForTests()
    await deleteJournalDb()
    const setup = await setupMasterPassword('ClaveLarga1')
    expect(setup.ok).toBe(true)
  })

  afterEach(async () => {
    resetWebCryptoForTests()
    await deleteJournalDb()
  })

  it('guarda y carga el journal con la misma forma que repository/', async () => {
    expect(await isDatabaseEmpty()).toBe(true)
    const data = sampleJournal()
    await saveJournal(data)
    expect(await isDatabaseEmpty()).toBe(false)
    const loaded = await loadJournal()
    expect(loaded?.settings.traderName).toBe('Pablo')
    expect(loaded?.accounts?.[0]?.trades[0]?.symbol).toBe('EURUSD-SECRET')
    expect(loaded?.accounts?.[0]?.notes[0]?.content).toBe('contenido-secreto')
    expect(loaded?.accounts?.[0]?.cashflows[0]?.note).toBe('ingreso-secreto')
    expect(loaded?.settings.playbook[0]?.name).toBe('ORB')
  })

  it('no deja registros en claro en IndexedDB', async () => {
    await saveJournal(sampleJournal())
    const db = await openJournalDb()
    const trade = await db.get('trades', 'tr-1')
    expect(isEncryptedBlob(trade)).toBe(true)
    const dumped = JSON.stringify(trade)
    expect(dumped).not.toContain('EURUSD-SECRET')
    expect(dumped).not.toContain('nota-secreta')
    const note = await db.get('journal_entries', 'n-1')
    expect(JSON.stringify(note)).not.toContain('contenido-secreto')
    const settings = await db.get('settings', '1')
    expect(JSON.stringify(settings)).not.toContain('Pablo')
  })

  it('exporta e importa un .atrium-backup cifrado', async () => {
    await saveJournal(sampleJournal())
    const raw = await exportEncryptedBackup()
    expect(raw).toContain('atrium-backup')
    expect(raw).not.toContain('EURUSD-SECRET')
    expect(raw).not.toContain('contenido-secreto')

    const emptied: PersistedData = {
      version: 2,
      settings: { ...DEFAULT_SETTINGS, traderName: 'Vacio', onboardingCompleted: true, playbook: [] },
      accounts: [
        {
          id: 'acc-empty',
          name: 'Otra',
          broker: '',
          type: 'live',
          color: 'green',
          currency: 'USD',
          startingBalance: 1,
          riskPerTrade: 1,
          dailyLossLimit: 0,
          createdAt: new Date().toISOString(),
          trades: [],
          notes: [],
          cashflows: [],
        },
      ],
    }
    await saveJournal(emptied)
    expect((await loadJournal())?.settings.traderName).toBe('Vacio')

    const restored = await importEncryptedBackup(raw)
    expect(restored.ok).toBe(true)
    const loaded = await loadJournal()
    expect(loaded?.accounts?.[0]?.trades[0]?.symbol).toBe('EURUSD-SECRET')
    expect(localStorage.getItem(WEB_CRYPTO_META_KEY)).toBeTruthy()
  })

  it('pide la contraseña al restaurar una copia hecha en otro dispositivo', async () => {
    await saveJournal(sampleJournal())
    const raw = await exportEncryptedBackup()

    resetWebCryptoForTests()
    await deleteJournalDb()
    globalThis.localStorage = new MemoryStorage()
    expect((await setupMasterPassword('OtraClave22')).ok).toBe(true)

    const withoutPassword = await importEncryptedBackup(raw)
    expect(withoutPassword.ok).toBe(false)
    if (!withoutPassword.ok) expect(withoutPassword.needsPassword).toBe(true)

    const wrongPassword = await importEncryptedBackup(raw, 'Incorrecta99')
    expect(wrongPassword.ok).toBe(false)
    if (!wrongPassword.ok) expect(wrongPassword.needsPassword).toBe(true)

    const restored = await importEncryptedBackup(raw, 'ClaveLarga1')
    expect(restored.ok).toBe(true)
    expect((await loadJournal())?.accounts?.[0]?.trades[0]?.symbol).toBe('EURUSD-SECRET')
  })
})
