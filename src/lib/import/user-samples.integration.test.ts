import { describe, expect, it } from 'vitest'
import { CSVImportEngine } from './engine'
import { listUserFixtureFiles, runUserFixtures } from './userFixtures'

const hasUserSamples = listUserFixtureFiles().length > 0

describe.skipIf(!hasUserSamples)('user broker samples (__fixtures__/user)', () => {
  it('AUTO importa cada archivo sin lanzar excepción', async () => {
    const engine = new CSVImportEngine()
    const runs = await runUserFixtures((content) => engine.importAndGroup(content, 'AUTO'))
    expect(runs.length).toBeGreaterThan(0)
    for (const run of runs) {
      expect(run.dataRowCount).toBeGreaterThanOrEqual(0)
      console.info('[user-fixture]', run)
      if (run.broker === 'OTHER' && run.dataRowCount > 0) {
        console.warn(
          `[user-fixture] ${run.fileName}: no se reconoció bróker (cabeceras: ${run.headerPreview.join(', ')})`,
        )
      }
    }
  })
})

describe('user fixtures folder', () => {
  it('documenta si hay samples locales', () => {
    const files = listUserFixtureFiles()
    if (!files.length) {
      expect(files).toEqual([])
      return
    }
    expect(files.every((f) => /\.(csv|txt|xlsx|xls|xlsm)$/i.test(f))).toBe(true)
  })
})
