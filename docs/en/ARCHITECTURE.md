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
| Persist | Encrypted SQLite (desktop) / localStorage (web preview) | `src/lib/db/`, `electron/main.ts` |
| Backup | Litestream replica + rotating `.bak` | `electron/litestream/`, `src/lib/db/service.ts` |
| Cloud | Optional session + E2E sync | `src/auth/`, `src/lib/supabase.ts`, `src/lib/tradeSync.ts` |
| i18n | EN/ES dictionaries | `src/lib/i18n/` |

## Data flow

1. **Local encrypted SQLite** — desktop primary store is `{userData}/journal.db` (SQLCipher AES-256 via `better-sqlite3-multiple-ciphers`). Key from master password (PBKDF2) or OS `safeStorage`.  
2. **Optional Litestream backup** — local child process replicates the already-encrypted DB to a folder (default `{userData}/backups/litestream/` or a user-picked path). See [BACKUP_ARCHITECTURE.md](../BACKUP_ARCHITECTURE.md).  
3. **Optional E2E sync** — if `VITE_SUPABASE_*` is set **and** the user enables Settings › Multi-device sync, AES-GCM snapshots go to Supabase. The server never sees plaintext.

Web preview (no Electron) keeps a JSON copy in `localStorage` only.

## Persistence

- **Desktop:** `journal.db` (encrypted) · rotating `journal.db.bak` · dated copies under `backups/`  
- **Browser preview:** `localStorage`  
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
