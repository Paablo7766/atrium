# Auditoría — importación de extractos de brokers (Atrium)

Informe de arquitectura, hallazgos y backlog. Resumen EN al final.

**Alcance:** `src/lib/import/*`, dedupe en `src/lib/csv.ts`. **Fuera de alcance:** backup JSON (`src/lib/db/import.ts`).

---

## Arquitectura end-to-end

1. **UI** — `Settings.tsx`: selector de bróker + `useImportCSV.pickAndImport`.
2. **Archivo** — `spreadsheet.fileToCsvTexts`: CSV texto o XLSX → una o más hojas (Closed + Open XTB).
3. **Motor** — `CSVImportEngine.parse` / `importAndGroup`: cabecera, AUTO/forzado, adapter, sanitize, `skippedRows`.
4. **Agrupación** — `assembleImportTrades`: XTB Closed/Open → `finalizeReadyTrades`; fills → FIFO (`groupTrades`).
5. **Store** — `tradeMapper` → `dedupeTrades` → `importData(..., 'merge')`.

| Bróker | Modo | Export esperado |
|--------|------|-----------------|
| XTB | READY_POSITIONS (+ FIFO en history sin Close) | xStation Closed / Open Positions |
| INTERACTIVE_BROKERS | FIFO_FILLS | Activity / Flex |
| DEGIRO | FIFO_FILLS | Transacciones cuenta |
| FOMO / AXIOM | FIFO_FILLS | Esqueleto — beta en UI |

**AUTO:** scoring por cabeceras (no solo orden de array). Ver `detectBroker` en `adapters/index.ts`.

---

## Matriz de fallos (F1–F10)

| ID | Síntoma | Causa | Sev | Mitigación en repo |
|----|---------|-------|-----|-------------------|
| F1 | CSV lleno, 0 trades | `continue` silencioso en adapters | P0 | Mensajes P0 + warnings en toast |
| F2 | Reimport, 0 nuevas | `tradeFingerprint` + copy confuso | P0 | Copy «duplicadas» vs «no parseadas» |
| F3 | Datos mal mapeados | AUTO elegía XTB por orden | P1 | Scoring AUTO |
| F4 | Fechas mal | `dayFirst` fijo | P1 | Alias columnas; docs |
| F5 | `skippedRows` incoherente | Heurística Type en READY | P2 | Conteo por `accepted` en READY |
| F6 | Excel vacío | Hojas no reconocidas | P1 | Fallback spreadsheet |
| F7 | FIFO multi-cuenta | Agrupa solo por ticker | P2 | Documentado; futuro account key |
| F8 | Dedupe sin Position ID | IDs aleatorios en ready | P2 | `externalId` → id estable |
| F9 | FOMO/AXIOM en producción | Esqueletos en selector | P2 | Badge beta + tooltip |
| F10 | Scripts test rotos | tsx sin alias Vitest | P1 | Tests vitest `*.verify.test.ts` |

---

## Cobertura de tests

| Suite | Contenido |
|-------|-----------|
| `engine.verify.test.ts` | Números, FIFO, XTB history |
| `readyTrades.test.ts` | XTB Closed/Open, sin Type |
| `adapters.ib.test.ts` / `degiro.test.ts` | Fixtures sintéticos |
| `engine.auto-detect.test.ts` | Scoring IB vs XTB |
| `importFeedback.test.ts` | Mensajes cero filas / duplicados |
| `tradeMapper.verify.test.ts` / `xlsx.verify.test.ts` | Ex scripts verify |

```bash
npm run test:import
npm run test:mapper
npm run test:xlsx
npm run test -- src/lib/import/
```

---

## Backlog (criterios de aceptación)

### P0
- Con filas de datos y 0 trades parseados: toast con bróker detectado, muestra de columnas y sugerencia de export.
- Duplicados vs parseo vacío: mensajes distintos.

### P1
- AUTO: IB gana sobre XTB cuando hay columnas IB exclusivas.
- `test:mapper` y `test:xlsx` pasan en CI local.

### P2
- IDs estables desde `externalId` (XTB Position ID).
- FOMO/AXIOM marcados beta en Ajustes.

### P3 (futuro)
- Log dev estructurado; panel `lastResult` expandible (parcial: resumen en Settings).

---

## Checklist QA manual

- [ ] AUTO: XTB xlsx Closed + Open → N cerradas + M abiertas
- [ ] AUTO: IB Activity → round-trips FIFO
- [ ] AUTO: DEGIRO `;` → fills OK
- [ ] Bróker incorrecto forzado → mensaje accionable
- [ ] Reimport mismo archivo → «duplicadas», no «sin ejecuciones»
- [ ] Excel corrupto / >25 MB
- [ ] Open Positions sin Type → aviso específico
- [ ] CSV diario (`csvToTrades`) vs bróker — rutas distintas en Ajustes
- [ ] Electron + web: import y toasts

---

## English summary

Broker import flows through adapters (XTB ready positions vs FIFO for IB/DEGIRO), maps to trades, dedupes, merges. Main risks were silent row skips, weak AUTO detection, and unclear zero-import UX. Fixes add scored AUTO detection, actionable errors, stable IDs from broker position keys, vitest coverage, and beta labels for skeleton brokers.
