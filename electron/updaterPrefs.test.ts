import { describe, expect, it } from 'vitest'
import { parseUpdaterPrefs, serializeUpdaterPrefs } from './updaterPrefs'

describe('parseUpdaterPrefs', () => {
  it('el canal estable es el valor por defecto', () => {
    expect(parseUpdaterPrefs(null)).toEqual({ allowPrerelease: false })
    expect(parseUpdaterPrefs({})).toEqual({ allowPrerelease: false })
    expect(parseUpdaterPrefs({ allowPrerelease: 'yes' })).toEqual({ allowPrerelease: false })
  })

  it('solo activa beta con un true explícito', () => {
    expect(parseUpdaterPrefs({ allowPrerelease: true })).toEqual({ allowPrerelease: true })
  })
})

describe('serializeUpdaterPrefs', () => {
  it('persiste solo el interruptor de canal', () => {
    expect(JSON.parse(serializeUpdaterPrefs({ allowPrerelease: true }))).toEqual({ allowPrerelease: true })
    expect(JSON.parse(serializeUpdaterPrefs({ allowPrerelease: false }))).toEqual({ allowPrerelease: false })
  })
})
