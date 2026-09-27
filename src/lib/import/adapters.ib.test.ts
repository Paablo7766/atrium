import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CSVImportEngine } from './engine'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')

describe('Interactive Brokers adapter', () => {
  it('importa Activity CSV y agrupa un round-trip cerrado', () => {
    const csv = readFileSync(join(fixtureDir, 'ib-activity.csv'), 'utf8')
    const { broker, trades, executions, errors } = new CSVImportEngine().importAndGroup(csv, 'AUTO')
    expect(errors).toHaveLength(0)
    expect(broker).toBe('INTERACTIVE_BROKERS')
    expect(executions.length).toBeGreaterThanOrEqual(2)
    expect(trades.length).toBe(1)
    expect(trades[0]).toMatchObject({ ticker: 'AAPL', status: 'CLOSED', quantityClosed: 100 })
  })
})
