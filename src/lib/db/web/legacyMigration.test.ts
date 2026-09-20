import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS, type PersistedData } from '@/types'

import { setupMasterPassword, resetWebCryptoForTests } from '@/lib/crypto/keyManagerWeb'

import {

  LEGACY_BROWSER_LS_KEY,

  clearLegacyBrowser,

  hasLegacyBrowserJournal,

  legacyBrowserJournalHasSensitiveData,

  migrateLegacyBrowserToEncrypted,

} from '@/lib/db/client'

import { buildEncryptedBackupFile, deleteJournalDb, exportEncryptedBackup, loadJournal } from '@/lib/db/web'



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



function legacyPlainJournal(): PersistedData {

  const now = new Date().toISOString()

  return {

    version: 2,

    settings: { ...DEFAULT_SETTINGS, traderName: 'LegacyUser', onboardingCompleted: true, playbook: [] },

    accounts: [

      {

        id: 'acc-legacy',

        name: 'Cuenta legacy',

        broker: 'XTB',

        type: 'live',

        color: 'green',

        currency: 'USD',

        startingBalance: 15000,

        riskPerTrade: 1,

        dailyLossLimit: 0,

        createdAt: now,

        trades: [

          {

            id: 'tr-legacy',

            symbol: 'EURUSD-LEGACY-SECRET',

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

            notes: 'nota-legacy-secreta',

            rating: 4,

            createdAt: now,

            updatedAt: now,

          },

        ],

        notes: [{ id: 'n-legacy', date: '2026-09-20', mood: 4, title: 'Diario', content: 'contenido-legacy-secreto', updatedAt: now }],

        cashflows: [],

      },

    ],

  }

}



describe('legacy localStorage migration (web)', () => {

  beforeEach(() => {

    globalThis.localStorage = new MemoryStorage()

    resetWebCryptoForTests()

  })



  afterEach(async () => {

    resetWebCryptoForTests()

    await deleteJournalDb()

    clearLegacyBrowser()

  })



  it('detecta datos sensibles en localStorage legacy', () => {

    localStorage.setItem(LEGACY_BROWSER_LS_KEY, JSON.stringify(legacyPlainJournal()))

    expect(hasLegacyBrowserJournal()).toBe(true)

    expect(legacyBrowserJournalHasSensitiveData()).toBe(true)

    expect(localStorage.getItem(LEGACY_BROWSER_LS_KEY)).toContain('EURUSD-LEGACY-SECRET')

  })



  it('migra a IndexedDB cifrado y borra trades/journal en claro de localStorage', async () => {

    const legacy = legacyPlainJournal()

    localStorage.setItem(LEGACY_BROWSER_LS_KEY, JSON.stringify(legacy))



    const setup = await setupMasterPassword('ClaveLarga1')

    expect(setup.ok).toBe(true)



    const migrated = await migrateLegacyBrowserToEncrypted(legacy)

    expect(migrated.ok).toBe(true)



    expect(hasLegacyBrowserJournal()).toBe(false)

    expect(localStorage.getItem(LEGACY_BROWSER_LS_KEY)).toBeNull()



    const lsDump = JSON.stringify([...Array(localStorage.length)].map((_, i) => localStorage.key(i)))

    expect(lsDump).not.toContain('EURUSD-LEGACY-SECRET')

    expect(lsDump).not.toContain('contenido-legacy-secreto')

    expect(lsDump).not.toContain('nota-legacy-secreta')



    const loaded = await loadJournal()

    expect(loaded?.accounts?.[0]?.trades[0]?.symbol).toBe('EURUSD-LEGACY-SECRET')

    expect(loaded?.accounts?.[0]?.notes[0]?.content).toBe('contenido-legacy-secreto')

  })



  it('exportación cifrada no contiene datos financieros en claro', async () => {

    const data = legacyPlainJournal()

    const setup = await setupMasterPassword('ClaveLarga1')

    expect(setup.ok).toBe(true)



    const raw = await exportEncryptedBackup(data)

    expect(raw).toContain('atrium-backup')

    expect(raw).not.toContain('EURUSD-LEGACY-SECRET')

    expect(raw).not.toContain('contenido-legacy-secreto')

    expect(raw).not.toContain('LegacyUser')



    const parsed = JSON.parse(raw) as { blob: { ciphertext: string } }

    expect(parsed.blob.ciphertext.length).toBeGreaterThan(20)



    const reEncrypted = await buildEncryptedBackupFile(data, 'a'.repeat(64), 'b'.repeat(32))

    expect(reEncrypted).not.toContain('EURUSD-LEGACY-SECRET')

  })

})


