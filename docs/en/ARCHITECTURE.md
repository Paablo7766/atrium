# Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                     Electron shell                       │
│  electron/main.ts  ·  preload.ts  ·  IPC · Litestream    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              React SPA (React Router)                    │
│  Zustand · AuthProvider · useTrades                      │
│  pages/* · components/* · lib/*                          │
└───────────────┬──────────────────────┬──────────────────┘
                │                      │
     Encrypted SQLite (local)    Optional E2E sync
     journal.db / SQLCipher      Supabase blobs only
                │
                ▼
     Optional Litestream replica
     (folder chosen by the user)
```

The journal is **local-first**. Atrium runs fully without cloud credentials. Supabase is optional and stores only client-encrypted blobs when the user turns on multi-device sync.

## Layers

| Layer | Role | Path |
|-------|------|------|
| UI | Pages + design system | `src/pages`, `src/components` |
| State | Page, locale, UI flags | `src/store.ts` (Zustand) |
| Domain | Trade types, stats, capital | `src/types.ts`, `src/lib/stats.ts`, `src/lib/capital.ts` |
| Import | Broker pipeline | `src/lib/import/` |
| Persist | Encrypted SQLite (desktop) / IndexedDB AES-GCM (web preview) | `src/lib/db/`, `electron/main.ts` |
| Backup | Litestream replica + rotating `.bak` | `electron/litestream/`, `src/lib/db/service.ts` |
| Cloud | Optional session + E2E sync | `src/auth/`, `src/lib/supabase.ts`, `src/lib/tradeSync.ts` |
| i18n | EN/ES dictionaries | `src/lib/i18n/` |

## Data flow

1. **Local encrypted SQLite** — desktop primary store is `{userData}/journal.db` (SQLCipher AES-256 via `better-sqlite3-multiple-ciphers`). Key from **master password** (PBKDF2, 200 000 iterations). Legacy installs may still use OS `safeStorage` until migrated in Settings.  
2. **Optional Litestream backup** — when enabled, a local child process replicates the already-encrypted DB to a folder (default `{userData}/backups/litestream/`). The Litestream panel in Settings is currently hidden (`SHOW_LITESTREAM_PANEL`); replicas may still run on desktop until that flag changes. See [BACKUP_ARCHITECTURE.md](../BACKUP_ARCHITECTURE.md).  
3. **Optional E2E sync** — code exists for Supabase blobs, but **multi-device sync is off in product** (`CLOUD_SYNC_FEATURE_ENABLED = false`). Do not re-enable without conflict UI and server-side versioning.

Web preview (no Electron) stores encrypted records in **IndexedDB** (`atrium-journal`) with PBKDF2 salt in `localStorage`. Legacy plain JSON in `trading-journal:data` is migrated during onboarding when possible — the web preview is not equivalent to the Windows desktop threat model.

## Persistence

- **Desktop:** `journal.db` (encrypted) · rotating `journal.db.bak` · dated copies under `backups/`  
- **Browser preview:** IndexedDB (AES-GCM per record) · PBKDF2 salt in `localStorage` · legacy plain JSON until migrated  
- **Cloud (opt-in):** encrypted snapshot blobs (`supabase/migrations/004_encrypted_sync.sql`)  
- Legacy `journal-data.json` is migrated once via `src/lib/db/migrateFromJson.ts`

## Security notes

- Never commit `.env` (gitignored)  
- The app does **not** require Supabase to run  
- If you enable sync, use only the **anon** key in the client; RLS protects rows  
- `.env.example` must stay empty of real secrets  
- Atrium cannot recover a forgotten master password or decrypt a replica without the local key  

## Brand

- Logo: `src/assets/logo.png` / `docs/assets/logo.png`  
- Icons: `public/icon.png`, `public/icon.ico`  
- Accent: `#4ade80` on near-black `#080809` · font **Outfit Variable**
