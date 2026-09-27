# Arquitectura

```text
┌─────────────────────────────────────────────────────────┐
│                   Shell de Electron                      │
│  electron/main.ts  ·  preload.ts  ·  IPC · Litestream    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              SPA React (React Router)                    │
│  Zustand · AuthProvider · useTrades                      │
│  pages/* · components/* · lib/*                          │
└───────────────┬──────────────────────┬──────────────────┘
                │                      │
     SQLite cifrado (local)      Sync E2E opcional
     journal.db / SQLCipher      Solo blobs en Supabase
                │
                ▼
     Réplica Litestream opcional
     (carpeta elegida por el usuario)
```

El diario es **primero local**. Atrium funciona por completo sin credenciales de nube. Supabase es opcional y, si se activa el sync, solo guarda blobs cifrados en el cliente.

## Capas

| Capa | Rol | Ruta |
|------|-----|------|
| UI | Páginas + design system | `src/pages`, `src/components` |
| Estado | Página, idioma, flags | `src/store.ts` (Zustand) |
| Dominio | Tipos, stats, capital | `src/types.ts`, `src/lib/stats.ts`, `src/lib/capital.ts` |
| Importación | Pipeline de brokers | `src/lib/import/` |
| Persistencia | SQLite cifrado (escritorio) / IndexedDB AES-GCM (preview web) | `src/lib/db/`, `electron/main.ts` |
| Copias | Réplica Litestream + `.bak` rotativo | `electron/litestream/`, `src/lib/db/service.ts` |
| Nube | Sesión + sync E2E opcionales | `src/auth/`, `src/lib/supabase.ts`, `src/lib/tradeSync.ts` |
| i18n | Diccionarios ES/EN | `src/lib/i18n/` |

## Flujo de datos

1. **SQLite cifrado local** — almacén principal de escritorio: `{userData}/journal.db` (SQLCipher AES-256 con `better-sqlite3-multiple-ciphers`). Clave por **contraseña maestra** (PBKDF2, 200 000 iteraciones). Instalaciones antiguas pueden seguir en `safeStorage` hasta migrar en Ajustes.  
2. **Copia Litestream opcional** — cuando está activa, un proceso local replica la BD ya cifrada (por defecto `{userData}/backups/litestream/`). El panel Litestream en Ajustes está oculto (`SHOW_LITESTREAM_PANEL`). Ver [BACKUP_ARCHITECTURE.md](../BACKUP_ARCHITECTURE.md).  
3. **Sync E2E opcional** — el código existe para blobs en Supabase, pero el **sync multi-dispositivo está desactivado en producto** (`CLOUD_SYNC_FEATURE_ENABLED = false`).

El preview web (sin Electron) guarda registros cifrados en **IndexedDB** (`atrium-journal`) con sal PBKDF2 en `localStorage`. El JSON legado en claro se migra en el onboarding cuando es posible.

## Persistencia

- **Escritorio:** `journal.db` (cifrado) · `journal.db.bak` rotativo · copias fechadas en `backups/`  
- **Preview en navegador:** IndexedDB (AES-GCM) · sal en `localStorage` · JSON legado hasta migrar  
- **Nube (opt-in):** blobs de snapshot cifrados (`supabase/migrations/004_encrypted_sync.sql`)  
- El legado `journal-data.json` se migra una vez en `src/lib/db/migrateFromJson.ts`

## Seguridad

- Nunca subas `.env` (está en `.gitignore`)  
- La app **no** necesita Supabase para funcionar  
- Si activas sync, en el cliente solo la clave **anon**; RLS protege las filas  
- `.env.example` debe quedar sin secretos reales  
- Atrium no puede recuperar una contraseña maestra olvidada ni descifrar una réplica sin la clave local  

## Marca

- Logo: `src/assets/logo.png` / `docs/assets/logo.png`  
- Iconos: `public/icon.png`, `public/icon.ico`  
- Acento: `#4ade80` sobre casi negro `#080809` · tipografía **Outfit Variable**
