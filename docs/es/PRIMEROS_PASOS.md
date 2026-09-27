# Primeros pasos

## Requisitos

- **Node.js** 20+ (recomendado)  
- **Windows** 10/11 para el build de escritorio Electron  
- npm (incluido con Node)

## Instalar y ejecutar

```bash
git clone <url-del-repo>
cd atrium   # o el nombre de la carpeta
npm install
npm run dev
```

No hace falta `.env`. El diario vive en disco como **SQLite cifrado** (`journal.db`). Copia `.env.example` solo si quieres logos de tickers (FMP) o el sync E2E opcional en la nube.

**Atajo Windows:** doble clic en `Abrir Atrium.bat` — instala dependencias si hace falta y enfoca la ventana de Electron si ya está abierta.

## Cifrado en el primer uso

En escritorio, el onboarding define una **contraseña maestra** para `journal.db` (PBKDF2, 200 000 iteraciones → SQLCipher AES-256). Hay que desbloquear Atrium en cada arranque. Atrium no puede recuperar una contraseña olvidada.

Instalaciones antiguas pueden seguir en almacén seguro del SO; puedes migrar a contraseña maestra en **Ajustes › Datos**.

## Copia local opcional (Litestream)

Litestream puede replicar la base **ya cifrada** en local. El panel dedicado en Ajustes está oculto; siguen disponibles las copias `.bak` rotativas. Detalle: [BACKUP_ARCHITECTURE.md](../BACKUP_ARCHITECTURE.md).

## Configurar la nube (desactivado en producto)

El sync multi-dispositivo está **apagado** en esta versión (`CLOUD_SYNC_FEATURE_ENABLED = false`). Pasos para desarrolladores (migraciones **001 → 005**):

1. Crea un proyecto en [supabase.com](https://supabase.com)  
2. Ejecuta el SQL de `supabase/migrations/` (001 → 005, incluye `005_sync_salt.sql`)  
3. Pon URL + anon key en `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

4. (Opcional) Logos FMP: [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs)

```env
VITE_FMP_API_KEY=tu_clave
```

Reactivar sync en código requiere manejo de conflictos y no está soportado en este build.

## Crear instalador Windows

Vite incluye las `VITE_*` en el bundle **al compilar**. Antes de cada `npm run dist`, define PostHog (telemetría anónima de uso, opcional) en la misma terminal o en `.env.production`:

```env
VITE_POSTHOG_KEY=phc_tu_clave_de_proyecto
VITE_POSTHOG_HOST=https://eu.i.posthog.com
```

Ejemplo en PowerShell:

```powershell
$env:VITE_POSTHOG_KEY = "phc_..."
$env:VITE_POSTHOG_HOST = "https://eu.i.posthog.com"
npm run dist
```

```bash
npm run dist
```

Salida en `release/` — instalador NSIS + ejecutable portable. Icono: `public/icon.ico`.

Directorio desempaquetado (para probar el exe empaquetado): `npx electron-builder --dir` → `release/win-unpacked/Atrium.exe`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Vite + Electron en el puerto 5173 |
| `npm run build` | Bundle de producción → `dist/` |
| `npm run dist` | Build + electron-builder (Windows) |
| `npm run preview` | Previsualizar build Vite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (cifrado, repository, sync) |
| `npm run test:stats` | Verificación del motor de estadísticas |
| `npm run test:import` | Verificación del motor de importación |
| `npm run test:mapper` | Verificación del mapeo de trades |
| `npm run test:xlsx` | Verificación de importación XLSX |

## Primeros minutos en la app

1. Completa el **onboarding** (modo de cifrado → libro en blanco o demo)  
2. Crea un **libro de cuenta** en Ajustes  
3. **Importa** un CSV del broker o añade un trade (`Ctrl+N`)  
4. Explora **Dashboard → Analítica → Calendario → Diario**  
5. Cambia el idioma cuando quieras (ES ↔ EN)
