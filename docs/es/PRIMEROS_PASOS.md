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

En escritorio, el onboarding pregunta cómo proteger `journal.db`:

- **Almacén del sistema** (`safeStorage`) — clave aleatoria guardada por Windows/macOS  
- **Contraseña maestra** — clave derivada con PBKDF2; hay que desbloquear Atrium en cada arranque  

Ambos modos cifran el archivo con SQLCipher. Atrium no puede recuperar una contraseña olvidada.

## Copia local opcional (Litestream)

Litestream va embebido y replica la base **ya cifrada** a una carpeta (por defecto en los datos de usuario, o una que elijas en Ajustes › Datos). Detalle: [BACKUP_ARCHITECTURE.md](../BACKUP_ARCHITECTURE.md).

## Configurar la nube (opcional)

El sync **no** es necesario para usar Atrium. Para activar Ajustes › Sync multi-dispositivo (blobs cifrados E2E):

1. Crea un proyecto en [supabase.com](https://supabase.com)  
2. Ejecuta el SQL de `supabase/migrations/` (001 → 004)  
3. Pon URL + anon key en `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

4. (Opcional) Logos FMP: [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs)

```env
VITE_FMP_API_KEY=tu_clave
```

Después activa **Ajustes › Sync multi-dispositivo**. Hasta entonces la app sigue solo local aunque existan las variables.

## Crear instalador Windows

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
