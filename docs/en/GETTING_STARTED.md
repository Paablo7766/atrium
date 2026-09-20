# Getting started

## Requirements

- **Node.js** 20+ (recommended)  
- **Windows** 10/11 for the Electron desktop build  
- npm (comes with Node)

## Install & run

```bash
git clone <your-repo-url>
cd atrium   # or the folder name you cloned
npm install
npm run dev
```

No `.env` is required. The journal lives on disk as **encrypted SQLite** (`journal.db`). Copy `.env.example` only if you want ticker logos (FMP) or optional E2E cloud sync.

**Windows shortcut:** double-click `Abrir Atrium.bat` — installs deps if needed and focuses an existing Electron window.

## First-run encryption

On desktop, onboarding asks how to protect `journal.db`:

- **OS keychain** (`safeStorage`) — a random key stored by Windows/macOS  
- **Master password** — PBKDF2-derived key; you must unlock Atrium after each launch  

Both modes encrypt the file with SQLCipher. Atrium cannot recover a forgotten password.

## Optional local backup (Litestream)

Litestream is bundled and replicates the **already encrypted** database to a folder (default under user data, or a folder you pick in Settings › Data). Details: [BACKUP_ARCHITECTURE.md](../BACKUP_ARCHITECTURE.md).

## Optional cloud setup

Sync is **not** required to use Atrium. To enable Settings › Multi-device sync (E2E encrypted blobs):

1. Create a project at [supabase.com](https://supabase.com)  
2. Run SQL in `supabase/migrations/` (001 → 004)  
3. Put URL + anon key in `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

4. (Optional) FMP logos: [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs)

```env
VITE_FMP_API_KEY=your_key
```

Then turn on **Settings › Multi-device sync**. Until you do, the app stays local-only even with env vars present.

## Build a Windows installer

```bash
npm run dist
```

Output in `release/` — NSIS installer + portable executable. Icon: `public/icon.ico`.

Unpacked dir (for testing the packaged exe): `npx electron-builder --dir` → `release/win-unpacked/Atrium.exe`.

## Scripts reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite + Electron on port 5173 |
| `npm run build` | Vite production bundle → `dist/` |
| `npm run dist` | Build + electron-builder (Windows) |
| `npm run preview` | Preview Vite build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (crypto, repository, sync) |
| `npm run test:stats` | Stats engine verification |
| `npm run test:import` | Import engine verification |
| `npm run test:mapper` | Trade mapper verification |
| `npm run test:xlsx` | XLSX import verification |

## First minutes in the app

1. Complete **onboarding** (encryption mode → blank book or demo)  
2. Create an **account book** in Settings  
3. **Import** a broker CSV or add a manual trade (`Ctrl+N`)  
4. Explore **Dashboard → Analytics → Calendar → Journal**  
5. Switch language anytime (EN ↔ ES)
