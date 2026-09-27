import { describe, expect, it } from 'vitest'
import { parseChangelog } from './changelog'
import { displayHighlights, storiesForRelease } from './releaseStories'

describe('storiesForRelease', () => {
  it('devuelve copys de producto, no jerga interna', () => {
    const es = storiesForRelease('1.2.0-beta.1', 'es')
    expect(es.length).toBeGreaterThan(0)
    expect(es.every((s) => s.title && s.body)).toBe(true)
    expect(es.some((s) => /journal\.db|localStorage|API key|HMAC|crypto-meta/i.test(`${s.title} ${s.body}`))).toBe(
      false,
    )
    expect(es.some((s) => s.visual === 'unlock')).toBe(true)
  })

  it('tiene la misma cantidad de historias en es y en', () => {
    expect(storiesForRelease('1.2.0-beta.2', 'en')).toHaveLength(storiesForRelease('1.2.0-beta.2', 'es').length)
    expect(storiesForRelease('1.2.0-beta.1', 'en')).toHaveLength(storiesForRelease('1.2.0-beta.1', 'es').length)
    expect(storiesForRelease('1.1.0', 'en')).toHaveLength(storiesForRelease('1.1.0', 'es').length)
  })
})

describe('displayHighlights', () => {
  it('prioriza las historias curadas frente a las viñetas crudas', () => {
    const highlights = displayHighlights(
      { version: '1.2.0-beta.1', date: '2026-09-27', items: ['[Nuevo] internismo'] },
      'es',
    )
    expect(highlights[0]?.title).toMatch(/diario/i)
    expect(highlights[0]?.title).not.toMatch(/internismo/)
  })

  it('si no hay historia, usa el changelog', () => {
    const release = parseChangelog('## 9.9.9 — 2026-01-01\n\n- [Nuevo] Atajo de teclado\n')[0]
    expect(displayHighlights(release, 'es')).toEqual([{ kind: 'new', title: 'Atajo de teclado', body: '' }])
  })
})
