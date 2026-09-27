# Fixtures de importación broker

## Sintéticos (en git)

- `ib-activity.csv` — Activity IB mínima
- `degiro-transactions.csv` — transacciones DEGIRO EU
- `xtb-operaciones-2025.sample.csv` — export real XTB (cuenta anonimizada, 2 closed)

Los tests en `src/lib/import/*.test.ts` los usan siempre.

## Tus exports reales (no commitear)

Copia aquí archivos **anonimizados** (5–50 filas bastan):

```
src/lib/import/__fixtures__/user/
  xtb-closed.xlsx
  ib-activity.csv
  degiro.csv
```

Esta carpeta está en `.gitignore`. No hace falta que sean exports “oficiales” ni la última versión del bróker: sirven para ver si el parser **reconoce cabeceras** y produce trades.

### Anonimizar antes de copiar

- Sustituye nombre de cuenta, email, ID de cliente
- Puedes dejar símbolos, fechas, precios y cantidades (o redondearlos)
- Si hay una sola fila con datos personales, bórrala

### Probar en local

```bash
npm run test:user-fixtures
```

O con Vitest directo:

```bash
npx vitest run src/lib/import/user-samples.integration.test.ts
```

Si no hay archivos en `user/`, el test se omite (skip).

### Cuando quieras fijar un caso en CI

1. Anonimiza y recorta a pocas filas
2. Renombra a `real-<broker>-<descripcion>.csv` en esta carpeta (no en `user/`)
3. Añade un test dedicado (como `adapters.ib.test.ts`)

Indica en el PR: bróker, idioma del export, extensión, y si es Closed / Activity / Transacciones.
