# Funciones

Catálogo completo de herramientas de **Atrium Journal**.

---

## 1. Dashboard

Centro de mando de tu libro de cuenta.

- **Curva de equity** — balance en el tiempo (incluye depósitos y retiros)  
- **Gráfico de flujo** — áreas acumuladas de ganancias vs pérdidas  
- **Barras de P&L diario** — rendimiento día a día  
- **KPIs** — hoy, 7 días, win rate, factor de beneficio, mejor día, drawdown máximo  
- **Operaciones recientes** — últimos fills con dirección y P&L  
- **Ranking de estrategias** — qué setups pagan  
- **Alerta de pérdida diaria** — aviso de la mesa de riesgo  
- **Compartir semana / mes** — tarjeta de rendimiento en un clic  
- **Datos demo** — explora la UI con operaciones de ejemplo  

---

## 2. Operaciones (Trades)

Gestión completa del libro.

- Filtros: wins / losses / abiertas, mercado, estrategia  
- Búsqueda y ordenación  
- Filas expandibles con detalle  
- Editar · duplicar · eliminar  
- Alta manual con **Trade Modal** (formulario simple o premium)  
- Campos premium: SL/TP, comisiones, R, estrategia, tags, emoción, rating, checklist del playbook, errores  
- Exportación CSV  
- Compartir tarjeta de una operación  

---

## 3. Calendario

Mes visual de tu trading.

- Intensidad por **P&L** o **eventos del diario**  
- Compartir columna de semana  
- Panel del día: operaciones + notas de ánimo  
- Etiquetas de mes según idioma (ES/EN)  

---

## 4. Analítica

Medición profunda de la ventaja (`src/lib/stats.ts` + Recharts).

| Bloque | Métricas |
|--------|----------|
| Resumen | Win rate, PF, expectativa, estilo Sharpe, media win/loss |
| Origen del P&L | De dónde salen beneficios y pérdidas |
| Por categoría | Estrategia, mercado, dirección (long/short) |
| Tiempo | Día de la semana, hora, estacionalidad mensual |
| Riesgo | Curva de drawdown, rachas |
| Psicología | Emociones, estrellas, etiquetas de error |
| Distribución en R | Histograma de R-múltiples |

---

## 5. Diario psicológico

- Notas diarias con **ánimo 1–5**  
- Autoguardado al escribir  
- Búsqueda de entradas  
- Contexto: P&L del día junto a la nota  

---

## 6. Ajustes y herramientas

### Cuentas
Libros live · demo · prop · paper con colores. Cambio desde la barra lateral.

### Mesa de riesgo
% de riesgo por trade, límite de pérdida diaria, mercados preferidos, inicio de semana.

### Playbook
Setups con checklist — enlazados desde el formulario de operación.

### Datos
- **Importación CSV / XLSX** (ver [IMPORTACION.md](./IMPORTACION.md))  
- Exportar / importar JSON del diario  
- **Copias de seguridad** automáticas en escritorio (últimas 10, ~cada 10 min)  
- Restaurar desde `.bak` o backup fechado  

### Avanzado
Idioma (ES/EN), avatar, reiniciar onboarding, cargar demo, borrar datos.

---

## 7. Tarjetas para compartir

Tarjetas 1600×900 para redes / Discord / mentoría.

| Alcance | Temas |
|---------|--------|
| Trade · Semana · Mes | **Orbit** · **Editorial** · **Signal** · **Folio** |

---

## 8. Auth y nube (opcional)

Si configuras `VITE_SUPABASE_*`:

- Magic link por email  
- Google OAuth  
- Sync de operaciones a Postgres con RLS  

Sin variables → **modo solo local** (sin pantalla de login). Datos en `journal-data.json` (Electron) o `localStorage`.

---

## 9. Logos de activos

Iconos de ticker locales + API opcional de **Financial Modeling Prep**.

---

## 10. Onboarding y tour

Asistente de primer uso + tour guiado del producto.
