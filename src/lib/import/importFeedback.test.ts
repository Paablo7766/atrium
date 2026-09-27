import { describe, expect, it } from 'vitest'
import { buildDuplicatesFeedback, buildZeroTradesFeedback, formatDetectedHeaders } from './importFeedback'

describe('importFeedback', () => {
  it('formatea cabeceras truncadas', () => {
    expect(formatDetectedHeaders(['A', 'B', 'C'], 2)).toBe('A, B… (+1)')
  })

  it('zero trades incluye hint y columnas', () => {
    const { title, lines } = buildZeroTradesFeedback({
      locale: 'es',
      broker: 'XTB',
      dataRowCount: 5,
      warnings: ['5 fila(s) omitidas por datos incompletos o no parseables.'],
      headers: ['Symbol', 'Type', 'Volume'],
    })
    expect(title).toMatch(/0 operaciones/)
    expect(title).toMatch(/XTB/)
    expect(lines.some((l) => l.includes('Columnas detectadas'))).toBe(true)
  })

  it('duplicados distingue de parseo vacío', () => {
    const { title, lines } = buildDuplicatesFeedback(3, 'en')
    expect(title).toMatch(/3 trades/)
    expect(lines[0]).toMatch(/Not a format error/)
  })
})
