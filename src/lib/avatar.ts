const SIZE = 320
const QUALITY = 0.88
const MAX_INPUT = 8 * 1024 * 1024
const MAX_DATA_URL = 380_000

export function isAvatarDataUrl(value: string) {
  return /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(value) && value.length <= MAX_DATA_URL
}

export function sanitizeAvatar(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  return isAvatarDataUrl(value) ? value : undefined
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    img.src = url
  })
}

export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Elige una imagen JPG, PNG o WEBP.')
  if (file.size > MAX_INPUT) throw new Error('La imagen pesa demasiado (máx. 8 MB).')
  const img = await loadImage(file)
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('La imagen no es válida.')
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen.')
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = (img.naturalWidth - side) / 2
  const sy = (img.naturalHeight - side) / 2
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
  const url = canvas.toDataURL('image/jpeg', QUALITY)
  if (!isAvatarDataUrl(url)) throw new Error('No se pudo comprimir la imagen. Prueba con otra.')
  return url
}
