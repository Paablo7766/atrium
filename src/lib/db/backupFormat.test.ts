import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type PersistedData } from '@/types'
import { buildEncryptedBackupFile, decryptBackupFile, parseBackupFile } from './backupFormat'

const KEY = 'a'.repeat(64)
const SALT = 'b'.repeat(32)

describe('backupFormat', () => {
  it('descifra lo que cifra con la misma clave', async () => {
    const data = { trades: [], notes: [], settings: DEFAULT_SETTINGS } as unknown as PersistedData
    const raw = await buildEncryptedBackupFile(data, KEY, SALT)
    const parsed = parseBackupFile(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.salt).toBe(SALT)
    await expect(decryptBackupFile(parsed.file, KEY)).resolves.toEqual(data)
  })

  it('falla con otra clave', async () => {
    const raw = await buildEncryptedBackupFile({ trades: [] } as unknown as PersistedData, KEY, SALT)
    const parsed = parseBackupFile(raw)
    if (!parsed.ok) throw new Error(parsed.error)
    await expect(decryptBackupFile(parsed.file, 'c'.repeat(64))).rejects.toThrow()
  })

  it('cifra diarios grandes (varios MB)', async () => {
    const notes = Array.from({ length: 4000 }, (_, i) => ({ id: `n${i}`, content: 'x'.repeat(1000) }))
    const data = { trades: [], notes } as unknown as PersistedData
    const parsed = parseBackupFile(await buildEncryptedBackupFile(data, KEY, SALT))
    if (!parsed.ok) throw new Error(parsed.error)
    await expect(decryptBackupFile(parsed.file, KEY)).resolves.toEqual(data)
  })

  it('rechaza archivos que no son copias de Atrium', () => {
    expect(parseBackupFile('no es json').ok).toBe(false)
    expect(parseBackupFile(JSON.stringify({ magic: 'otra-cosa' })).ok).toBe(false)
  })
})
