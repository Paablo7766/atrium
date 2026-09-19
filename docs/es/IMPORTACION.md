# Importación desde brokers

Atrium importa extractos **CSV, TXT, XLSX y XLS**, normaliza ejecuciones, las agrupa en operaciones, evita duplicados y opcionalmente sincroniza con Supabase.

Pipeline: `src/lib/import/` → parsear → adapters → agrupar → mapear → dedupe → UI / nube.

---

## Brokers soportados

| Broker | Estado | Notas |
|--------|--------|--------|
| **AUTO** | Recomendado | Detecta cabeceras y elige el adapter |
| **XTB** | Producción | Closed Positions (xStation EN/ES); apertura+cierre en la misma fila |
| **Interactive Brokers** | Sólido | Activity / Flex; alias `IB`, `IBKR` |
| **DEGIRO** | Sólido | Cuenta/transacciones; fechas día-primero; decimales con coma |
| **Fomo** | Esqueleto | Orientado a crypto — afinar con sample real |
| **Axiom** | Esqueleto | Mapeo genérico Instrument/Side |

---

## Cómo importar

1. Abre **Ajustes → Importar**  
2. Elige broker (**AUTO** si no estás seguro)  
3. Arrastra o selecciona `.csv` / `.xlsx`  
4. Revisa cuántas se importaron / cuántos duplicados se omitieron  
5. Las operaciones aparecen en **Trades** y alimentan **Dashboard / Analítica / Calendario**

---

## Qué se mapea

Campos típicos: símbolo, lado, hora de apertura/cierre, tamaño, precios, comisiones, swap, P&L, divisa.

Los campos premium de la UI (estrategia, emoción, checklist…) se rellenan a mano después de importar.

---

## Consejos

- Prefiere el export de **posiciones cerradas / activity** del broker  
- Un archivo por libro de cuenta cuando sea posible  
- Reimportar el mismo archivo es seguro — el **dedupe** omite ejecuciones conocidas  
- Helpers CSV genéricos también en `src/lib/csv.ts`  

---

## Tests

```bash
npm run test:import
npm run test:mapper
npm run test:xlsx
```
