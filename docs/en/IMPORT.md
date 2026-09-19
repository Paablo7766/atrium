# Broker import

Atrium Journal imports **CSV, TXT, XLSX, and XLS** broker statements, normalizes executions, groups them into trades, deduplicates, and optionally syncs to Supabase.

Pipeline: `src/lib/import/` → parse → adapters → group → map → dedupe → UI / cloud.

---

## Supported brokers

| Broker | Status | Notes |
|--------|--------|--------|
| **AUTO** | Recommended | Sniffs headers and picks the best adapter |
| **XTB** | Production | Closed Positions (xStation EN/ES headers); open+close on same row |
| **Interactive Brokers** | Solid | Activity / Flex-style; aliases `IB`, `IBKR` |
| **DEGIRO** | Solid | Account/transactions; day-first dates; comma decimals |
| **Fomo** | Skeleton | Crypto-oriented — refine with a real sample |
| **Axiom** | Skeleton | Generic Instrument/Side mapping |

---

## How to import

1. Open **Settings → Import**  
2. Choose broker (**AUTO** if unsure)  
3. Drop or select `.csv` / `.xlsx`  
4. Review imported count / skipped duplicates  
5. Trades appear in **Trades** and feed **Dashboard / Analytics / Calendar**

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
```
