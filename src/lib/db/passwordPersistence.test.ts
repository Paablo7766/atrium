import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveKeyFromPassword, passwordVerifierHex, readCryptoMeta, writeCryptoMeta } from '@/lib/crypto/keyManagerMain'
import { getDbPath } from './connection'
import {
  journalCryptoStatus,
  journalLoad,
  journalSetupPassword,
  journalUnlockPassword,
  prepareJournalDb,
  shutdownJournalDb,
} from './service'

describe('persistencia de la contraseña maestra', () => {
  const dirs: string[] = []

  afterEach(() => {
    shutdownJournalDb()
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function tempDir(): string {
    const dir = path.join(os.tmpdir(), `atrium-pw-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    dirs.push(dir)
    prepareJournalDb(dir)
    return dir
  }

  function removeDb(): void {
    const base = getDbPath()
    for (const suffix of ['', '-wal', '-shm']) {
      const file = suffix ? `${base}${suffix}` : base
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
  }

  it('guarda el HMAC y vuelve a abrir con la misma contraseña', () => {
    const dir = tempDir()
    expect(journalSetupPassword('ClaveLarga1')).toEqual({ ok: true })
    const meta = readCryptoMeta(dir)
    expect(meta?.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(meta?.iterations).toBe(200_000)
    const key = deriveKeyFromPassword('ClaveLarga1', meta!.salt!, meta!.iterations)
    expect(meta?.verifier).toBe(passwordVerifierHex(key))

    shutdownJournalDb()
    prepareJournalDb(dir)
    expect(journalLoad().status).toBe('locked')

    const wrong = journalUnlockPassword('OtraClave99')
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.error).toMatch(/incorrecta/i)

    expect(journalUnlockPassword('ClaveLarga1')).toEqual({ ok: true })
  })

  it('materializa journal.db en disco tras configurar la contraseña', () => {
    const dir = tempDir()
    expect(journalSetupPassword('ClaveLarga1')).toEqual({ ok: true })
    expect(fs.existsSync(getDbPath())).toBe(true)
    expect(fs.statSync(getDbPath()).size).toBeGreaterThan(0)
  })

  it('sin journal.db no trata la contraseña como incorrecta y reutiliza la sal', () => {
    const dir = tempDir()
    expect(journalSetupPassword('ClaveLarga1')).toEqual({ ok: true })
    const salt = readCryptoMeta(dir)?.salt
    shutdownJournalDb()

    const meta = readCryptoMeta(dir)!
    const { verifier: _verifier, ...legacy } = meta
    writeCryptoMeta(dir, legacy)
    removeDb()

    prepareJournalDb(dir)
    expect(journalLoad().status).toBe('empty')
    expect(journalCryptoStatus().hasDatabase).toBe(false)

    expect(journalUnlockPassword('ClaveLarga1')).toEqual({ ok: true })
    expect(fs.existsSync(getDbPath())).toBe(true)
    expect(readCryptoMeta(dir)?.salt).toBe(salt)

    shutdownJournalDb()
    prepareJournalDb(dir)
    expect(journalUnlockPassword('ClaveLarga1')).toEqual({ ok: true })
  })

  it('con meta huérfana o journal.db vacío permite crear el diario con una contraseña nueva', () => {
    const dir = tempDir()
    expect(journalSetupPassword('ClaveLarga1')).toEqual({ ok: true })
    shutdownJournalDb()
    fs.writeFileSync(getDbPath(), 'xxxx')
    prepareJournalDb(dir)
    expect(journalSetupPassword('OtraClave22')).toEqual({ ok: true })
    expect(fs.statSync(getDbPath()).size).toBeGreaterThan(4)
    shutdownJournalDb()
    prepareJournalDb(dir)
    expect(journalUnlockPassword('OtraClave22')).toEqual({ ok: true })
  })
})
