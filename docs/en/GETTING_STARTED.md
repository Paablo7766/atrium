# Getting started

## Requirements

- **Node.js** 20+ (recommended)  
- **Windows** 10/11 for the Electron desktop build  
- npm (comes with Node)

## Install & run

```bash
git clone <your-repo-url>
cd atrium-journal   # or the folder name you cloned
npm install
cp .env.example .env   # optional
npm run dev
```

**Windows shortcut:** double-click `Abrir Atrium.bat` — installs deps if needed and focuses an existing Electron window.

## Optional cloud setup

1. Create a project at [supabase.com](https://supabase.com)  
2. Run SQL in `supabase/migrations/` (001 then 002)  
3. Put URL + anon key in `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

4. (Optional) FMP logos: [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs)

```env
VITE_FMP_API_KEY=your_key
```

## Build a Windows installer

```bash
npm run dist
```

Output in `release/` — NSIS installer + portable executable. Icon: `public/icon.ico`.

## Scripts reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite + Electron on port 5173 |
| `npm run build` | Vite production bundle → `dist/` |
| `npm run dist` | Build + electron-builder (Windows) |
| `npm run preview` | Preview Vite build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:stats` | Stats engine verification |
| `npm run test:import` | Import engine verification |
| `npm run test:mapper` | Trade mapper verification |
| `npm run test:xlsx` | XLSX import verification |

## First minutes in the app

1. Complete **onboarding** (or skip / load demo)  
2. Create an **account book** in Settings  
3. **Import** a broker CSV or add a manual trade (`Ctrl+N`)  
4. Explore **Dashboard → Analytics → Calendar → Journal**  
5. Switch language anytime (EN ↔ ES)
