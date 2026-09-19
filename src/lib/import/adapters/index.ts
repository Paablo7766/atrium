import type { BrokerAdapter, BrokerParseContext, NormalizedExecution } from '../types'
import {
  inferInstrumentType,
  isBlank,
  parseBrokerDate,
  parseLocaleNumber,
  parseSide,
  pickField,
  splitFxPair,
  normalizeHeader,
} from '../parse'

function currenciesFromTicker(
  ticker: string,
  ctx: BrokerParseContext,
): { base: string; quote: string } {
  const fx = splitFxPair(ticker)
  if (fx) return fx
  return {
    base: (ctx.defaultBaseCurrency ?? 'USD').toUpperCase(),
    quote: (ctx.defaultQuoteCurrency ?? 'USD').toUpperCase(),
  }
}

function baseExecution(
  partial: Omit<NormalizedExecution, 'baseCurrency' | 'quoteCurrency' | 'instrumentType' | 'multiplier' | 'fees'> & {
    fees?: number
    multiplier?: number
    instrumentType?: NormalizedExecution['instrumentType']
    baseCurrency?: string
    quoteCurrency?: string
  },
  ctx: BrokerParseContext,
): NormalizedExecution {
  const ccy = currenciesFromTicker(partial.ticker, ctx)
  return {
    ...partial,
    fees: partial.fees ?? 0,
    multiplier: partial.multiplier && partial.multiplier > 0 ? partial.multiplier : 1,
    instrumentType: partial.instrumentType ?? ctx.defaultInstrumentType ?? inferInstrumentType(partial.ticker),
    baseCurrency: (partial.baseCurrency ?? ccy.base).toUpperCase(),
    quoteCurrency: (partial.quoteCurrency ?? ccy.quote).toUpperCase(),
  }
}

function headerHas(headers: string[], needles: string[]): boolean {
  const set = new Set(headers.map(normalizeHeader))
  return needles.some((n) => set.has(normalizeHeader(n)))
}

/** XTB — Closed Positions (informe real xStation EN: Instrument/Ticker/…/(UTC)). */
export const xtbAdapter: BrokerAdapter = {
  id: 'XTB',
  matches(headers) {
    const hasTicker = headerHas(headers, ['Ticker', 'Symbol', 'Símbolo', 'Simbolo', 'Instrument'])
    const hasType = headerHas(headers, ['Type', 'Tipo', 'Side'])
    const hasVol = headerHas(headers, ['Volume', 'Volumen', 'Lots', 'Quantity'])
    const hasTime = headerHas(headers, [
      'Open Time (UTC)',
      'Close Time (UTC)',
      'Open Time',
      'Open time',
      'Close Time',
      'Close time',
      'Hora de apertura',
      'Hora de cierre',
      'Time',
      'Purchase Time',
    ])
    return hasTicker && (hasType || hasVol) && (hasVol || hasTime)
  },
  parse(rows, ctx) {
    const out: NormalizedExecution[] = []
    const dec = ctx.decimalSeparator ?? ','

    for (const row of rows) {
      // Preferir Ticker (DELL.US). No usar Instrument/Position si es un ID numérico de posición abierta.
      const tickerRaw = pickField(row, ['Ticker', 'Symbol', 'Símbolo', 'Simbolo'])
      const instrumentRaw = pickField(row, ['Instrument', 'Instrumento', 'Instrument/Position'])
      const ticker = (tickerRaw || (instrumentRaw && !/^\d+$/.test(instrumentRaw) ? instrumentRaw : undefined))?.toUpperCase()
      if (!ticker) continue

      const typeRaw = pickField(row, ['Type', 'Tipo', 'Transaction type', 'Side', 'Action', 'Dirección', 'Direccion'])
      let openSide = parseSide(typeRaw)
      if (!openSide && typeRaw) {
        const t = typeRaw.toLowerCase()
        if (t.includes('buy') || t.includes('compra') || t.includes('long')) openSide = 'BUY'
        else if (t.includes('sell') || t.includes('venta') || t.includes('short')) openSide = 'SELL'
      }
      // Filas resumen de Open Positions (Type vacío) → omitir
      if (!openSide) continue

      const qty = parseLocaleNumber(
        pickField(row, ['Volume', 'Volumen', 'Lots', 'Quantity', 'Size', 'Cantidad']),
        dec,
      )
      if (qty === null || qty === 0) continue

      const openAt = parseBrokerDate(
        pickField(row, [
          'Open Time (UTC)',
          'Open time (UTC)',
          'Open Time',
          'Open time',
          'Hora de apertura',
          'Time',
          'Purchase Time',
          'Date',
        ]),
        undefined,
        { dayFirst: true },
      )
      const closeAt = parseBrokerDate(
        pickField(row, ['Close Time (UTC)', 'Close time (UTC)', 'Close Time', 'Close time', 'Hora de cierre']),
        undefined,
        { dayFirst: true },
      )

      const openPrice = parseLocaleNumber(
        pickField(row, [
          'Open Price',
          'Open price',
          'Precio de apertura',
          'Avg. Price Open',
          'Price',
          'Rate',
        ]),
        dec,
      )
      const closePriceRaw = pickField(row, ['Close Price', 'Close price', 'Precio de cierre'])
      const closePrice =
        parseLocaleNumber(closePriceRaw, dec) ??
        (closeAt
          ? parseLocaleNumber(pickField(row, ['Market price', 'Market Price', 'Current price']), dec)
          : null)

      const commission =
        parseLocaleNumber(
          pickField(row, ['Commission', 'Commission EUR', 'Comisión', 'Comision', 'Fees', 'Open Commission']),
          dec,
        ) ?? 0
      const swap =
        parseLocaleNumber(pickField(row, ['Swap', 'Rollover', 'Storage']), dec) ?? 0
      const feesTotal = Math.abs(commission) + Math.abs(swap)

      // Solo P&L de posiciones CERRADAS (no Net Profit flotante de Open Positions)
      const reportedNetPnl =
        closeAt && closePrice != null
          ? parseLocaleNumber(
              pickField(row, ['Profit/Loss', 'Profit / Loss', 'Net Profit', 'Net P/L', 'Resultado']),
              dec,
            )
          : null

      const category = pickField(row, ['Category', 'Categoría', 'Categoria'])
      const instrumentType = ctx.defaultInstrumentType ?? inferInstrumentType(ticker, category ?? 'CFD')

      const positionId =
        pickField(row, ['Position ID', 'Position', 'Posición', 'Posicion', 'ID', 'Order', 'Ticket']) ??
        (instrumentRaw && /^\d+$/.test(instrumentRaw) ? instrumentRaw : undefined)
      const qtyAbs = Math.abs(qty)

      // Fila de posición cerrada XTB = open + close en la misma línea
      if (openPrice !== null && openPrice >= 0 && openAt) {
        out.push(
          baseExecution(
            {
              externalId: positionId ? `${positionId}-open` : undefined,
              broker: 'XTB',
              ticker,
              side: openSide,
              quantity: qtyAbs,
              price: openPrice,
              fees: closeAt && closePrice != null ? 0 : feesTotal,
              executedAt: openAt,
              instrumentType,
              raw: row,
            },
            ctx,
          ),
        )
      }

      if (closePrice !== null && closePrice >= 0 && closeAt) {
        const closeSide: 'BUY' | 'SELL' = openSide === 'BUY' ? 'SELL' : 'BUY'
        out.push(
          baseExecution(
            {
              externalId: positionId ? `${positionId}-close` : undefined,
              broker: 'XTB',
              ticker,
              side: closeSide,
              quantity: qtyAbs,
              price: closePrice,
              fees: feesTotal,
              executedAt: closeAt,
              instrumentType,
              ...(reportedNetPnl !== null ? { reportedNetPnl } : {}),
              raw: row,
            },
            ctx,
          ),
        )
      } else if (openPrice === null || !openAt) {
        const price = openPrice ?? closePrice
        const when = openAt ?? closeAt
        if (price === null || price < 0 || !when) continue
        out.push(
          baseExecution(
            {
              externalId: positionId,
              broker: 'XTB',
              ticker,
              side: openSide,
              quantity: qtyAbs,
              price,
              fees: feesTotal,
              executedAt: when,
              instrumentType,
              raw: row,
            },
            ctx,
          ),
        )
      }
    }
    return out
  },
}

/** Interactive Brokers — Activity / Trade Confirmation Flex CSV. */
export const interactiveBrokersAdapter: BrokerAdapter = {
  id: 'INTERACTIVE_BROKERS',
  matches(headers) {
    return (
      headerHas(headers, ['Symbol', 'Quantity', 'T. Price', 'TradePrice', 'Price']) &&
      (headerHas(headers, ['DateTime', 'Date/Time', 'TradeDate']) || headerHas(headers, ['IBCommission', 'Comm/Fee']))
    )
  },
  parse(rows, ctx) {
    const out: NormalizedExecution[] = []
    const dec = ctx.decimalSeparator ?? '.'
    for (const row of rows) {
      const assetCat = pickField(row, ['Asset Category', 'AssetCategory', 'AssetClass']) ?? ''
      if (/cash|interest|fee|dividend|withhold/i.test(assetCat) && !/stock|equity|forex|fwd|fut|opt/i.test(assetCat)) {
        continue
      }

      const ticker = pickField(row, ['Symbol', 'UnderlyingSymbol', 'Description'])?.toUpperCase()
      if (!ticker || isBlank(ticker)) continue

      const qtyRaw = parseLocaleNumber(pickField(row, ['Quantity', 'Qty', 'Shares']), dec)
      if (qtyRaw === null || qtyRaw === 0) continue

      const sideFromQty: 'BUY' | 'SELL' = qtyRaw > 0 ? 'BUY' : 'SELL'
      const side = parseSide(pickField(row, ['Buy/Sell', 'Side', 'Code', 'OrderType'])) ?? sideFromQty

      const price = parseLocaleNumber(pickField(row, ['T. Price', 'TradePrice', 'Price', 'Trade Price']), dec)
      if (price === null || price < 0) continue

      const dateTime = pickField(row, ['Date/Time', 'DateTime', 'TradeDateTime'])
      let executedAt: string | null = null
      if (dateTime?.includes(',')) {
        // IB: "20240315,09:30:00" o "2024-03-15, 09:30:00"
        const [d, t] = dateTime.split(',').map((x) => x.trim())
        if (/^\d{8}$/.test(d)) {
          executedAt = parseBrokerDate(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, t, { dayFirst: false })
        } else {
          executedAt = parseBrokerDate(d, t, { dayFirst: false })
        }
      } else {
        executedAt = parseBrokerDate(
          pickField(row, ['TradeDate', 'Date', 'Date/Time', 'DateTime']),
          pickField(row, ['TradeTime', 'Time']),
          { dayFirst: false },
        )
      }
      if (!executedAt) continue

      const fees = Math.abs(
        parseLocaleNumber(pickField(row, ['Comm/Fee', 'IBCommission', 'Commission', 'Fees']), dec) ?? 0,
      )
      const mult = parseLocaleNumber(pickField(row, ['Multiplier', 'ContractMultiplier']), dec) ?? 1
      const ccy = pickField(row, ['CurrencyPrimary', 'Currency', 'CurrencyPrimary']) ?? ctx.defaultQuoteCurrency ?? 'USD'

      out.push(
        baseExecution(
          {
            externalId: pickField(row, ['TradeID', 'ExecID', 'TransactionID', 'OrderID']),
            broker: 'INTERACTIVE_BROKERS',
            ticker,
            side,
            quantity: Math.abs(qtyRaw),
            price,
            fees,
            multiplier: mult > 0 ? mult : 1,
            quoteCurrency: ccy.toUpperCase(),
            baseCurrency: ccy.toUpperCase(),
            instrumentType: inferInstrumentType(ticker, assetCat),
            executedAt,
            raw: row,
          },
          ctx,
        ),
      )
    }
    return out
  },
}

/** DEGIRO — Account / Transactions CSV (decimal coma, DD-MM-YYYY). */
export const degiroAdapter: BrokerAdapter = {
  id: 'DEGIRO',
  matches(headers) {
    return (
      headerHas(headers, ['Product', 'ISIN', 'Quantity', 'Price']) &&
      (headerHas(headers, ['Order Id', 'OrderID', 'Reference']) || headerHas(headers, ['Venue', 'Exchange rate']))
    )
  },
  parse(rows, ctx) {
    const out: NormalizedExecution[] = []
    const dec = ctx.decimalSeparator ?? ','
    for (const row of rows) {
      const product = pickField(row, ['Product', 'Nombre', 'Name', 'Description'])
      const isin = pickField(row, ['ISIN'])
      const ticker = (product ?? isin)?.toUpperCase()
      if (!ticker) continue

      const qty = parseLocaleNumber(pickField(row, ['Quantity', 'Cantidad', 'Aantal', 'Anzahl']), dec)
      if (qty === null || qty === 0) continue

      const side: 'BUY' | 'SELL' = qty > 0 ? 'BUY' : 'SELL'
      const price = parseLocaleNumber(pickField(row, ['Price', 'Precio', 'Koers', 'Kurs']), dec)
      if (price === null || price < 0) continue

      const executedAt = parseBrokerDate(
        pickField(row, ['Date', 'Fecha', 'Datum', 'Date UTC']),
        pickField(row, ['Time', 'Hora', 'Tijd', 'Time UTC']),
        { dayFirst: true },
      )
      if (!executedAt) continue

      const fees = Math.abs(
        parseLocaleNumber(
          pickField(row, [
            'Transaction and/or third',
            'Transaction costs',
            'Costs',
            'Autres',
            'Comisión',
            'Fees',
          ]),
          dec,
        ) ?? 0,
      )
      const quote =
        pickField(row, ['Local value currency', 'Currency', 'Value currency']) ??
        ctx.defaultQuoteCurrency ??
        'EUR'

      out.push(
        baseExecution(
          {
            externalId: pickField(row, ['Order Id', 'OrderID', 'ID', 'Reference']),
            broker: 'DEGIRO',
            ticker: product?.toUpperCase() ?? ticker,
            side,
            quantity: Math.abs(qty),
            price,
            fees,
            quoteCurrency: quote.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'EUR',
            baseCurrency: 'EUR',
            instrumentType: 'STOCK',
            executedAt,
            raw: row,
          },
          ctx,
        ),
      )
    }
    return out
  },
}

/** Fomo — esqueleto (export tip. crypto/CFD). Ajustar columnas cuando tengas un sample real. */
export const fomoAdapter: BrokerAdapter = {
  id: 'FOMO',
  matches(headers) {
    return headerHas(headers, ['Pair', 'Market', 'Symbol']) && headerHas(headers, ['Side', 'Amount', 'Price'])
  },
  parse(rows, ctx) {
    const out: NormalizedExecution[] = []
    for (const row of rows) {
      const ticker = pickField(row, ['Pair', 'Market', 'Symbol', 'Ticker'])?.toUpperCase()
      if (!ticker) continue
      const side = parseSide(pickField(row, ['Side', 'Type', 'Direction']))
      const qty = parseLocaleNumber(pickField(row, ['Amount', 'Quantity', 'Size', 'Qty']), ctx.decimalSeparator)
      const price = parseLocaleNumber(pickField(row, ['Price', 'Avg Price', 'Fill Price']), ctx.decimalSeparator)
      if (!side || qty === null || qty === 0 || price === null) continue
      const executedAt = parseBrokerDate(
        pickField(row, ['Time', 'Date', 'Timestamp', 'Filled At']),
        undefined,
        { dayFirst: true },
      )
      if (!executedAt) continue
      const fees = Math.abs(parseLocaleNumber(pickField(row, ['Fee', 'Fees', 'Commission']), ctx.decimalSeparator) ?? 0)
      out.push(
        baseExecution(
          {
            externalId: pickField(row, ['Trade Id', 'Id', 'Order Id']),
            broker: 'FOMO',
            ticker,
            side,
            quantity: Math.abs(qty),
            price,
            fees,
            instrumentType: 'CRYPTO',
            executedAt,
            raw: row,
          },
          ctx,
        ),
      )
    }
    return out
  },
}

/** Axiom — esqueleto. Mapear columnas reales del export cuando estén disponibles. */
export const axiomAdapter: BrokerAdapter = {
  id: 'AXIOM',
  matches(headers) {
    return headerHas(headers, ['Instrument', 'Symbol']) && headerHas(headers, ['Buy/Sell', 'Side', 'Action'])
  },
  parse(rows, ctx) {
    const out: NormalizedExecution[] = []
    for (const row of rows) {
      const ticker = pickField(row, ['Instrument', 'Symbol', 'Ticker'])?.toUpperCase()
      if (!ticker) continue
      const side = parseSide(pickField(row, ['Buy/Sell', 'Side', 'Action', 'Type']))
      const qty = parseLocaleNumber(pickField(row, ['Quantity', 'Volume', 'Lots', 'Size']), ctx.decimalSeparator)
      const price = parseLocaleNumber(pickField(row, ['Price', 'Fill Price', 'Avg Price']), ctx.decimalSeparator)
      if (!side || qty === null || qty === 0 || price === null) continue
      const executedAt = parseBrokerDate(
        pickField(row, ['Date', 'DateTime', 'Execution Time', 'Time']),
        pickField(row, ['Time']),
        { dayFirst: true },
      )
      if (!executedAt) continue
      const fees = Math.abs(parseLocaleNumber(pickField(row, ['Commission', 'Fees', 'Fee']), ctx.decimalSeparator) ?? 0)
      out.push(
        baseExecution(
          {
            externalId: pickField(row, ['Order Id', 'Execution Id', 'Id']),
            broker: 'AXIOM',
            ticker,
            side,
            quantity: Math.abs(qty),
            price,
            fees,
            instrumentType: ctx.defaultInstrumentType ?? 'CFD',
            executedAt,
            raw: row,
          },
          ctx,
        ),
      )
    }
    return out
  },
}

export const BROKER_ADAPTERS: BrokerAdapter[] = [
  xtbAdapter,
  interactiveBrokersAdapter,
  degiroAdapter,
  fomoAdapter,
  axiomAdapter,
]

export function getAdapter(broker: string): BrokerAdapter | undefined {
  const key = broker.trim().toUpperCase().replace(/[\s-]+/g, '_')
  const aliases: Record<string, string> = {
    XTB: 'XTB',
    IB: 'INTERACTIVE_BROKERS',
    IBKR: 'INTERACTIVE_BROKERS',
    INTERACTIVE_BROKERS: 'INTERACTIVE_BROKERS',
    INTERACTIVEBROKERS: 'INTERACTIVE_BROKERS',
    DEGIRO: 'DEGIRO',
    FOMO: 'FOMO',
    AXIOM: 'AXIOM',
  }
  const id = aliases[key] ?? key
  return BROKER_ADAPTERS.find((a) => a.id === id)
}

export function detectBroker(headers: string[]): BrokerAdapter | undefined {
  return BROKER_ADAPTERS.find((a) => a.matches(headers))
}
