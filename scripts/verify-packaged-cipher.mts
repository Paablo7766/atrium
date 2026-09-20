/**
 * End-to-end check of the electron-builder unpacked app (not npm run dev).
 * Usage: npx tsx scripts/verify-packaged-cipher.mts
 */
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const UNPACKED = process.env.ATRIUM_UNPACKED
  ? path.resolve(process.env.ATRIUM_UNPACKED)
  : path.join(ROOT, 'release', 'win-unpacked')
const EXE = path.join(UNPACKED, 'Atrium.exe')
const SQLITE_HEADER = Buffer.from('SQLite format 3', 'utf8')
const TEST_PASSWORD = 'PackagedE2E-2026'
const TRADE_SYMBOL = 'E2EPACK'

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

function userDataDir(slug: string): string {
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), slug)
}

function inspectPackaging(): void {
  assert(fs.existsSync(EXE), `Missing packaged exe: ${EXE}`)

  const unpackedNode = path.join(
    UNPACKED,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3-multiple-ciphers',
  )
  const prebuild = path.join(unpackedNode, 'prebuilds', `${process.platform}-${process.arch}.node`)
  const rebuilt = path.join(unpackedNode, 'build', 'Release', 'better_sqlite3.node')
  assert(
    fs.existsSync(prebuild) || fs.existsSync(rebuilt),
    `Native .node missing from app.asar.unpacked. Looked in:\n  ${rebuilt}\n  ${prebuild}`,
  )
  console.log(`[pack] native addon unpacked: ${fs.existsSync(rebuilt) ? rebuilt : prebuild}`)

  const asarPath = path.join(UNPACKED, 'resources', 'app.asar')
  assert(fs.existsSync(asarPath), `Missing app.asar at ${asarPath}`)

  const litestream = path.join(UNPACKED, 'resources', 'litestream', 'win32', 'litestream.exe')
  if (fs.existsSync(litestream)) {
    console.log(`[pack] Litestream is outside asar (extraResources): ${litestream}`)
  } else {
    console.log('[pack] Litestream binary not present in this --dir build (optional extraResource)')
  }
}

async function launch(slug: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: EXE,
    args: [],
    env: {
      ...process.env,
      ATRIUM_USER_DATA: slug,
      ELECTRON_ENABLE_LOGGING: '1',
    },
  })
  app.on('console', (msg) => {
    const text = msg.text()
    if (/cipher|journal-db|native binding|MODULE_NOT_FOUND|better_sqlite/i.test(text)) {
      console.log(`[renderer:${msg.type()}] ${text}`)
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

async function clickContinue(page: Page, label: string) {
  await page.getByRole('button', { name: label }).click()
}

async function completeOnboarding(page: Page, mode: 'secure-storage' | 'password') {
  await page.getByRole('button', { name: 'Configurar' }).click()
  await page.locator('input[placeholder="Alex Rivera"]').fill('E2E Packaged')
  await clickContinue(page, 'Continuar')
  await clickContinue(page, 'Continuar')
  await clickContinue(page, 'Continuar')

  if (mode === 'password') {
    await page.getByText('Contraseña maestra', { exact: true }).click()
    const passwords = page.locator('input[type="password"]')
    await passwords.nth(0).fill(TEST_PASSWORD)
    await passwords.nth(1).fill(TEST_PASSWORD)
  } else {
    await page.getByText('Clave automática del sistema').click()
  }
  await clickContinue(page, 'Continuar')
  await page.getByText(/Libro en blanco|Blank book/).click()
  await clickContinue(page, 'Entrar')
  await page.waitForSelector('[data-page="dashboard"]', { timeout: 60_000 })
}

async function skipTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Saltar' })
  if (await skip.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await skip.click()
  }
  await page.keyboard.press('Escape')
}

async function createTestTrade(page: Page) {
  await page.locator('[data-tour="new-trade"]').first().click()
  await page.getByPlaceholder('NQ, EURUSD, AAPL…').fill(TRADE_SYMBOL)
  const longBtn = page.getByRole('button', { name: /Long|Compré/ }).first()
  if (await longBtn.isVisible().catch(() => false)) await longBtn.click()
  await page.getByPlaceholder(/150 o|150 or/).fill('125')
  await page.getByRole('button', { name: 'Registrar', exact: true }).click()
  await page.getByText(TRADE_SYMBOL).first().waitFor({ timeout: 15_000 })
}

async function unlockIfNeeded(page: Page) {
  const title = page.getByText('Introduce tu contraseña maestra')
  if (await title.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await page.locator('#master-password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Desbloquear' }).click()
  }
}

function assertEncryptedDb(slug: string) {
  const dbPath = path.join(userDataDir(slug), 'journal.db')
  assert(fs.existsSync(dbPath), `journal.db missing at ${dbPath}`)
  const header = fs.readFileSync(dbPath).subarray(0, SQLITE_HEADER.length)
  assert(!header.equals(SQLITE_HEADER), `journal.db is NOT encrypted (plain SQLite header) at ${dbPath}`)
  console.log(`[db] encrypted header ok (${header.length} bytes, not "SQLite format 3") → ${dbPath}`)
}

async function runMode(mode: 'secure-storage' | 'password') {
  const slug = `atrium-e2e-packaged-${mode}`
  const dataDir = userDataDir(slug)
  fs.rmSync(dataDir, { recursive: true, force: true })
  console.log(`\n=== ${mode} → ${dataDir} ===`)

  let app: ElectronApplication | undefined
  try {
    const first = await launch(slug)
    app = first.app
    await completeOnboarding(first.page, mode)
    await skipTour(first.page)
    await createTestTrade(first.page)
    await first.app.close()
    app = undefined

    assertEncryptedDb(slug)

    const second = await launch(slug)
    app = second.app
    await unlockIfNeeded(second.page)
    await second.page.waitForSelector('[data-page="dashboard"]', { timeout: 60_000 })
    await skipTour(second.page)
    await second.page.getByText(TRADE_SYMBOL).first().waitFor({ timeout: 15_000 })
    await second.app.close()
    app = undefined

    assertEncryptedDb(slug)
    console.log(`[ok] ${mode}: onboarding, trade persist after relaunch, DB encrypted`)
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

async function main() {
  inspectPackaging()
  await runMode('secure-storage')
  await runMode('password')
  console.log('\nPackaged E2E passed for both key modes.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
