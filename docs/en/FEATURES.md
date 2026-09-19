# Features

Complete catalogue of tools inside **Atrium**.

---

## 1. Dashboard

Central command center for your account book.

- **Equity chart** — balance over time including deposits & withdrawals  
- **Flow chart** — cumulative wins vs losses areas  
- **Daily P&L bars** — day-by-day performance  
- **KPIs** — today, last 7 days, win rate, profit factor, best day, max drawdown  
- **Recent trades** — latest fills with direction & P&L  
- **Strategy rank** — which setups are paying  
- **Daily loss-limit banner** — risk desk warning when breached  
- **Share week / month** — generate a performance card in one click  
- **Demo data** — explore the UI with sample trades  

---

## 2. Trades

Full trade book management.

- Filters: wins / losses / open, market, strategy  
- Full-text search & multi-column sort  
- Expandable rows with detail  
- Edit · duplicate · delete  
- Manual entry via **Trade Modal** (simple or premium form)  
- Premium fields: SL/TP, fees, R-multiple, strategy, tags, emotion, rating, playbook checklist, mistakes  
- CSV export of the current book  
- Share a single trade card  

---

## 3. Calendar

Visual month of your trading life.

- Heat intensity by **P&L** or **journal events**  
- Week column share  
- Day panel: trades of the day + mood notes  
- Navigate months with locale-aware labels (EN/ES)  

---

## 4. Analytics

Deep edge measurement (`src/lib/stats.ts` + Recharts). Filter by period (7D · 30D · 90D · month · year · all) and get automatic insights.

| Block | Metrics |
|-------|---------|
| Overview | Net P&L, win rate, PF, expectancy, avg R, payoff |
| Insights | Process leaks, best weekday, leading strategy |
| P&L origin | Long vs short contribution |
| By category | Strategy · symbol · market · tag · setup |
| Time | Weekday, hour of day, month seasonality |
| Risk | R histogram, drawdown curve, streaks, Sharpe, recovery |
| Process | Emotions, perceived star ratings, mistake tags |

Screenshots: [overview](../assets/analytics.png) · [time](../assets/analytics-time.png) · [risk](../assets/analytics-risk.png) · [process](../assets/analytics-process.png) — see also [SCREENSHOTS.md](./SCREENSHOTS.md).

---

## 5. Psychology journal

- Daily notes with **mood score 1–5**  
- Autosave while typing  
- Search past entries  
- Context: day P&L next to the note  

---

## 6. Settings & tools

### Accounts
Live · demo · prop · paper books with color swatches. Switch from the sidebar.

### Risk desk
Risk % per trade, daily loss limit, preferred markets, week start day.

### Playbook
Named setups with checklist items — linked from the trade form.

### Data
- Broker **CSV / XLSX import** (see [IMPORT.md](./IMPORT.md))  
- Export / import journal JSON  
- Desktop **automatic backups** (keep last 10, every ~10 min)  
- Restore from `.bak` or dated backup  

### Advanced
Language (EN/ES), avatar, onboarding reset, demo load, clear data.

---

## 7. Share cards

Exportable 1600×900 cards for social / Discord / mentoring.

| Scope | Themes |
|-------|--------|
| Trade · Week · Month | **Orbit** · **Editorial** · **Signal** · **Folio** |

---

## 8. Auth & cloud (optional)

If `VITE_SUPABASE_*` is set:

- Magic-link email OTP  
- Google OAuth  
- Trade sync to Postgres (`executions` + `trades`) with RLS  

Without env vars → **local-only mode** (no login gate). Data lives in Electron `journal-data.json` or browser `localStorage`.

---

## 9. Asset logos

Ticker icons from a local map + optional **Financial Modeling Prep** API (`VITE_FMP_API_KEY`).

---

## 10. Onboarding & tour

First-run wizard (profile → markets → desk → assemble) plus an in-app product tour for new users.
