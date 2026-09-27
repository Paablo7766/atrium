/** Near-white paper used as padding by FMP / similar CDNs. */
const WHITE_MIN = 248
const ALPHA_EMPTY = 20
const CORNER_TOL = 18
/** Skip trim when the mark already fills the frame (NVIDIA, crypto coins). */
const MIN_TRIM_RATIO = 0.18
const MAX_COVERAGE = 0.86
/** Tight square only — the circle’s safe inset lives in AssetLogo, not here. */
const OUTPUT_PAD = 0.06

/** Largest square inside a circle (side / diameter). Use this so square marks are not clipped. */
export const CIRCLE_SAFE_RATIO = 1 / Math.sqrt(2)

export type LogoBounds = { minX: number; minY: number; maxX: number; maxY: number }

function pixelAt(data: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
}

function isNearWhite(r: number, g: number, b: number, a: number): boolean {
  return a < ALPHA_EMPTY || (r >= WHITE_MIN && g >= WHITE_MIN && b >= WHITE_MIN)
}

function colorClose(
  a: { r: number; g: number; b: number; a: number },
  b: { r: number; g: number; b: number; a: number },
): boolean {
  if (a.a < ALPHA_EMPTY && b.a < ALPHA_EMPTY) return true
  if (a.a < ALPHA_EMPTY || b.a < ALPHA_EMPTY) return false
  return (
    Math.abs(a.r - b.r) <= CORNER_TOL &&
    Math.abs(a.g - b.g) <= CORNER_TOL &&
    Math.abs(a.b - b.b) <= CORNER_TOL
  )
}

/**
 * Only treat a uniform edge color as padding when 3+ corners agree.
 * Full-bleed marks (NVIDIA: white + green corners) are left untouched.
 */
export function paddingColorFromCorners(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { r: number; g: number; b: number; a: number } | null {
  if (width < 4 || height < 4) return null
  const insetX = Math.max(0, Math.floor(width * 0.02))
  const insetY = Math.max(0, Math.floor(height * 0.02))
  const corners = [
    pixelAt(data, width, insetX, insetY),
    pixelAt(data, width, width - 1 - insetX, insetY),
    pixelAt(data, width, insetX, height - 1 - insetY),
    pixelAt(data, width, width - 1 - insetX, height - 1 - insetY),
  ]
  for (const candidate of corners) {
    const matches = corners.filter((c) => colorClose(c, candidate)).length
    if (matches >= 3 && (candidate.a < ALPHA_EMPTY || isNearWhite(candidate.r, candidate.g, candidate.b, candidate.a))) {
      return candidate
    }
  }
  return null
}

function isPadding(
  r: number,
  g: number,
  b: number,
  a: number,
  pad: { r: number; g: number; b: number; a: number },
): boolean {
  if (a < ALPHA_EMPTY) return true
  if (isNearWhite(r, g, b, a) && isNearWhite(pad.r, pad.g, pad.b, pad.a)) return true
  return colorClose({ r, g, b, a }, pad)
}

export function foregroundBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): LogoBounds | null {
  const pad = paddingColorFromCorners(data, width, height)
  if (!pad) return null

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = pixelAt(data, width, x, y)
      if (isPadding(p.r, p.g, p.b, p.a, pad)) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) return null

  const contentW = maxX - minX + 1
  const contentH = maxY - minY + 1
  const coverage = (contentW * contentH) / (width * height)
  const trimX = (width - contentW) / width
  const trimY = (height - contentH) / height
  if (coverage > MAX_COVERAGE) return null
  if (Math.max(trimX, trimY) < MIN_TRIM_RATIO) return null

  return { minX, minY, maxX, maxY }
}

export function renderTrimmedLogo(
  source: CanvasImageSource,
  bounds: LogoBounds,
  srcW: number,
  srcH: number,
): string | null {
  const contentW = bounds.maxX - bounds.minX + 1
  const contentH = bounds.maxY - bounds.minY + 1
  const side = Math.max(contentW, contentH)
  const pad = Math.max(2, Math.round(side * OUTPUT_PAD))
  const out = side + pad * 2

  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out, out)
  const dx = Math.round((out - contentW) / 2)
  const dy = Math.round((out - contentH) / 2)
  ctx.drawImage(
    source,
    bounds.minX,
    bounds.minY,
    contentW,
    contentH,
    dx,
    dy,
    contentW,
    contentH,
  )
  void srcW
  void srcH
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

const cache = new Map<string, string | null>()

/** Test helper. */
export function resetTrimLogoCache() {
  cache.clear()
}

/**
 * Recenter a CDN logo that sits in a large white/transparent frame.
 * Returns null when the mark already fills the image or pixels cannot be read.
 */
export function trimLogoFromImage(img: HTMLImageElement, cacheKey: string): string | null {
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return hit

  const w = img.naturalWidth
  const h = img.naturalHeight
  if (w < 8 || h < 8) {
    cache.set(cacheKey, null)
    return null
  }

  const probe = document.createElement('canvas')
  probe.width = w
  probe.height = h
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    cache.set(cacheKey, null)
    return null
  }

  try {
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, w, h)
    const bounds = foregroundBounds(data, w, h)
    if (!bounds) {
      cache.set(cacheKey, null)
      return null
    }
    const url = renderTrimmedLogo(img, bounds, w, h)
    cache.set(cacheKey, url)
    return url
  } catch {
    cache.set(cacheKey, null)
    return null
  }
}

export function canTrimLogoUrl(url: string): boolean {
  return url.includes('financialmodelingprep.com') || url.includes('image-stock/')
}
