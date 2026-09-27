# Novedades

Las versiones siguen `package.json`. Más reciente arriba.

## 1.2.0-beta.1 — 2026-09-27

- [Nuevo] La contraseña maestra se pide en la hero de bienvenida, no en una pantalla de bloqueo
- [Corrección] Logos de tickers: un fallo de API key ya no se guarda como «sin logo» y el error se ve en consola
- [Mejora] Novedades: solo la versión actual, y un localStorage desfasado no oculta la tarjeta
- [Mejora] Dashboard: la tabla reciente y el ranking de estrategias quedan a la misma altura

## 1.1.3 — 2026-09-27

- [Corrección] El instalado de Windows encuentra `better_sqlite3.node` en `app.asar.unpacked` aunque `isPackaged` falle

## 1.1.2 — 2026-09-27

- [Corrección] Notas de actualización: se muestran como texto, no como HTML de GitHub
- [Corrección] El onboarding no salta la contraseña si falta `journal.db` (evita «Contraseña inválida» al ensamblar)
- [Corrección] Un `.crypto-meta` o `journal.db` a medias ya no bloquea «Continuar» con «No se pudo inicializar la base de datos cifrada»

## 1.1.1 — 2026-09-27

- [Corrección] Creación fiable de `journal.db` cifrado tras configurar la contraseña maestra en instalaciones nuevas
- [Corrección] Verificación de contraseña con HMAC en `.crypto-meta` (ya no se confunde con fallos de la base de datos)
- [Corrección] Aviso de actualización visible también con el diario bloqueado o en onboarding

## 1.1.0 — 2026-09-26

- [Nuevo] Envío de sugerencias y errores con captura opcional
- [Nuevo] Versión web/PWA con datos cifrados en el navegador
- [Mejora] Calendario más limpio: P&L del mes, celdas y panel del día
- [Mejora] Dashboard: tabla reciente y ranking de estrategias alineados

## 1.0.0 — 2026-09-20

- Primera versión pública del diario
