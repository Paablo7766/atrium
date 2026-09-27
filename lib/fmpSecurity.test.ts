import { afterEach, describe, expect, it } from 'vitest'
import { fmpKey } from './fmpSecurity'

describe('fmpKey', () => {
  const prevFmp = process.env.FMP_API_KEY
  const prevVite = process.env.VITE_FMP_API_KEY

  afterEach(() => {
    if (prevFmp === undefined) delete process.env.FMP_API_KEY
    else process.env.FMP_API_KEY = prevFmp
    if (prevVite === undefined) delete process.env.VITE_FMP_API_KEY
    else process.env.VITE_FMP_API_KEY = prevVite
  })

  it('lee FMP_API_KEY sin prefijo VITE_ (variable de Vercel)', () => {
    delete process.env.VITE_FMP_API_KEY
    process.env.FMP_API_KEY = 'server-only-key'
    expect(fmpKey()).toBe('server-only-key')
  })

  it('acepta VITE_FMP_API_KEY como fallback de desarrollo', () => {
    delete process.env.FMP_API_KEY
    process.env.VITE_FMP_API_KEY = 'vite-dev-key'
    expect(fmpKey()).toBe('vite-dev-key')
  })

  it('prefiere FMP_API_KEY cuando ambas existen', () => {
    process.env.FMP_API_KEY = 'server-key'
    process.env.VITE_FMP_API_KEY = 'vite-key'
    expect(fmpKey()).toBe('server-key')
  })
})
