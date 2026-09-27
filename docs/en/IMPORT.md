# Broker import

Atrium imports **CSV, TXT, XLSX, and XLS** broker statements, normalizes executions, groups them into trades, and deduplicates. Everything is saved to the **local encrypted SQLite** journal. Cloud sync is optional and only runs if you enable E2E multi-device sync in Settings.

Pipeline: `src/lib/import/` → parse → adapters → group → map → dedupe → local DB (optional encrypted cloud snapshot).

---

## Supported brokers

| Broker | Status | Notes |
|--------|--------|--------|
| **AUTO** | Recommended | Header scoring picks the best adapter |
| **XTB** | Production | Closed Positions (xStation EN/ES headers); open+close on same row |
| **Interactive Brokers** | Solid | Activity / Flex-style; aliases `IB`, `IBKR` |
| **DEGIRO** | Solid | Account/transactions; day-first dates; comma decimals |
| **Fomo** | Beta | Crypto-oriented — adapter in trial |
| **Axiom** | Beta | Generic Instrument/Side — trial |

---

## How to import

1. Open **Settings → Import**  
2. Choose broker (**AUTO** if unsure)  
3. Drop or select `.csv` / `.xlsx`  
4. Check the summary under **Broker** in Settings (last import) and toasts  
5. If 0 imported: message shows detected broker, columns, and expected export type  
6. **Journal CSV** (Atrium export) ≠ **broker CSV** — two separate actions in Settings  
7. Trades appear in **Trades** and feed **Dashboard / Analytics / Calendar**

---

## What gets mapped

Typical fields: symbol, side, open/close time, size, prices, commissions, swap, P&L, currency.

Premium UI fields (strategy, emotion, checklist…) stay manual after import unless you edit the trade.

---

## Tips

- Prefer the broker’s **closed positions / activity** export  
- One file per account book when possible  
- Re-importing the same file is safe — **dedupe** skips known executions  
- Legacy generic CSV helpers also live in `src/lib/csv.ts` for simple round-trips  

---

## Tests

```bash
npm run test:import
npm run test:mapper
npm run test:xlsx
npm run test -- src/lib/import/
```

Full audit: [`docs/AUDIT_BROKER_IMPORT.md`](../AUDIT_BROKER_IMPORT.md).
