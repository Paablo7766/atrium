import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { cleanSymbol, cleanSymbolsCsv } from './lib/fmpSecurity'

/**
 * Electron solo en desktop local (`npm run dev` / `npm run build` / `npm run dist`).
 * En Vercel (o WEB_ONLY=1) se omite para un build web limpio sin binarios nativos.
 */
const enableElectron =
  !process.env.VERCEL && process.env.WEB_ONLY !== '1'

type EnvMap = Record<string, string>

function fmpKey(env: EnvMap): string | undefined {
  return (env.FMP_API_KEY || env.VITE_FMP_API_KEY)?.trim() || undefined
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function proxyFmp(res: ServerResponse, upstreamUrl: string): Promise<void> {
  try {
    const upstream = await fetch(upstreamUrl)
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch {
    sendJson(res, 502, { error: 'Upstream FMP request failed' })
  }
}

function readUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://localhost')
}


/** Emula `/api/quotes` y `/api/logo` en `npm run dev` (sin vercel CLI). */
function fmpDevApiProxy(env: EnvMap): Plugin {
  return {
    name: 'fmp-dev-api-proxy',
    configureServer(server) {
      const handler: Connect.NextHandleFunction = (req, res, next) => {
        const pathname = readUrl(req).pathname
        if (pathname !== '/api/quotes' && pathname !== '/api/logo') {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed' })
          return
        }

        const key = fmpKey(env)
        if (!key) {
          sendJson(res, 503, { error: 'FMP API key not configured' })
          return
        }

        const url = readUrl(req)

        if (pathname === '/api/quotes') {
          const raw = url.searchParams.get('symbols')?.trim()
          const symbols = raw ? cleanSymbolsCsv(raw) : ''
          if (!symbols) {
            sendJson(res, 400, { error: 'Missing symbols query parameter' })
            return
          }
          void proxyFmp(
            res,
            `https://financialmodelingprep.com/api/v3/batch-quote` +
              `?symbols=${encodeURIComponent(symbols)}` +
              `&apikey=${encodeURIComponent(key)}`,
          )
          return
        }

        const rawSymbol = url.searchParams.get('symbol')?.trim()
        const symbol = rawSymbol ? cleanSymbol(rawSymbol) : ''
        if (!symbol) {
          sendJson(res, 400, { error: 'Missing symbol query parameter' })
          return
        }
        void proxyFmp(
          res,
          `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(symbol)}` +
            `?apikey=${encodeURIComponent(key)}`,
        )
      }

      server.middlewares.use(handler)
    },
  }
}

export default defineConfig(({ mode }) => {
  // Carga .env sin filtro VITE_ — la key FMP es server-only en el middleware
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      fmpDevApiProxy(env),
      ...(enableElectron
        ? [
            electron({
              main: {
                entry: 'electron/main.ts',
                vite: {
                  ssr: {
                    external: ['better-sqlite3-multiple-ciphers'],
                  },
                  build: {
                    rollupOptions: {
                      external: ['better-sqlite3-multiple-ciphers'],
                    },
                  },
                },
              },
              preload: {
                input: path.join(import.meta.dirname, 'electron/preload.ts'),
              },
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.join(import.meta.dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/scheduler') ||
              /node_modules[/\\]react[/\\]/.test(id)
            ) {
              return 'react'
            }
            if (
              id.includes('node_modules/recharts') ||
              id.includes('node_modules/victory-vendor') ||
              id.includes('node_modules/d3-')
            ) {
              return 'recharts'
            }
            if (id.includes('node_modules/xlsx')) return 'xlsx'
            if (id.includes('node_modules/@supabase')) return 'supabase'
            return undefined
          },
        },
      },
    },
  }
})
