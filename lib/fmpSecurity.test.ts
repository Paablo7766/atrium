import { afterEach, describe, expect, it } from 'vitest'
import { enforceRequestOrigin, fmpKey, getAllowedOrigins } from './fmpSecurity'

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

describe('getAllowedOrigins / enforceRequestOrigin', () => {
  const prevAllowed = process.env.ALLOWED_ORIGINS
  const prevVercel = process.env.VERCEL
  const prevVercelUrl = process.env.VERCEL_URL
  const prevProd = process.env.VERCEL_PROJECT_PRODUCTION_URL

  afterEach(() => {
    if (prevAllowed === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = prevAllowed
    if (prevVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = prevVercel
    if (prevVercelUrl === undefined) delete process.env.VERCEL_URL
    else process.env.VERCEL_URL = prevVercelUrl
    if (prevProd === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProd
  })

  it('usa ALLOWED_ORIGINS cuando está definido', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com, https://www.example.com/'
    expect(getAllowedOrigins()).toEqual(['https://app.example.com', 'https://www.example.com'])
  })

  it('en Vercel infiere el host del despliegue si ALLOWED_ORIGINS está vacío', () => {
    delete process.env.ALLOWED_ORIGINS
    process.env.VERCEL = '1'
    process.env.VERCEL_URL = 'my-app.vercel.app'
    expect(getAllowedOrigins()).toEqual(['https://my-app.vercel.app'])
  })

  it('devuelve 403 cuando el Origin no está en la allowlist', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com'
    const req = new Request('https://app.example.com/api/logo', {
      headers: { Origin: 'https://evil.example' },
    })
    const result = enforceRequestOrigin(req)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
      await expect(result.response.json()).resolves.toEqual({ error: 'Origin not allowed' })
    }
  })

  it('permite Origin en la allowlist', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com'
    const req = new Request('https://app.example.com/api/logo', {
      headers: { Origin: 'https://app.example.com' },
    })
    const result = enforceRequestOrigin(req)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
    }
  })
})
