import { describe, expect, it } from 'vitest'
import { CIRCLE_SAFE_RATIO, foregroundBounds, paddingColorFromCorners } from './trimLogo'

function rgba(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return data
}

describe('CIRCLE_SAFE_RATIO', () => {
  it('es el cuadrado inscrito (nada de las esquinas queda fuera del círculo)', () => {
    expect(CIRCLE_SAFE_RATIO).toBeCloseTo(1 / Math.sqrt(2), 8)
    const diameter = 22
    const side = diameter * CIRCLE_SAFE_RATIO
    const diagonal = side * Math.sqrt(2)
    expect(diagonal).toBeCloseTo(diameter, 8)
  })
})

describe('foregroundBounds', () => {
  it('recorta un símbolo pequeño sobre fondo blanco y lo deja centrable', () => {
    const w = 40
    const h = 40
    const data = rgba(w, h, (x, y) => {
      const inside = x >= 14 && x <= 20 && y >= 16 && y <= 24
      return inside ? [180, 0, 0, 255] : [255, 255, 255, 255]
    })
    const box = foregroundBounds(data, w, h)
    expect(box).toEqual({ minX: 14, minY: 16, maxX: 20, maxY: 24 })
  })

  it('no recorta un logo a sangre (esquinas de distinto color, tipo NVIDIA)', () => {
    const w = 32
    const h = 32
    const data = rgba(w, h, (x) => (x < 16 ? [255, 255, 255, 255] : [118, 185, 0, 255]))
    expect(paddingColorFromCorners(data, w, h)).toBeNull()
    expect(foregroundBounds(data, w, h)).toBeNull()
  })

  it('no recorta si el contenido ya llena el recuadro', () => {
    const w = 20
    const h = 20
    const data = rgba(w, h, (x, y) => {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      return edge ? [255, 255, 255, 255] : [20, 20, 20, 255]
    })
    expect(foregroundBounds(data, w, h)).toBeNull()
  })
})
