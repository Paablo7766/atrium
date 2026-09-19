<p align="center">
  <img src="docs/assets/logo.png" alt="Atrium" width="96" height="96" style="border-radius:22%" />
</p>

<h1 align="center">Atrium</h1>

<p align="center">
  <strong>Premium desktop trading journal</strong> · Electron · React · TypeScript<br/>
  Multi-account analytics · Broker CSV/XLSX import · Psychology journal · Share cards<br/>
  Fully bilingual <strong>English / Español</strong>
</p>

<p align="center">
  <a href="#-english"><img src="https://img.shields.io/badge/lang-English-4ade80?style=for-the-badge&labelColor=0e0e10" alt="English" /></a>
  <a href="#-español"><img src="https://img.shields.io/badge/lang-Español-38bdf8?style=for-the-badge&labelColor=0e0e10" alt="Español" /></a>
  <img src="https://img.shields.io/badge/platform-Windows-222228?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-44-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
</p>

<p align="center">
  <img src="docs/assets/hero-dashboard.png" alt="Atrium — Dashboard" width="100%" />
</p>

<p align="center"><sub>Real screenshots from the running app · Capturas reales de la aplicación</sub></p>

---

# 🇬🇧 English

> **Atrium** is a professional desktop trading journal: track every trade, import from your broker, measure edge with deep analytics, and reflect with a psychology journal — all in a polished dark UI.

**Docs:** [Features](docs/en/FEATURES.md) · [Getting started](docs/en/GETTING_STARTED.md) · [Import](docs/en/IMPORT.md) · [Architecture](docs/en/ARCHITECTURE.md)

## Highlights

| | Tool | What you get |
|---|------|----------------|
| 📊 | **Dashboard** | Equity & flow charts, KPIs, recent trades, strategy rank, daily loss-limit alerts |
| 📒 | **Trades** | Filter, search, sort, edit, duplicate, CSV export, share a single trade |
| 📅 | **Calendar** | Heatmap by P&L or journal events, day panel with notes |
| 📈 | **Analytics** | Win rate, PF, expectancy, drawdown, R-distribution, weekday/hour, emotions & mistakes |
| 🧠 | **Journal** | Mood-tagged daily notes linked to trading days |
| ⚙️ | **Settings** | Accounts, risk desk, playbook checklists, import/export, backups |
| 📥 | **Broker import** | XTB · Interactive Brokers · DEGIRO · Fomo · Axiom · Auto-detect (CSV / XLSX) |
| 🃏 | **Share cards** | Week / month / trade cards (1600×900) — themes: Orbit, Editorial, Signal, Folio |
| ☁️ | **Cloud (optional)** | Supabase auth (magic link / Google) + trade sync |
| 🌐 | **i18n** | English & Español at runtime |

<p align="center">
  <img src="docs/assets/feature-analytics.png" alt="Analytics" width="48%" />
  &nbsp;
  <img src="docs/assets/feature-calendar.png" alt="Calendar" width="48%" />
</p>
<p align="center">
  <img src="docs/assets/feature-trades.png" alt="Trades" width="48%" />
  &nbsp;
  <img src="docs/assets/feature-journal.png" alt="Journal" width="48%" />
</p>
<p align="center">
  <img src="docs/assets/feature-import.png" alt="Import / Settings" width="48%" />
  &nbsp;
  <img src="docs/assets/feature-share-card.png" alt="Share card" width="48%" />
</p>

## Quick start

```bash
npm install
cp .env.example .env   # optional
npm run dev
```

Or double-click **`Abrir Atrium.bat`** on Windows.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development (Vite + Electron) |
| `npm run build` | Production web build |
| `npm run dist` | Windows installer (NSIS + portable) → `release/` |
| `npm run typecheck` | TypeScript check |
| `npm run test:import` | Import engine tests |
| `npm run shots` | Capture real README screenshots |

### Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | No | Cloud auth + sync (omit = local-only) |
| `VITE_SUPABASE_ANON_KEY` | No | Supabase anon key |
| `VITE_FMP_API_KEY` | No | Ticker / company logos (Financial Modeling Prep) |

## Tech stack

```text
React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Zustand
Electron 44 · electron-builder · Recharts · date-fns · xlsx
Supabase (optional) · Prisma schema · FMP logos API
```

## Project structure

```text
├── electron/          Desktop shell (IPC, JSON persistence, backups)
├── src/
│   ├── pages/         Dashboard · Trades · Calendar · Analytics · Journal · Settings · Login
│   ├── components/    UI kit, charts, analytics modules, ShareCard, Tour…
│   ├── lib/import/    Broker adapters + CSV/XLSX pipeline
│   ├── auth/          Supabase session gate
│   └── assets/        Brand logo
├── prisma/            Cloud data model
├── supabase/          SQL migrations + RLS
├── docs/              Bilingual documentation + real screenshots
└── public/            App icons (.png / .ico)
```

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `1`–`6` | Switch pages |
| `Ctrl/Cmd + N` | New trade |
| `Ctrl/Cmd + B` | Toggle sidebar |

## Author

**Pablo Sanz** — Atrium `v1.0.0`

---

# 🇪🇸 Español

> **Atrium** es un diario de trading profesional para escritorio: registra cada operación, importa desde tu broker, mide tu ventaja con analítica profunda y reflexiona con un diario psicológico — todo en una interfaz oscura premium.

**Docs:** [Funciones](docs/es/FUNCIONES.md) · [Primeros pasos](docs/es/PRIMEROS_PASOS.md) · [Importación](docs/es/IMPORTACION.md) · [Arquitectura](docs/es/ARQUITECTURA.md)

## Destacados

| | Herramienta | Qué ofrece |
|---|-------------|------------|
| 📊 | **Dashboard** | Curvas de equity y flujo, KPIs, operaciones recientes, ranking de estrategias, alertas de pérdida diaria |
| 📒 | **Operaciones** | Filtrar, buscar, ordenar, editar, duplicar, exportar CSV, compartir una operación |
| 📅 | **Calendario** | Mapa de calor por P&L o eventos del diario, panel del día con notas |
| 📈 | **Analítica** | Win rate, factor de beneficio, expectativa, drawdown, distribución en R, día/hora, emociones y errores |
| 🧠 | **Diario** | Notas diarias con estado de ánimo vinculadas a días de trading |
| ⚙️ | **Ajustes** | Cuentas, mesa de riesgo, playbook con checklists, importar/exportar, copias de seguridad |
| 📥 | **Importación** | XTB · Interactive Brokers · DEGIRO · Fomo · Axiom · Auto-detección (CSV / XLSX) |
| 🃏 | **Tarjetas** | Semana / mes / trade (1600×900) — temas Orbit, Editorial, Signal, Folio |
| ☁️ | **Nube (opcional)** | Auth Supabase (magic link / Google) + sincronización |
| 🌐 | **i18n** | Inglés y Español en tiempo real |

## Inicio rápido

```bash
npm install
cp .env.example .env   # opcional
npm run dev
```

O haz doble clic en **`Abrir Atrium.bat`**.

| Script | Propósito |
|--------|-----------|
| `npm run dev` | Desarrollo (Vite + Electron) |
| `npm run build` | Build web de producción |
| `npm run dist` | Instalador Windows (NSIS + portable) → `release/` |
| `npm run typecheck` | Comprobación TypeScript |
| `npm run test:import` | Tests del motor de importación |
| `npm run shots` | Capturas reales para el README |

### Variables de entorno

| Variable | Obligatoria | Propósito |
|----------|-------------|-----------|
| `VITE_SUPABASE_URL` | No | Auth y sync en la nube (sin ella = solo local) |
| `VITE_SUPABASE_ANON_KEY` | No | Clave anon de Supabase |
| `VITE_FMP_API_KEY` | No | Logos de tickers (Financial Modeling Prep) |

## Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `1`–`6` | Cambiar de página |
| `Ctrl/Cmd + N` | Nueva operación |
| `Ctrl/Cmd + B` | Mostrar/ocultar barra lateral |

## Autor

**Pablo Sanz** — Atrium `v1.0.0`

---

<p align="center">
  <img src="docs/assets/logo.png" alt="Atrium" width="48" height="48" style="border-radius:22%" /><br/>
  <sub>Built for serious traders · Hecho para traders serios</sub>
</p>
