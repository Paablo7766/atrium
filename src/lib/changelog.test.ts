import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareSemver, formatReleaseDate, parseChangelog, unseenReleases } from './changelog'

const SAMPLE = `
# Novedades

## 1.2.0 — 2026-10-01

- Nueva analítica
- Atajos de teclado

## 1.1.0 — 2026-09-26

- Envío de sugerencias

## 1.0.0 — 2026-09-20

- Primera versión pública del diario
`

describe('parseChangelog', () => {
  it('parsea el CHANGELOG.md del repo', () => {
    const md = fs.readFileSync(path.join(import.meta.dirname, '../../CHANGELOG.md'), 'utf8')
    const releases = parseChangelog(md)
    expect(releases[0]).toMatchObject({ version: '1.1.0', date: '2026-09-26' })
    expect(releases[0]?.items.length).toBeGreaterThan(0)
  })

  it('lee versión, fecha y una línea por cambio', () => {
    expect(parseChangelog(SAMPLE)).toEqual([
      { version: '1.2.0', date: '2026-10-01', items: ['Nueva analítica', 'Atajos de teclado'] },
      { version: '1.1.0', date: '2026-09-26', items: ['Envío de sugerencias'] },
      { version: '1.0.0', date: '2026-09-20', items: ['Primera versión pública del diario'] },
    ])
  })
})

describe('unseenReleases', () => {
  const releases = parseChangelog(SAMPLE)

  it('sin lastSeen solo muestra la versión actual', () => {
    expect(unseenReleases(releases, null, '1.1.0').map((r) => r.version)).toEqual(['1.1.0'])
  })

  it('devuelve las versiones posteriores a la vista', () => {
    expect(unseenReleases(releases, '1.0.0', '1.2.0').map((r) => r.version)).toEqual(['1.2.0', '1.1.0'])
  })

  it('no muestra nada si ya vio la actual', () => {
    expect(unseenReleases(releases, '1.2.0', '1.2.0')).toEqual([])
  })
})

describe('compareSemver', () => {
  it('ordena semver de tres números', () => {
    expect(compareSemver('1.1.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })
})

describe('formatReleaseDate', () => {
  it('formatea la fecha en el idioma de la app', () => {
    expect(formatReleaseDate('2026-09-26', 'es')).toBe('26 de septiembre de 2026')
    expect(formatReleaseDate('2026-09-26', 'en')).toBe('26 September 2026')
  })
})
