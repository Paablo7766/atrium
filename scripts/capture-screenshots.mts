/**
 * Captures the four README product shots.
 * Usage: start `npm run dev:web`, then `npm run shots`.
 */
import { chromium, type Page } from 'playwright'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'assets')
const BASE = 'http://localhost:5179'
const VIEWPORT = { width: 1440, height: 900 }
const APP_VERSION = '1.2.0-beta.3'
const README_SHOTS = ['dashboard.png', 'analytics.png', 'trades.png', 'calendar.png'] as const
const RETIRED_SHOTS = [
  'analytics-time.png',
  'analytics-risk.png',
  'analytics-process.png',
  'journal.png',
  'import.png',
  'share-card.png',
  '.share-missing',
]

const SEED_IN_PAGE = `
async (version) => {
  const started = Date.now()
  const [storeMod, i18nMod, demoMod] = await Promise.all([
    import('/src/store.ts'),
    import('/src/lib/i18n/index.ts'),
    import('/src/lib/demo.ts'),
  ])
  const store = storeMod.useStore
  while (!store.getState().loaded) {
    if (Date.now() - started > 20000) return { ok: false, error: 'store did not load' }
    await new Promise((r) => setTimeout(r, 50))
  }
  const STRATEGY_EN = {
    Breakout: 'Breakout',
    Pullback: 'Pullback',
    'Reversión a la media': 'Mean reversion',
    ORB: 'ORB',
    'Supply & Demand': 'Supply & Demand',
    Tendencia: 'Trend',
  }
  const TAG_EN = {
    'A+': 'A+',
    Apertura: 'Open',
    Noticias: 'News',
    'Contra tendencia': 'Counter-trend',
    'Sesión NY': 'NY session',
    'Sesión Londres': 'London session',
    Sobreoperado: 'Overtrading',
    'Plan seguido': 'Plan followed',
  }
  const EMOTION_EN = {
    Disciplinado: 'Disciplined',
    Ansioso: 'Anxious',
    FOMO: 'FOMO',
    Venganza: 'Revenge',
    Confianza: 'Confident',
    Frustración: 'Frustrated',
    Calma: 'Calm',
    Euforia: 'Euphoric',
  }
  const trades = demoMod.generateDemoTrades(90, 120, 42).map((trade) => ({
    ...trade,
    strategy: trade.strategy ? (STRATEGY_EN[trade.strategy] || trade.strategy) : trade.strategy,
    tags: (trade.tags || []).map((tag) => TAG_EN[tag] || tag),
    emotion: trade.emotion ? (EMOTION_EN[trade.emotion] || trade.emotion) : trade.emotion,
    notes: trade.notes === 'Posición abierta. Gestionar según plan.'
      ? 'Open position. Manage according to the plan.'
      : trade.notes,
  }))
  const now = new Date()
  const iso = now.toISOString()
  const day = (offset) => {
    const d = new Date(now)
    d.setDate(now.getDate() - offset)
    return d.toISOString().slice(0, 10)
  }
  const notes = [
    { id: 'n1', date: day(1), mood: 4, title: 'Clean session', content: 'Stuck to the plan. Three valid setups only. Rule for the week: no trades in the first five minutes.', updatedAt: iso },
    { id: 'n2', date: day(4), mood: 2, title: 'Afternoon tilt', content: 'Tried to win it back after two losses. New rule: platform off at -2R.', updatedAt: iso },
    { id: 'n3', date: day(8), mood: 5, title: 'Best week of the quarter', content: 'Pullback on NQ is paying. Size stayed constant. Review whether 1.25% risk is earned.', updatedAt: iso },
  ]
  const seed = {
    version: 2,
    settings: {
      traderName: 'Alex',
      tradeFormMode: 'premium',
      activeAccountId: 'default',
      accountName: 'Live account',
      currency: 'USD',
      startingBalance: 25000,
      riskPerTrade: 1,
      dailyLossLimit: 0,
      defaultMarket: 'Futuros',
      preferredMarkets: ['Futuros', 'Forex', 'Acciones'],
      defaultFees: 4.2,
      weekStartsOn: 1,
      onboardingCompleted: true,
      tutorialCompleted: true,
      playbook: [
        { id: 'pb1', name: 'ORB', checklist: ['Range marked', 'Volume OK', '1% risk'] },
        { id: 'pb2', name: 'Pullback', checklist: ['Clear trend', 'Retest', 'Confirmation'] },
      ],
      locale: 'en',
      demoData: false,
      lastSeenAppVersion: version,
    },
    accounts: [{
      id: 'default',
      name: 'Live account',
      broker: 'XTB',
      type: 'live',
      color: 'green',
      currency: 'USD',
      startingBalance: 25000,
      riskPerTrade: 1,
      dailyLossLimit: 0,
      createdAt: iso,
      trades,
      notes,
      cashflows: [],
    }],
    trades,
    notes,
  }
  const imported = store.getState().importData(seed, 'replace')
  if (!imported || imported.ok === false) {
    return { ok: false, error: imported && imported.error ? String(imported.error) : 'import failed' }
  }
  await i18nMod.ensureLocale('en')
  i18nMod.setAppLocale('en')
  store.getState().updateSettings({
    locale: 'en',
    onboardingCompleted: true,
    tutorialCompleted: true,
    demoData: false,
    lastSeenAppVersion: version,
    traderName: 'Alex',
    accountName: 'Live account',
  })
  return { ok: true }
}
`

async function seedApp(page: Page) {
  await page.waitForFunction('Boolean(document.querySelector("#root"))', { timeout: 60000 })
  const result = await page.evaluate(`(${SEED_IN_PAGE})(${JSON.stringify(APP_VERSION)})`)
  if (!result?.ok) throw new Error(`Could not seed Atrium: ${result && 'error' in result ? result.error : 'unknown'}`)
}

async function waitAppReady(page: Page) {
  await page.waitForSelector('[data-page="dashboard"]', { timeout: 60000 })
  await page.getByText('Sample data.').waitFor({ state: 'hidden', timeout: 2000 }).catch(() => undefined)
  await page.waitForTimeout(700)
}

async function goPage(page: Page, id: string) {
  await page.click(`[data-page="${id}"]`)
  await page.waitForTimeout(900)
}

async function shot(page: Page, name: (typeof README_SHOTS)[number]) {
  await page.locator('.recharts-surface').first().waitFor({ timeout: 8000 }).catch(() => undefined)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, name), type: 'png' })
  console.log('saved', name)
}

async function pickCalendarDay(page: Page) {
  const withPnl = page.locator('button[title*="$"]').first()
  if (await withPnl.count()) {
    await withPnl.click()
    await page.waitForTimeout(400)
  }
}

async function removeRetiredShots() {
  await Promise.all(
    RETIRED_SHOTS.map(async (name) => {
      try {
        await unlink(path.join(OUT, name))
        console.log('removed', name)
      } catch {
        /* already gone */
      }
    }),
  )
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  await context.addInitScript(`
    localStorage.setItem('atrium.page', 'dashboard')
    localStorage.setItem('atrium.sidebar', '0')
    localStorage.setItem('atrium.cal.dayPanel', '1')
    localStorage.setItem('atrium.lastSeenAppVersion', ${JSON.stringify(APP_VERSION)})
    localStorage.setItem('atrium.range', 'all')
  `)

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await seedApp(page)
  await waitAppReady(page)

  await shot(page, 'dashboard.png')

  await goPage(page, 'analytics')
  await page.waitForTimeout(1200)
  await shot(page, 'analytics.png')

  await goPage(page, 'trades')
  await shot(page, 'trades.png')

  await goPage(page, 'calendar')
  await pickCalendarDay(page)
  await shot(page, 'calendar.png')

  await browser.close()
  await removeRetiredShots()
  console.log('done →', OUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
