# Arquitectura

```text
┌─────────────────────────────────────────────────────────┐
│                   Shell de Electron                      │
│  electron/main.ts  ·  preload.ts  ·  persistencia IPC    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              SPA React (sin React Router)                │
│  Cambio de página con Zustand · AuthProvider · useTrades │
│  pages/* · components/* · lib/*                          │
└───────────────┬──────────────────────┬──────────────────┘
                │                      │
        Almacén JSON local        Supabase opcional
   journal-data.json / LS      Auth + Postgres + RLS
```

## Capas

| Capa | Rol | Ruta |
|------|-----|------|
| UI | Páginas + design system | `src/pages`, `src/components` |
| Estado | Página, idioma, flags | `src/store.ts` (Zustand) |
| Dominio | Tipos, stats, capital | `src/types.ts`, `src/lib/stats.ts`, `src/lib/capital.ts` |
| Importación | Pipeline de brokers | `src/lib/import/` |
| Persistencia | Archivo escritorio / localStorage | `src/lib/storage.ts`, `electron/main.ts` |
| Nube | Sesión + sync | `src/auth/`, `src/lib/supabase.ts`, `src/lib/tradeSync.ts` |
| i18n | Diccionarios ES/EN | `src/lib/i18n.ts` |

## Persistencia

- **Escritorio:** escrituras atómicas a `journal-data.json`, `.bak` rotativo + backups fechados  
- **Preview en navegador:** `localStorage`  
- **Nube:** tablas estilo Prisma vía migraciones Supabase  

## Seguridad

- Nunca subas `.env` (está en `.gitignore`)  
- En el cliente solo la clave **anon**; RLS protege las filas  
- `.env.example` debe quedar sin secretos reales  

## Marca

- Logo: `src/assets/logo.png` / `docs/assets/logo.png`  
- Iconos: `public/icon.png`, `public/icon.ico`  
- Acento: `#4ade80` sobre casi negro `#080809` · tipografía **Outfit Variable**
