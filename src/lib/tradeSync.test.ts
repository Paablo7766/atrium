import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/types'
import { computeJournalMutationAt, resolveSyncConflict } from '@/lib/tradeSync'

describe('tradeSync', () => {
  it('resuelve conflictos con última escritura gana', () => {
    const local = { version: 2 as const, settings: DEFAULT_SETTINGS, accounts: [] }
    const cloud = { version: 2 as const, settings: { ...DEFAULT_SETTINGS, traderName: 'Cloud' }, accounts: [] }
    expect(resolveSyncConflict(local, 100, cloud, 200).winner).toBe('cloud')
    expect(resolveSyncConflict(local, 300, cloud, 200).winner).toBe('local')
  })

  it('calcula timestamp de mutación desde trades', () => {
    const ts = '2026-01-15T12:00:00.000Z'
    const at = computeJournalMutationAt({
      version: 2,
      settings: DEFAULT_SETTINGS,
      accounts: [
        {
          id: 'a1',
          name: 'A',
          broker: '',
          type: 'live',
          color: 'green',
          currency: 'USD',
          startingBalance: 1000,
          riskPerTrade: 1,
          dailyLossLimit: 0,
          createdAt: ts,
          trades: [
            {
              id: 't1',
              symbol: 'ES',
              market: 'Futuros',
              direction: 'LONG',
              status: 'CLOSED',
              entryDate: ts,
              entryPrice: 1,
              quantity: 1,
              multiplier: 1,
              fees: 0,
              strategy: '',
              tags: [],
              notes: '',
              rating: 0,
              createdAt: ts,
              updatedAt: '2026-06-01T08:00:00.000Z',
            },
          ],
          notes: [],
          cashflows: [],
        },
      ],
    })
    expect(at).toBe(Date.parse('2026-06-01T08:00:00.000Z'))
  })
})
