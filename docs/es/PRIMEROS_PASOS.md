# Primeros pasos

## Requisitos

- **Node.js** 20+ (recomendado)  
- **Windows** 10/11 para el build de escritorio Electron  
- npm (incluido con Node)

## Instalar y ejecutar

```bash
git clone <url-del-repo>
cd atrium-journal   # o el nombre de la carpeta
npm install
cp .env.example .env   # opcional
npm run dev
```

**Atajo Windows:** doble clic en `Abrir Atrium.bat` — instala dependencias si hace falta y enfoca la ventana de Electron si ya está abierta.

## Configurar la nube (opcional)

1. Crea un proyecto en [supabase.com](https://supabase.com)  
2. Ejecuta el SQL de `supabase/migrations/` (001 y luego 002)  
3. Pon URL + anon key en `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

4. (Opcional) Logos FMP: [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs)

```env
VITE_FMP_API_KEY=tu_clave
```

## Crear instalador Windows

```bash
npm run dist
```

Salida en `release/` — instalador NSIS + ejecutable portable. Icono: `public/icon.ico`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Vite + Electron en el puerto 5173 |
| `npm run build` | Bundle de producción → `dist/` |
| `npm run dist` | Build + electron-builder (Windows) |
| `npm run preview` | Previsualizar build Vite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:stats` | Verificación del motor de estadísticas |
| `npm run test:import` | Verificación del motor de importación |
| `npm run test:mapper` | Verificación del mapeo de trades |
| `npm run test:xlsx` | Verificación de importación XLSX |

## Primeros minutos en la app

1. Completa el **onboarding** (o carga demo)  
2. Crea un **libro de cuenta** en Ajustes  
3. **Importa** un CSV del broker o añade un trade (`Ctrl+N`)  
4. Explora **Dashboard → Analítica → Calendario → Diario**  
5. Cambia el idioma cuando quieras (ES ↔ EN)
