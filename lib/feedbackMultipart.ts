/**
 * Minimal multipart/form-data parser for the dev feedback proxy (Node).
 * Supports fields `payload` (text) and optional `screenshot` (file).
 */

export type ParsedMultipartFeedback = {
  payload: string
  screenshot?: { data: Buffer; filename: string; contentType: string }
}

function parseContentTypeHeader(contentType: string): string | null {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  const boundary = m?.[1] ?? m?.[2]
  return boundary?.trim() || null
}

function headerValue(block: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
  const m = re.exec(block)
  return m?.[1]?.trim() ?? null
}

function fieldName(block: string): string | null {
  const m = /name="([^"]+)"/i.exec(block)
  return m?.[1] ?? null
}

function filenameFromDisposition(block: string): string | undefined {
  const m = /filename="([^"]*)"/i.exec(block)
  const name = m?.[1]?.trim()
  return name || undefined
}

export function parseMultipartFeedbackBody(
  body: Buffer,
  contentType: string,
): ParsedMultipartFeedback | { error: string } {
  const boundary = parseContentTypeHeader(contentType)
  if (!boundary) return { error: 'Missing multipart boundary' }

  const delimiter = Buffer.from(`--${boundary}`)
  const parts = splitBuffer(body, delimiter).slice(1, -1)

  let payload: string | undefined
  let screenshot: ParsedMultipartFeedback['screenshot']

  for (const part of parts) {
    const trimmed = stripLeadingCrLf(part)
    const sep = indexOfDoubleCrLf(trimmed)
    if (sep < 0) continue
    const headerBlock = trimmed.subarray(0, sep).toString('utf8')
    let content = trimmed.subarray(sep + 4)
    if (content.length >= 2 && content.subarray(-2).equals(Buffer.from('\r\n'))) {
      content = content.subarray(0, content.length - 2)
    }
    const name = fieldName(headerBlock)
    if (!name) continue
    if (name === 'payload') {
      payload = content.toString('utf8')
      continue
    }
    if (name === 'screenshot') {
      const ct = headerValue(headerBlock, 'Content-Type') ?? 'application/octet-stream'
      screenshot = {
        data: Buffer.from(content),
        filename: filenameFromDisposition(headerBlock) ?? 'screenshot.bin',
        contentType: ct.split(';')[0]?.trim() ?? 'application/octet-stream',
      }
    }
  }

  if (!payload) return { error: 'Missing payload field' }
  return { payload, screenshot }
}

function stripLeadingCrLf(buf: Buffer): Buffer {
  if (buf.length >= 2 && buf[0] === 0x0d && buf[1] === 0x0a) return buf.subarray(2)
  return buf
}

function indexOfDoubleCrLf(buf: Buffer): number {
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a && buf[i + 2] === 0x0d && buf[i + 3] === 0x0a) {
      return i
    }
  }
  return -1
}

function splitBuffer(buf: Buffer, sep: Buffer): Buffer[] {
  const out: Buffer[] = []
  let start = 0
  for (;;) {
    const idx = buf.indexOf(sep, start)
    if (idx === -1) {
      out.push(buf.subarray(start))
      break
    }
    out.push(buf.subarray(start, idx))
    start = idx + sep.length
  }
  return out
}
