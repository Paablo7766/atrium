import { describe, expect, it } from 'vitest'
import {
  fmpImageUrl,
  localTickerAsset,
  localTickerBadge,
  localTickerLogo,
} from './tickerAssets'

describe('localTickerAsset', () => {
  it('mapea futuros de índice a logos ETF (nunca al equity que colisiona)', () => {
    expect(localTickerLogo('NQ')).toBe(fmpImageUrl('QQQ'))
    expect(localTickerLogo('MNQ')).toBe(fmpImageUrl('QQQ'))
    expect(localTickerLogo('ES')).toBe(fmpImageUrl('SPY'))
    expect(localTickerLogo('ES.cash')).toBe(fmpImageUrl('SPY'))
    expect(localTickerLogo('MES')).toBe(fmpImageUrl('SPY'))
    expect(localTickerLogo('YM')).toBe(fmpImageUrl('DIA'))
    expect(localTickerLogo('RTY')).toBe(fmpImageUrl('IWM'))
    expect(localTickerLogo('ES')).not.toBe(fmpImageUrl('ES'))
  })

  it('sigue usando el CDN de crypto (incl. USDC)', () => {
    const btc = localTickerLogo('BTCUSD')
    const btcC = localTickerLogo('BTCUSDC')
    expect(btc).toMatch(/cryptocurrency-icons.*btc\.png$/)
    expect(btcC).toBe(btc)
    expect(localTickerAsset('ETHUSDT')?.type).toBe('url')
  })

  it('deja el FX como badge inline, no como data URI', () => {
    expect(localTickerLogo('EURUSD')).toBeUndefined()
    expect(localTickerBadge('EURUSD')).toEqual({
      label: '€',
      bg: '#1a2744',
      fg: '#ffffff',
    })
  })

  it('usa un badge de metal para oro, no el logo del ETF GLD', () => {
    expect(localTickerLogo('XAUUSD')).toBeUndefined()
    expect(localTickerBadge('XAUUSD')).toEqual({
      label: 'Au',
      bg: '#8a6a12',
      fg: '#1a1408',
    })
  })

  it('no inventa un logo local para un equity', () => {
    expect(localTickerAsset('AAPL')).toBeUndefined()
    expect(localTickerAsset('NVDA.US')).toBeUndefined()
    expect(fmpImageUrl('AAPL.US')).toBe('https://financialmodelingprep.com/image-stock/AAPL.png')
  })
})
