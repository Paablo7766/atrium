# Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                     Electron shell                       │
│  electron/main.ts  ·  preload.ts  ·  IPC persistence     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              React SPA (no React Router)                 │
│  Zustand page switch · AuthProvider · useTrades          │
│  pages/* · components/* · lib/*                          │
└───────────────┬──────────────────────┬──────────────────┘
                │                      │
        Local JSON store        Optional Supabase
   journal-data.json / LS      Auth + Postgres + RLS
```

## Layers

| Layer | Role | Path |
|-------|------|------|
| UI | Pages + design system | `src/pages`, `src/components` |
| State | Page, locale, UI flags | `src/store.ts` (Zustand) |
| Domain | Trade types, stats, capital | `src/types.ts`, `src/lib/stats.ts`, `src/lib/capital.ts` |
| Import | Broker pipeline | `src/lib/import/` |
| Persist | Desktop file / localStorage | `src/lib/storage.ts`, `electron/main.ts` |
| Cloud | Session + sync | `src/auth/`, `src/lib/supabase.ts`, `src/lib/tradeSync.ts` |
| i18n | EN/ES dictionaries | `src/lib/i18n.ts` |

## Persistence

- **Desktop:** atomic writes to `journal-data.json`, rotating `.bak` + dated backups  
- **Browser preview:** `localStorage`  
- **Cloud:** Prisma-shaped tables via Supabase migrations  

## Security notes

- Never commit `.env` (gitignored)  
- Use only the **anon** key in the client; RLS protects rows  
- `.env.example` must stay empty of real secrets  

## Brand

- Logo: `src/assets/logo.png` / `docs/assets/logo.png`  
- Icons: `public/icon.png`, `public/icon.ico`  
- Accent: `#4ade80` on near-black `#080809` · font **Outfit Variable**
