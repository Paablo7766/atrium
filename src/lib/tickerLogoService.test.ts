import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fmpImageUrl } from './tickerAssets'
import {
  peekTickerLogo,
  peekTickerLogoState,
  resetTickerLogoCaches,
  resolveTickerLogo,
} from './tickerLogoService'

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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('resolveTickerLogo', () => {
  beforeEach(() => {
    mockLocalStorage()
    resetTickerLogoCaches()
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    resetTickerLogoCaches()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('usa el mapa local para futuros (NQ → QQQ, ES → SPY) sin llamar a FMP', async () => {
    const nq = await resolveTickerLogo('NQ')
    const es = await resolveTickerLogo('ES.cash')
    expect(nq).toEqual({ url: fmpImageUrl('QQQ'), status: 'ok', source: 'local' })
    expect(es).toEqual({ url: fmpImageUrl('SPY'), status: 'ok', source: 'local' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('pinta un equity al instante por CDN y no lee import.meta.env', async () => {
    const peeked = peekTickerLogoState('AAPL.US')
    expect(peeked).toEqual({
      url: fmpImageUrl('AAPL'),
      status: 'ok',
      source: 'cdn',
    })
    expect(peekTickerLogo('AAPL.US')).toBe(fmpImageUrl('AAPL'))
  })

  it('resuelve un equity vía /api/logo cuando el proxy responde', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, [{ symbol: 'AAPL', image: 'https://images.fmp.com/aapl.png' }]),
    )

    const result = await resolveTickerLogo('AAPL.US')
    expect(result).toEqual({
      url: 'https://images.fmp.com/aapl.png',
      status: 'ok',
      source: 'fmp',
    })
    expect(fetch).toHaveBeenCalledWith('/api/logo?symbol=AAPL')
  })

  it('si FMP no tiene perfil, cae al CDN público y no bloquea el logo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, []))

    const first = await resolveTickerLogo('ZZZZNOPE')
    expect(first).toEqual({
      url: fmpImageUrl('ZZZZNOPE'),
      status: 'ok',
      source: 'cdn',
    })
    expect(console.error).not.toHaveBeenCalled()

    const peeked = peekTickerLogo('ZZZZNOPE')
    expect(peeked).toBe(fmpImageUrl('ZZZZNOPE'))

    const second = await resolveTickerLogo('ZZZZNOPE')
    expect(second.status).toBe('ok')
    expect(second.url).toBe(fmpImageUrl('ZZZZNOPE'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('no cachea un 503 de credenciales como “sin logo”: usa el CDN', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(503, { error: 'FMP API key not configured' }),
    )

    const first = await resolveTickerLogo('MSFT')
    expect(first.status).toBe('ok')
    expect(first.source).toBe('cdn')
    expect(first.url).toBe(fmpImageUrl('MSFT'))
    expect(first.error).toMatch(/FMP API key/i)
    expect(console.error).toHaveBeenCalled()
    expect(peekTickerLogo('MSFT')).toBe(fmpImageUrl('MSFT'))

    resetTickerLogoCaches()
    const second = await resolveTickerLogo('MSFT')
    expect(second.source).toBe('cdn')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('un 401 de credenciales no borra el logo: cae al CDN', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { error: 'FMP credentials rejected' }))

    const result = await resolveTickerLogo('TSLA')
    expect(result.status).toBe('ok')
    expect(result.source).toBe('cdn')
    expect(result.url).toBe(fmpImageUrl('TSLA'))
    expect(result.error).toMatch(/credential|API key|rejected/i)
    expect(console.error).toHaveBeenCalled()
    expect(peekTickerLogo('TSLA')).toBe(fmpImageUrl('TSLA'))
  })

  it('loguea un Error Message de FMP (key inválida) y enseña el CDN', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { 'Error Message': 'Invalid API KEY. Please retry.' }),
    )

    const result = await resolveTickerLogo('NVDA')
    expect(result.status).toBe('ok')
    expect(result.source).toBe('cdn')
    expect(result.url).toBe(fmpImageUrl('NVDA'))
    expect(result.error).toMatch(/Invalid API KEY/)
    expect(console.error).toHaveBeenCalled()
  })

  it('loguea un fallo de red, enseña el CDN y reintenta el proxy después de reset', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const first = await resolveTickerLogo('AMZN')
    expect(first.status).toBe('ok')
    expect(first.source).toBe('cdn')
    expect(first.url).toBe(fmpImageUrl('AMZN'))
    expect(console.error).toHaveBeenCalled()

    resetTickerLogoCaches()
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, [{ symbol: 'AMZN', image: 'https://images.fmp.com/amzn.png' }]),
    )
    const retry = await resolveTickerLogo('AMZN')
    expect(retry.status).toBe('ok')
    expect(retry.url).toBe('https://images.fmp.com/amzn.png')
  })

  it('devuelve un badge local para FX sin fetch', async () => {
    const fx = await resolveTickerLogo('EURUSD')
    expect(fx.status).toBe('ok')
    expect(fx.source).toBe('local')
    expect(fx.url).toBeNull()
    expect(fx.badge?.label).toBe('€')
    expect(fetch).not.toHaveBeenCalled()
  })
})
