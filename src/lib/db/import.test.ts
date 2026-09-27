import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/types'
import { parseJournalFile } from './import'

describe('parseJournalFile / sanitizeSettings', () => {
  it('preserva cloudSyncEnabled y lastCloudSyncAt en import JSON', () => {
    const raw = {
      version: 2,
      settings: {
        ...DEFAULT_SETTINGS,
        cloudSyncEnabled: true,
        lastCloudSyncAt: '2026-01-01T00:00:00.000Z',
      },
      accounts: [],
    }
    const parsed = parseJournalFile(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.settings.cloudSyncEnabled).toBe(true)
    expect(parsed.data.settings.lastCloudSyncAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
