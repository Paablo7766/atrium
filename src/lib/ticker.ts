/**
 * Strip broker/exchange suffixes so API lookups use a bare symbol.
 * Examples: AAPL.US → AAPL, #US500 → US500, BTCUSD.cash → BTCUSD
 */
export function cleanTicker(rawTicker: string): string {
  let t = rawTicker.trim().toUpperCase()
  if (!t) return ''

  t = t.replace(/^[#\$]+/, '')

  // Exchange / country suffixes used by XTB and similar brokers
  t = t.replace(
    /\.(US|UK|FR|DE|ES|IT|NL|BE|PT|PL|CH|AU|CA|JP|HK|CN|SE|NO|DK|FI|AT|IE|MX|BR|IN|KR|TW|SG|NZ|ZA|EU|CZ|HU|RO|GR|TR|LSE|NYSE|NASDAQ)$/i,
    '',
  )

  // CFD / cash / spot product tags
  t = t.replace(/[._-](CFD|CASH|SPOT|IDX|INDEX)$/i, '')
  t = t.replace(/(CFD|CASH|SPOT)$/i, '')

  // Trailing punctuation left by brokers
  t = t.replace(/[.\-_]+$/g, '')

  return t
}

/** Two-letter initials for the circular fallback glyph. */
export function tickerInitials(rawTicker: string): string {
  const clean = cleanTicker(rawTicker).replace(/[^A-Z0-9]/g, '')
  if (!clean) return '?'
  if (clean.length <= 2) return clean
  // Prefer letters: AAPL → AA, BTCUSD → BT, US500 → U5
  return clean.slice(0, 2)
}
