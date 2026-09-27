# Importación desde brokers

Atrium importa extractos **CSV, TXT, XLSX y XLS**, normaliza ejecuciones, las agrupa en operaciones y evita duplicados. Todo se guarda en el diario **SQLite cifrado local**. El sync en la nube es opcional y solo corre si activas el sync E2E multi-dispositivo en Ajustes.

Pipeline: `src/lib/import/` → parsear → adapters → agrupar → mapear → dedupe → BD local (snapshot cifrado en la nube opcional).

---

## Brokers soportados

| Broker | Estado | Notas |
|--------|--------|--------|
| **AUTO** | Recomendado | Detecta cabeceras con puntuación (no solo orden fijo) |
| **XTB** | Producción | Closed Positions (xStation EN/ES); apertura+cierre en la misma fila |
| **Interactive Brokers** | Sólido | Activity / Flex; alias `IB`, `IBKR` |
| **DEGIRO** | Sólido | Cuenta/transacciones; fechas día-primero; decimales con coma |
| **Fomo** | Beta | Orientado a crypto — adaptador en prueba |
| **Axiom** | Beta | Mapeo genérico Instrument/Side — en prueba |

---

## Cómo importar

1. Abre **Ajustes → Importar**  
2. Elige broker (**AUTO** si no estás seguro)  
3. Arrastra o selecciona `.csv` / `.xlsx`  
4. Revisa el resumen bajo «Bróker» en Ajustes (último import) y los toasts  
5. Si importa 0: el mensaje indica bróker detectado, columnas y tipo de export esperado  
6. **CSV de diario** (export Atrium) ≠ **CSV de bróker** — son dos botones distintos en Ajustes  
7. Las operaciones aparecen en **Trades** y alimentan **Dashboard / Analítica / Calendario**

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
npm run test -- src/lib/import/
```

Auditoría detallada: [`docs/AUDIT_BROKER_IMPORT.md`](../AUDIT_BROKER_IMPORT.md).

### Probar con tus exports (aunque no sean oficiales)

1. Anonimiza un CSV/XLSX (quita nombre de cuenta; 5–50 filas valen).  
2. Cópialo en `src/lib/import/__fixtures__/user/` (no se commitea).  
3. Ejecuta `npm run test:user-fixtures` o importa con **Auto** en Ajustes.

Si el bróker cambió columnas, el resumen bajo «Último import» muestra cabeceras detectadas y avisos.
