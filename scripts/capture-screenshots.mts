/**
 * Captures real UI screenshots for the README.
 * Usage: npx --yes tsx scripts/capture-screenshots.mts
 * Expects Vite web server on http://127.0.0.1:5179 (vite.web.mts).
 */
import { chromium, type Page } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateDemoTrades, generateDemoNotes } from '../src/lib/demo.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'assets')
const BASE = 'http://localhost:5179'
const VIEWPORT = { width: 1440, height: 900 }

const DEFAULT_ACCOUNT_ID = 'default'

function buildSeed() {
  const trades = generateDemoTrades(90, 120, 42)
  const notes = generateDemoNotes()
  const now = new Date().toISOString()
  const settings = {
    traderName: 'Pablo',
    tradeFormMode: 'premium' as const,
    activeAccountId: DEFAULT_ACCOUNT_ID,
    accountName: 'Cuenta principal',
    currency: 'USD',
    startingBalance: 25000,
    riskPerTrade: 1,
    dailyLossLimit: 0,
    defaultMarket: 'Futuros',
    preferredMarkets: ['Futuros', 'Forex', 'Acciones'],
    defaultFees: 4.2,
    weekStartsOn: 1 as const,
    onboardingCompleted: true,
    tutorialCompleted: true,
    playbook: [
      { id: 'pb1', name: 'ORB', checklist: ['Rango marcado', 'Volumen OK', 'Riesgo 1%'] },
      { id: 'pb2', name: 'Pullback', checklist: ['Tendencia clara', 'Retest', 'Confirmación'] },
    ],
    locale: 'es' as const,
    demoData: true,
  }
  const account = {
    id: DEFAULT_ACCOUNT_ID,
    name: settings.accountName,
    broker: 'XTB',
    type: 'live' as const,
    color: 'green' as const,
    currency: settings.currency,
    startingBalance: settings.startingBalance,
    riskPerTrade: settings.riskPerTrade,
    dailyLossLimit: settings.dailyLossLimit,
    createdAt: now,
    trades,
    notes,
    cashflows: [],
  }
  return {
    version: 2 as const,
    settings,
    accounts: [account],
    trades,
    notes,
  }
}

async function waitAppReady(page: Page) {
  await page.waitForSelector('[data-page="dashboard"]', { timeout: 60000 })
  await page.waitForTimeout(800)
}

async function goPage(page: Page, id: string) {
  await page.click(`[data-page="${id}"]`)
  await page.waitForTimeout(900)
}

async function shot(page: Page, name: string) {
  const file = path.join(OUT, name)
  await page.screenshot({ path: file, type: 'png' })
  console.log('saved', name)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const seed = buildSeed()

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()

  await context.addInitScript((data) => {
    localStorage.setItem('trading-journal:data', JSON.stringify(data))
    localStorage.setItem('atrium.page', 'dashboard')
    localStorage.setItem('atrium.sidebar', '0')
    localStorage.setItem('atrium.cal.dayPanel', '1')
  }, seed)

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
  await waitAppReady(page)

  await shot(page, 'dashboard.png')

  await goPage(page, 'trades')
  await shot(page, 'trades.png')

  await goPage(page, 'calendar')
  await shot(page, 'calendar.png')

  await goPage(page, 'analytics')
  await page.waitForTimeout(1400)
  await shot(page, 'analytics.png')

  await goPage(page, 'journal')
  await shot(page, 'journal.png')

  await goPage(page, 'settings')
  await page.waitForTimeout(700)
  const dataNav = page.locator('button').filter({ hasText: /Datos|Data/i }).first()
  if (await dataNav.count()) {
    await dataNav.click()
    await page.waitForTimeout(700)
  }
  const brokerBlock = page.getByText(/XTB|Interactive Brokers|DEGIRO|Auto/i).first()
  if (await brokerBlock.count()) {
    await brokerBlock.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
  } else {
    const importCsv = page.getByText(/Importar|Import/i).last()
    if (await importCsv.count()) await importCsv.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
  }
  await shot(page, 'import.png')

  await goPage(page, 'dashboard')
  await page.waitForTimeout(700)
  const shareWeek = page.locator('button').filter({ hasText: /Semana|Week/i }).first()
  if (await shareWeek.count()) {
    await shareWeek.click()
    await page.waitForTimeout(1400)
    await shot(page, 'share-card.png')
    await page.keyboard.press('Escape')
  } else {
    await writeFile(path.join(OUT, '.share-missing'), 'share button not found\n')
    await shot(page, 'share-card.png')
  }

  await browser.close()
  console.log('done →', OUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
