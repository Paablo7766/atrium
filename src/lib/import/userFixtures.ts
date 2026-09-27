import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CSVImportEngine } from './engine'
import { fileToCsvTexts } from './spreadsheet'

const USER_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'user')
const SAMPLE_EXT = /\.(csv|txt|xlsx|xls|xlsm)$/i

export interface UserFixtureRun {
  fileName: string
  broker: string
  dataRowCount: number
  trades: number
  executions: number
  readyTrades: number
  skippedRows: number
  errorCount: number
  warningCount: number
  headerPreview: string[]
}

/** Lista archivos en __fixtures__/user (solo local, gitignored). */
export function listUserFixtureFiles(): string[] {
  try {
    return readdirSync(USER_FIXTURE_DIR)
      .filter((name) => SAMPLE_EXT.test(name) && !name.startsWith('.'))
      .sort()
  } catch {
    return []
  }
}

async function readUserFixture(name: string): Promise<string | string[]> {
  const path = join(USER_FIXTURE_DIR, name)
  const st = statSync(path)
  if (!st.isFile()) throw new Error(`not a file: ${name}`)
  if (/\.(xlsx|xls|xlsm)$/i.test(name)) {
    const buf = readFileSync(path)
    const blob = new Blob([buf])
    const file = new File([blob], name)
    return fileToCsvTexts(file)
  }
  const text = readFileSync(path, 'utf8')
  return text
}

/** Ejecuta AUTO import sobre cada sample de user/ (para tests locales). */
type ImportGroupResult = ReturnType<CSVImportEngine['importAndGroup']>

export async function runUserFixtures(
  importAndGroup: (content: string | string[]) => ImportGroupResult,
): Promise<UserFixtureRun[]> {
  const names = listUserFixtureFiles()
  const out: UserFixtureRun[] = []
  for (const fileName of names) {
    const content = await readUserFixture(fileName)
    const result = importAndGroup(content)
    out.push({
      fileName,
      broker: result.broker,
      dataRowCount: result.dataRowCount,
      trades: result.trades.length,
      executions: result.executions.length,
      readyTrades: result.readyTrades.length,
      skippedRows: result.skippedRows,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      headerPreview: result.detectedHeaders.slice(0, 8),
    })
  }
  return out
}
