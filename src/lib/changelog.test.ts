import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareSemver, formatReleaseDate, parseChangelog, parseChangelogItem, releaseHighlights, unseenReleases } from './changelog'

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

describe('parseChangelogItem', () => {
  it('lee el prefijo opcional y deja el texto limpio', () => {
    expect(parseChangelogItem('[Nuevo] Envío de sugerencias')).toEqual({ kind: 'new', text: 'Envío de sugerencias' })
    expect(parseChangelogItem('[Mejora] Calendario más limpio')).toEqual({ kind: 'improve', text: 'Calendario más limpio' })
    expect(parseChangelogItem('[Fix] Overlay del tour')).toEqual({ kind: 'fix', text: 'Overlay del tour' })
  })

  it('infiere el tipo por la primera palabra si no hay prefijo', () => {
    expect(parseChangelogItem('Nueva analítica').kind).toBe('new')
    expect(parseChangelogItem('Mejora del calendario').kind).toBe('improve')
    expect(parseChangelogItem('Primera versión pública del diario').kind).toBe('other')
  })
})

describe('releaseHighlights', () => {
  it('prioriza items etiquetados y si no hay, los dos primeros', () => {
    expect(releaseHighlights({ version: '1.0.0', date: null, items: ['Uno', 'Dos', 'Tres'] })).toEqual(['Uno', 'Dos'])
    expect(
      releaseHighlights({
        version: '1.0.0',
        date: null,
        items: ['Base', '[Mejora] Calendario', '[Nuevo] Feedback'],
      }),
    ).toEqual(['[Mejora] Calendario', '[Nuevo] Feedback'])
  })
})

describe('compareSemver', () => {
  it('ordena semver de tres números', () => {
    expect(compareSemver('1.1.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })

  it('trata el sufijo beta como anterior a la estable', () => {
    expect(compareSemver('1.2.0-beta.1', '1.2.0')).toBeLessThan(0)
    expect(compareSemver('1.2.0', '1.2.0-beta.1')).toBeGreaterThan(0)
    expect(compareSemver('1.2.0-beta.2', '1.2.0-beta.1')).toBeGreaterThan(0)
    expect(compareSemver('1.1.0', '1.2.0-beta.1')).toBeLessThan(0)
  })
})

describe('parseChangelog betas', () => {
  it('lee headings con sufijo pre-release', () => {
    expect(
      parseChangelog('## 1.2.0-beta.1 — 2026-10-02\n\n- [Nuevo] Canal beta\n'),
    ).toEqual([{ version: '1.2.0-beta.1', date: '2026-10-02', items: ['[Nuevo] Canal beta'] }])
  })
})

describe('formatReleaseDate', () => {
  it('formatea la fecha en el idioma de la app', () => {
    expect(formatReleaseDate('2026-09-26', 'es')).toBe('26 de septiembre de 2026')
    expect(formatReleaseDate('2026-09-26', 'en')).toBe('26 September 2026')
  })
})
