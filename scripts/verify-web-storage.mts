/**
 * Verifica el flujo web: onboarding con contraseña → trade → F5 → persiste cifrado.
 * Uso: npm run dev:web  (en otra terminal) y luego:
 *   npx --yes tsx scripts/verify-web-storage.mts
 */
import { chromium } from 'playwright'

const BASE = process.env.ATRIUM_WEB_URL ?? 'http://localhost:5179'
const PASSWORD = 'ClaveWebTest1'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(30000)

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.locator('button', { hasText: 'Configurar' }).click({ timeout: 15000 })

  await page.locator('input[placeholder="Alex Rivera"]').fill('Pablo Web')
  await page.locator('button', { hasText: 'Continuar' }).click()

  if (await page.locator('button', { hasText: 'Continuar' }).isEnabled()) {
    await page.locator('button', { hasText: 'Continuar' }).click()
  }

  await page.locator('button', { hasText: 'Continuar' }).click()

  await page.getByText('Contraseña maestra', { exact: true }).first().waitFor()
  const systemKey = page.getByText('Clave automática del sistema')
  if (await systemKey.count()) {
    throw new Error('La opción de clave automática del sistema no debería mostrarse en web.')
  }
  const passwords = page.locator('input[type="password"]')
  await passwords.nth(0).fill(PASSWORD)
  await passwords.nth(1).fill(PASSWORD)
  await page.locator('button', { hasText: 'Continuar' }).click()

  await page.locator('button', { hasText: 'Entrar' }).click()
  await page.locator('[data-page="dashboard"]').waitFor({ timeout: 45000 })

  const skipTour = page.locator('button', { hasText: 'Saltar' })
  if (await skipTour.count()) await skipTour.click()

  await page.keyboard.press('Control+N')
  await page.getByPlaceholder('NQ, EURUSD, AAPL…').fill('EURUSD')
  await page.getByPlaceholder('150 o −45').fill('120')
  await page.getByRole('button', { name: 'Registrar', exact: true }).click()
  await page.waitForTimeout(800)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('#master-password, input[type="password"]').waitFor()
  await page.locator('#master-password, input[type="password"]').fill(PASSWORD)
  await page.locator('button', { hasText: 'Desbloquear' }).click()
  await page.locator('[data-page="dashboard"]').waitFor({ timeout: 30000 })
  const skip2 = page.locator('button', { hasText: 'Saltar' })
  if (await skip2.count()) await skip2.click()

  await page.locator('[data-page="trades"]').click()
  await page.waitForTimeout(400)
  const body = await page.locator('body').innerText()
  if (!body.includes('EURUSD')) {
    throw new Error('El trade EURUSD no persistió tras recargar.')
  }

  const dump = await page.evaluate(async () => {
    return await new Promise<string>((resolve, reject) => {
      const req = indexedDB.open('atrium-journal')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(db.objectStoreNames, 'readonly')
        const chunks: unknown[] = []
        let pending = db.objectStoreNames.length
        if (!pending) {
          resolve('[]')
          return
        }
        Array.from(db.objectStoreNames).forEach((name) => {
          const getAll = tx.objectStore(name).getAll()
          getAll.onsuccess = () => {
            chunks.push(getAll.result)
            pending -= 1
            if (pending === 0) resolve(JSON.stringify(chunks))
          }
        })
      }
    })
  })
  if (dump.includes('EURUSD') || dump.includes('Pablo Web')) {
    throw new Error('IndexedDB contiene texto en claro (EURUSD / Pablo Web).')
  }
  if (!dump.includes('ciphertext')) {
    throw new Error('IndexedDB no tiene blobs cifrados.')
  }

  const pages = ['dashboard', 'trades', 'analytics', 'calendar', 'journal', 'settings'] as const
  for (const id of pages) {
    await page.locator(`[data-page="${id}"]`).click()
    await page.waitForTimeout(250)
    const visible = await page.locator(`[data-page="${id}"]`).getAttribute('class')
    if (!visible) throw new Error(`No se pudo abrir ${id}`)
  }

  await page.locator('[data-page="settings"]').click()
  await page.getByText('Datos', { exact: false }).first().click().catch(() => undefined)
  const settingsText = await page.locator('body').innerText()
  if (settingsText.includes('Litestream') && settingsText.includes('Réplica activa')) {
    throw new Error('Litestream no debería estar activo en web.')
  }
  if (!/atrium-backup|copia cifrada|encrypted backup/i.test(settingsText) && !settingsText.includes('Exportar copia cifrada')) {
    // The data section might not be selected; click nav
    await page.locator('button, a, [role="button"]').filter({ hasText: 'Datos' }).first().click()
    await page.waitForTimeout(300)
  }
  const dataText = await page.locator('body').innerText()
  if (!dataText.includes('Exportar cifrado') && !dataText.includes('Export encrypted')) {
    throw new Error('Falta la exportación de copia cifrada en Ajustes.')
  }
  if (
    !dataText.includes('Elegir mi copia') &&
    !dataText.includes('Choose my backup') &&
    !dataText.includes('Restaurar desde carpeta') &&
    !dataText.includes('Restore from folder')
  ) {
    throw new Error('Falta la importación de copia en Ajustes (web/móvil).')
  }

  console.log('OK web storage: onboarding, persistencia cifrada, unlock, paridad de páginas.')
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
