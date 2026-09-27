import { cleanTicker } from '@/lib/ticker'

const CRYPTO = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color'
const FMP_IMAGE = 'https://financialmodelingprep.com/image-stock'

export type TickerBadge = { label: string; bg: string; fg?: string }

export type LocalTickerAsset =
  | { type: 'url'; url: string }
  | { type: 'badge'; badge: TickerBadge }

/** Public FMP image CDN — no API key. Used for equities and ETF stand-ins. */
export function fmpImageUrl(symbol: string): string {
  const clean = cleanTicker(symbol)
  return `${FMP_IMAGE}/${clean}.png`
}

function img(symbol: string): LocalTickerAsset {
  return { type: 'url', url: fmpImageUrl(symbol) }
}

function crypto(file: string): LocalTickerAsset {
  return { type: 'url', url: `${CRYPTO}/${file}` }
}

function badge(label: string, bg: string, fg = '#ffffff'): LocalTickerAsset {
  return { type: 'badge', badge: { label, bg, fg } }
}

/**
 * Local logos for symbols that must not hit FMP as themselves
 * (futures roots collide with equities, e.g. ES = Eversource).
 * Crypto uses jsdelivr; indices/commodities use ETF/index stand-ins.
 */
export const LOCAL_TICKER_ASSETS: Record<string, LocalTickerAsset> = {
  // Crypto
  BTC: crypto('btc.png'),
  BTCUSD: crypto('btc.png'),
  BTCUSDT: crypto('btc.png'),
  BTCUSDC: crypto('btc.png'),
  XBTUSD: crypto('btc.png'),
  ETH: crypto('eth.png'),
  ETHUSD: crypto('eth.png'),
  ETHUSDT: crypto('eth.png'),
  ETHUSDC: crypto('eth.png'),
  SOL: crypto('sol.png'),
  SOLUSD: crypto('sol.png'),
  SOLUSDT: crypto('sol.png'),
  SOLUSDC: crypto('sol.png'),
  XRP: crypto('xrp.png'),
  XRPUSD: crypto('xrp.png'),
  ADA: crypto('ada.png'),
  ADAUSD: crypto('ada.png'),
  DOGE: crypto('doge.png'),
  DOGEUSD: crypto('doge.png'),
  AVAX: crypto('avax.png'),
  AVAXUSD: crypto('avax.png'),
  DOT: crypto('dot.png'),
  LINK: crypto('link.png'),
  LINKUSD: crypto('link.png'),
  LTC: crypto('ltc.png'),
  LTCUSD: crypto('ltc.png'),
  BNB: crypto('bnb.png'),
  BNBUSD: crypto('bnb.png'),
  MATIC: crypto('matic.png'),
  ATOM: crypto('atom.png'),
  UNI: crypto('uni.png'),

  // Equity index CFDs / futures → ETF or index logo (never the colliding equity ticker)
  US500: img('SPY'),
  SPX: img('SPY'),
  SPY: img('SPY'),
  ES: img('SPY'),
  MES: img('SPY'),

  US100: img('QQQ'),
  NAS100: img('QQQ'),
  NDX: img('QQQ'),
  NQ: img('QQQ'),
  MNQ: img('QQQ'),
  QQQ: img('QQQ'),

  US30: img('DIA'),
  DJI: img('DIA'),
  DJ30: img('DIA'),
  YM: img('DIA'),
  MYM: img('DIA'),

  GER40: img('DAX'),
  DE40: img('DAX'),
  DAX: img('DAX'),

  UK100: img('EWU'),
  FTSE: img('EWU'),

  FRA40: img('EWQ'),
  CAC40: img('EWQ'),
  CAC: img('EWQ'),

  EU50: img('FEZ'),
  STOXX50: img('FEZ'),

  JP225: img('EWJ'),
  NI225: img('EWJ'),
  NKD: img('EWJ'),

  RTY: img('IWM'),
  RUT: img('IWM'),
  US2000: img('IWM'),

  // Commodities — metal / energy marks (ETF issuer logos look wrong here)
  XAUUSD: badge('Au', '#8a6a12', '#1a1408'),
  GOLD: badge('Au', '#8a6a12', '#1a1408'),
  GC: badge('Au', '#8a6a12', '#1a1408'),
  XAGUSD: badge('Ag', '#6a7078', '#0e1014'),
  SILVER: badge('Ag', '#6a7078', '#0e1014'),
  SI: badge('Ag', '#6a7078', '#0e1014'),
  CL: badge('WTI', '#2a2010'),
  WTICOUSD: badge('WTI', '#2a2010'),
  USOIL: badge('WTI', '#2a2010'),
  BRENT: badge('BRT', '#2a2010'),
  UKOIL: badge('BRT', '#2a2010'),
  NG: badge('NG', '#1a3030'),
  NATGAS: badge('NG', '#1a3030'),

  // Majors FX — one mark, optically centered in the circle
  EURUSD: badge('€', '#1a2744'),
  GBPUSD: badge('£', '#1e2a1e'),
  USDJPY: badge('¥', '#2a1a30'),
  AUDUSD: badge('A$', '#1a2a2e'),
  USDCAD: badge('C$', '#1a2030'),
  USDCHF: badge('₣', '#1a2030'),
  NZDUSD: badge('N$', '#1a2a2e'),
  EURGBP: badge('€', '#1a2744'),
}

export function localTickerAsset(rawTicker: string): LocalTickerAsset | undefined {
  const clean = cleanTicker(rawTicker)
  if (!clean) return undefined
  return LOCAL_TICKER_ASSETS[clean]
}

/** URL-only local logos (crypto + index/commodity stand-ins). Badges are not URLs. */
export function localTickerLogo(rawTicker: string): string | undefined {
  const asset = localTickerAsset(rawTicker)
  return asset?.type === 'url' ? asset.url : undefined
}

export function localTickerBadge(rawTicker: string): TickerBadge | undefined {
  const asset = localTickerAsset(rawTicker)
  return asset?.type === 'badge' ? asset.badge : undefined
}
