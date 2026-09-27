import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { peekTickerLogo, resetTickerLogoCaches, resolveTickerLogo } from './tickerLogoService'

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

  it('usa el mapa local para futuros que FMP no cubre (NQ / ES)', async () => {
    const nq = await resolveTickerLogo('NQ')
    const es = await resolveTickerLogo('ES.cash')
    expect(nq.status).toBe('ok')
    expect(nq.source).toBe('local')
    expect(nq.url).toMatch(/^data:image\/svg\+xml/)
    expect(es.status).toBe('ok')
    expect(es.source).toBe('local')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('resuelve un equity vía /api/logo y no lee import.meta.env', async () => {
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

  it('cachea un miss real de FMP (array vacío) como unavailable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, []))

    const first = await resolveTickerLogo('ZZZZNOPE')
    expect(first.status).toBe('unavailable')
    expect(first.url).toBeNull()
    expect(console.error).not.toHaveBeenCalled()

    const peeked = peekTickerLogo('ZZZZNOPE')
    expect(peeked).toBeNull()

    const second = await resolveTickerLogo('ZZZZNOPE')
    expect(second.status).toBe('unavailable')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('no cachea un 503 de credenciales como “sin logo” y lo loguea', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(503, { error: 'FMP API key not configured' }),
    )

    const first = await resolveTickerLogo('MSFT')
    expect(first.status).toBe('error')
    expect(first.url).toBeNull()
    expect(first.error).toMatch(/FMP API key/i)
    expect(console.error).toHaveBeenCalled()
    expect(peekTickerLogo('MSFT')).toBeUndefined()

    resetTickerLogoCaches()
    const second = await resolveTickerLogo('MSFT')
    expect(second.status).toBe('error')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('no trata un 401 de credenciales como fallback local ni como miss persistido', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { error: 'FMP credentials rejected' }))

    const result = await resolveTickerLogo('TSLA')
    expect(result.status).toBe('error')
    expect(result.source).toBeNull()
    expect(result.url).toBeNull()
    expect(result.error).toMatch(/credential|API key|rejected/i)
    expect(console.error).toHaveBeenCalled()
    expect(peekTickerLogo('TSLA')).toBeUndefined()
  })

  it('loguea un Error Message de FMP (key inválida) sin persistirlo', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { 'Error Message': 'Invalid API KEY. Please retry.' }),
    )

    const result = await resolveTickerLogo('NVDA')
    expect(result.status).toBe('error')
    expect(result.url).toBeNull()
    expect(result.error).toMatch(/Invalid API KEY/)
    expect(console.error).toHaveBeenCalled()
    expect(peekTickerLogo('NVDA')).toBeUndefined()
  })

  it('loguea un fallo de red y reintenta después de reset', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const first = await resolveTickerLogo('AMZN')
    expect(first.status).toBe('error')
    expect(first.url).toBeNull()
    expect(console.error).toHaveBeenCalled()

    resetTickerLogoCaches()
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, [{ symbol: 'AMZN', image: 'https://images.fmp.com/amzn.png' }]),
    )
    const retry = await resolveTickerLogo('AMZN')
    expect(retry.status).toBe('ok')
    expect(retry.url).toBe('https://images.fmp.com/amzn.png')
  })
})
