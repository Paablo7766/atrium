import { describe, expect, it, beforeEach, vi } from 'vitest'
import { markAppVersionSeen, readLastSeenAppVersion, resolveLastSeenAppVersion } from './whatsNewSeen'

function mockLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  })
}

describe('resolveLastSeenAppVersion', () => {
  beforeEach(() => {
    mockLocalStorage()
    localStorage.clear()
  })

  it('usa la base de datos si no hay entrada en localStorage', () => {
    expect(resolveLastSeenAppVersion('1.1.2')).toBe('1.1.2')
  })

  it('usa localStorage si la base de datos no tiene valor', () => {
    markAppVersionSeen('1.1.1')
    expect(resolveLastSeenAppVersion(undefined)).toBe('1.1.1')
  })

  it('elige la versión vista más antigua cuando difieren', () => {
    markAppVersionSeen('1.1.3')
    expect(resolveLastSeenAppVersion('1.1.2')).toBe('1.1.2')
  })
})

describe('readLastSeenAppVersion', () => {
  beforeEach(() => {
    mockLocalStorage()
    localStorage.clear()
  })

  it('ignora cadenas vacías', () => {
    localStorage.setItem('atrium.lastSeenAppVersion', '   ')
    expect(readLastSeenAppVersion()).toBeNull()
  })
})
