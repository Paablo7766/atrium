# Novedades

Las versiones siguen `package.json`. Más reciente arriba.

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
