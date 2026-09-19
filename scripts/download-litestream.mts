/**
 * Descarga los binarios oficiales de Litestream para empaquetarlos con Electron.
 * Uso: npm run download:litestream
 */
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { execFileSync } from 'node:child_process'

const VERSION = '0.5.17'
const TAG = `v${VERSION}`
const ROOT = path.join(import.meta.dirname, '..', 'electron', 'resources', 'litestream')

type Target = {
  dir: string
  asset: string
  binary: string
}

const TARGETS: Target[] = [
  { dir: 'win32', asset: `litestream-${VERSION}-windows-x86_64.zip`, binary: 'litestream.exe' },
  { dir: 'darwin-arm64', asset: `litestream-${VERSION}-darwin-arm64.tar.gz`, binary: 'litestream' },
  { dir: 'darwin-x64', asset: `litestream-${VERSION}-darwin-x86_64.tar.gz`, binary: 'litestream' },
  { dir: 'linux-x64', asset: `litestream-${VERSION}-linux-x86_64.tar.gz`, binary: 'litestream' },
  { dir: 'linux-arm64', asset: `litestream-${VERSION}-linux-arm64.tar.gz`, binary: 'litestream' },
]

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`)
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(dest))
}

function extract(archive: string, destDir: string, binary: string): void {
  fs.mkdirSync(destDir, { recursive: true })
  const out = path.join(destDir, binary)

  if (archive.endsWith('.zip')) {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${archive.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ])
    const extracted = path.join(destDir, 'litestream.exe')
    if (fs.existsSync(extracted) && extracted !== out) fs.renameSync(extracted, out)
    return
  }

  try {
    execFileSync('tar', ['-xzf', archive, '-C', destDir, binary], { stdio: 'inherit' })
  } catch {
    throw new Error('tar no disponible; ejecuta este script en macOS/Linux para extraer .tar.gz')
  }
}

async function main() {
  fs.mkdirSync(ROOT, { recursive: true })
  const tmp = path.join(ROOT, '.tmp')
  fs.mkdirSync(tmp, { recursive: true })

  const allPlatforms = process.env.LITESTREAM_ALL === '1'
  const targets = allPlatforms
    ? TARGETS
    : TARGETS.filter((t) => {
        if (process.platform === 'win32') return t.dir === 'win32'
        if (process.platform === 'darwin') return t.dir.startsWith('darwin')
        return t.dir.startsWith('linux')
      })

  const failures: string[] = []

  for (const target of targets) {
    const url = `https://github.com/benbjohnson/litestream/releases/download/${TAG}/${target.asset}`
    const archive = path.join(tmp, target.asset)
    const destDir = path.join(ROOT, target.dir)

    console.log(`→ ${target.dir}`)
    try {
      await download(url, archive)
      extract(archive, destDir, target.binary)
      if (process.platform !== 'win32') {
        fs.chmodSync(path.join(destDir, target.binary), 0o755)
      }
    } catch (err) {
      failures.push(`${target.dir}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true })

  if (failures.length) {
    console.warn('Algunos binarios no se descargaron:')
    for (const f of failures) console.warn(`  · ${f}`)
    if (failures.length === targets.length) process.exit(1)
  }

  console.log('Litestream binaries ready in electron/resources/litestream/')
  if (!allPlatforms) {
    console.log('Tip: LITESTREAM_ALL=1 npm run download:litestream para todas las plataformas (requiere tar en macOS/Linux).')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
