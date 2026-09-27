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

On desktop, onboarding sets a **master password** for `journal.db` (PBKDF2, 200 000 iterations → SQLCipher AES-256). You unlock Atrium after each launch. Atrium cannot recover a forgotten password.

Older installs may still use OS secure storage; you can migrate to a master password in **Settings › Data**.

## Optional local backup (Litestream)

Litestream can replicate the **already encrypted** database locally. The dedicated Litestream panel in Settings is currently hidden; rotating `.bak` copies under user data remain available. Details: [BACKUP_ARCHITECTURE.md](../BACKUP_ARCHITECTURE.md).

## Optional cloud setup (disabled in product)

Multi-device sync is **turned off** in the current release (`CLOUD_SYNC_FEATURE_ENABLED = false`). The steps below are for developers preparing a future enablement — run migrations **001 → 005** if you experiment:

1. Create a project at [supabase.com](https://supabase.com)  
2. Run SQL in `supabase/migrations/` (001 → 005, including `005_sync_salt.sql`)  
3. Put URL + anon key in `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

4. (Optional) FMP logos: [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs)

```env
VITE_FMP_API_KEY=your_key
```

Re-enabling sync in code requires conflict handling and is not supported in this build.

## Build a Windows installer

Vite bakes `VITE_*` into the bundle at **build time**. Before each release build, set PostHog (optional anonymous usage telemetry) in the same shell or in `.env.production`:

```env
VITE_POSTHOG_KEY=phc_your_project_key
VITE_POSTHOG_HOST=https://eu.i.posthog.com
```

PowerShell example:

```powershell
$env:VITE_POSTHOG_KEY = "phc_..."
$env:VITE_POSTHOG_HOST = "https://eu.i.posthog.com"
npm run dist
```

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
