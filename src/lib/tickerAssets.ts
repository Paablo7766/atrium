import { cleanTicker } from '@/lib/ticker'

const CRYPTO = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color'

/** Compact SVG badge used for indices / commodities without a CDN logo. */
function badge(label: string, bg: string, fg = '#ffffff'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="32" fill="${bg}"/>
  <text x="32" y="38" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-size="18" font-weight="700" fill="${fg}">${label}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Fast local / CDN fallbacks for symbols FMP does not cover well
 * (crypto pairs, index CFDs, futures roots).
 */
export const LOCAL_TICKER_LOGOS: Record<string, string> = {
  // Crypto
  BTC: `${CRYPTO}/btc.png`,
  BTCUSD: `${CRYPTO}/btc.png`,
  BTCUSDT: `${CRYPTO}/btc.png`,
  XBTUSD: `${CRYPTO}/btc.png`,
  ETH: `${CRYPTO}/eth.png`,
  ETHUSD: `${CRYPTO}/eth.png`,
  ETHUSDT: `${CRYPTO}/eth.png`,
  SOL: `${CRYPTO}/sol.png`,
  SOLUSD: `${CRYPTO}/sol.png`,
  SOLUSDT: `${CRYPTO}/sol.png`,
  XRP: `${CRYPTO}/xrp.png`,
  XRPUSD: `${CRYPTO}/xrp.png`,
  ADA: `${CRYPTO}/ada.png`,
  ADAUSD: `${CRYPTO}/ada.png`,
  DOGE: `${CRYPTO}/doge.png`,
  DOGEUSD: `${CRYPTO}/doge.png`,
  AVAX: `${CRYPTO}/avax.png`,
  AVAXUSD: `${CRYPTO}/avax.png`,
  DOT: `${CRYPTO}/dot.png`,
  LINK: `${CRYPTO}/link.png`,
  LINKUSD: `${CRYPTO}/link.png`,
  LTC: `${CRYPTO}/ltc.png`,
  LTCUSD: `${CRYPTO}/ltc.png`,
  BNB: `${CRYPTO}/bnb.png`,
  BNBUSD: `${CRYPTO}/bnb.png`,
  MATIC: `${CRYPTO}/matic.png`,
  ATOM: `${CRYPTO}/atom.png`,
  UNI: `${CRYPTO}/uni.png`,

  // Equity index CFDs / futures roots
  US500: badge('S&P', '#0d3b2e'),
  SPX: badge('S&P', '#0d3b2e'),
  SPY: badge('S&P', '#0d3b2e'),
  ES: badge('ES', '#0d3b2e'),
  MES: badge('MES', '#0d3b2e'),

  US100: badge('NDX', '#1a2744'),
  NAS100: badge('NDX', '#1a2744'),
  NDX: badge('NDX', '#1a2744'),
  NQ: badge('NQ', '#1a2744'),
  MNQ: badge('MNQ', '#1a2744'),
  QQQ: badge('QQQ', '#1a2744'),

  US30: badge('DJI', '#3b1d0d'),
  DJI: badge('DJI', '#3b1d0d'),
  DJ30: badge('DJI', '#3b1d0d'),
  YM: badge('YM', '#3b1d0d'),
  MYM: badge('MYM', '#3b1d0d'),

  GER40: badge('DAX', '#1a2030'),
  DE40: badge('DAX', '#1a2030'),
  DAX: badge('DAX', '#1a2030'),

  UK100: badge('FTSE', '#1e2a1e'),
  FTSE: badge('FTSE', '#1e2a1e'),

  FRA40: badge('CAC', '#1a2230'),
  CAC40: badge('CAC', '#1a2230'),
  CAC: badge('CAC', '#1a2230'),

  EU50: badge('EU50', '#1a2030'),
  STOXX50: badge('SX5E', '#1a2030'),

  JP225: badge('NK', '#2a1a30'),
  NI225: badge('NK', '#2a1a30'),
  NKD: badge('NK', '#2a1a30'),

  RTY: badge('RTY', '#1a2a2e'),
  RUT: badge('RUT', '#1a2a2e'),
  US2000: badge('RUT', '#1a2a2e'),

  // Commodities
  XAUUSD: badge('Au', '#8a6a12', '#1a1408'),
  GOLD: badge('Au', '#8a6a12', '#1a1408'),
  GC: badge('GC', '#8a6a12', '#1a1408'),
  XAGUSD: badge('Ag', '#6a7078', '#0e1014'),
  SILVER: badge('Ag', '#6a7078', '#0e1014'),
  SI: badge('SI', '#6a7078', '#0e1014'),
  CL: badge('CL', '#2a2010'),
  WTICOUSD: badge('WTI', '#2a2010'),
  USOIL: badge('WTI', '#2a2010'),
  BRENT: badge('BRT', '#2a2010'),
  UKOIL: badge('BRT', '#2a2010'),
  NG: badge('NG', '#1a3030'),
  NATGAS: badge('NG', '#1a3030'),

  // Majors FX — generic pair badges (no FMP equity profile)
  EURUSD: badge('€$', '#1a2744'),
  GBPUSD: badge('£$', '#1e2a1e'),
  USDJPY: badge('$¥', '#2a1a30'),
  AUDUSD: badge('A$', '#1a2a2e'),
  USDCAD: badge('$C', '#1a2030'),
  USDCHF: badge('$₣', '#1a2030'),
  NZDUSD: badge('N$', '#1a2a2e'),
  EURGBP: badge('€£', '#1a2744'),
}

/** Resolve a local/CDN logo URL for a raw or cleaned ticker, if any. */
export function localTickerLogo(rawTicker: string): string | undefined {
  const clean = cleanTicker(rawTicker)
  if (!clean) return undefined
  return LOCAL_TICKER_LOGOS[clean]
}
