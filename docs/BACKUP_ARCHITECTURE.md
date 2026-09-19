# Arquitectura de copias de seguridad — Atrium

Este documento describe cómo Atrium protege los datos del usuario **sin custodia por parte de Atrium**. Los datos nunca salen del dispositivo del usuario salvo que él elija explícitamente una carpeta sincronizada (Dropbox, Google Drive, iCloud, etc.) en su propio equipo.

## Principio: cero custodia

| Aspecto | Comportamiento |
|--------|----------------|
| **Almacenamiento primario** | `{userData}/journal.db` en el disco local del usuario |
| **Cifrado** | SQLCipher (AES-256) antes de cualquier réplica |
| **Réplica continua** | Litestream, proceso local gestionado por Electron |
| **Destino de réplica** | Elegido por el usuario: carpeta local predeterminada o carpeta externa |
| **Servidores Atrium** | No reciben, almacenan ni pueden descifrar el diario |
| **Clave de cifrado** | Derivada de contraseña maestra (PBKDF2) o almacén seguro del SO; nunca se transmite |

Atrium **no opera** un backend de backup. No existe una cuenta en la nube de Atrium que contenga el diario. La responsabilidad y el control del destino de las copias recae exclusivamente en el usuario.

## Capas de protección

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer (React) — Settings › Copias de seguridad          │
│  · Estado réplica · Elegir carpeta · Restaurar             │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────▼──────────────────────────────────┐
│  Electron main (electron/main.ts)                           │
│  · spawn Litestream · diálogo nativo · restore              │
└──────────────┬─────────────────────────────┬────────────────┘
               │                             │
┌──────────────▼──────────────┐  ┌───────────▼────────────────┐
│  journal.db (SQLCipher)      │  │  Litestream (child process) │
│  WAL + better-sqlite3        │  │  litestream replicate       │
└──────────────┬──────────────┘  └───────────┬────────────────┘
               │                             │
               │         réplica continua    │
               └──────────────┬──────────────┘
                              ▼
               ┌──────────────────────────────┐
               │  Destino elegido por usuario │
               │  · Default: userData/backups/│
               │    litestream/               │
               │  · Opcional: Dropbox/Drive…  │
               └──────────────────────────────┘
```

## 1. Base de datos cifrada (SQLCipher)

- **Archivo:** `{userData}/journal.db` (nombre constante: `DB_FILENAME` en `src/lib/db/schema.ts`).
- **Motor:** `better-sqlite3-multiple-ciphers` con SQLCipher legacy mode 4.
- **Clave:** 256 000 iteraciones PBKDF2 (modo contraseña) o clave aleatoria en `safeStorage` del SO (modo almacén seguro).
- **Modo WAL:** SQLite escribe en WAL; Litestream captura cambios incrementales de forma segura para SQLite.

El archivo en disco **ya está cifrado**. Cualquier copia — incluida la réplica Litestream — es opaca sin la clave del usuario.

## 2. Copias locales rotativas (sin Litestream)

Además de Litestream, `src/lib/db/service.ts` mantiene:

| Tipo | Ruta | Frecuencia |
|------|------|------------|
| Inmediata | `journal.db.bak` | Cada guardado |
| Fechada | `backups/journal-{timestamp}.db` | Como mucho cada 10 min |
| Retención | Máximo 10 copias fechadas | Rotación automática |

Estas copias son **archivos completos** del `.db` cifrado. Restaurables desde Ajustes › Datos › Copias automáticas.

## 3. Réplica continua (Litestream)

### Binario empaquetado

- Ubicación en desarrollo: `electron/resources/litestream/{platform}/`
- Ubicación empaquetada: `{process.resourcesPath}/litestream/{platform}/`
- **No** se requiere instalación manual por el usuario.
- Descarga para builds: `npm run download:litestream`

### Proceso gestionado

`electron/litestream/manager.ts`:

1. Resuelve el binario según plataforma (`win32`, `darwin-arm64`, …).
2. Genera `{userData}/litestream.yml` en tiempo de ejecución (no hardcodeado).
3. Ejecuta `litestream replicate -config …` con `child_process.spawn`.
4. Detiene el proceso al cerrar la app (`stopLitestream` → `shutdownJournalDb`).

### Configuración dinámica

Ejemplo generado (rutas reales del usuario):

```yaml
dbs:
  - path: C:/Users/.../AppData/Roaming/Atrium/journal.db
    replica:
      type: file
      path: C:/Users/.../AppData/Roaming/Atrium/backups/litestream
      sync-interval: 1s
```

La preferencia de destino personalizado se guarda en `{userData}/.litestream-settings.json` (solo ruta, sin secretos).

### Destino predeterminado vs personalizado

| Modo | Ruta |
|------|------|
| Predeterminado | `{userData}/backups/litestream/` |
| Personalizado | Carpeta elegida con diálogo nativo (`dialog.showOpenDialog`) |

Si el usuario apunta a su carpeta de Dropbox/Google Drive **ya sincronizada en local**, el cliente de sync del SO sube los fragmentos cifrados. Atrium no implementa ni controla esa sincronización.

## 4. Interfaz de usuario

**Ajustes › Datos › Copias de seguridad** (`src/pages/Settings.tsx`):

- Estado: réplica activa / inactiva
- Última sincronización (mtime más reciente en carpeta réplica)
- Ruta destino y acciones: elegir carpeta, restaurar predeterminado, abrir carpeta
- Restauración manual desde réplica Litestream (con confirmación)

## 5. Restauración

### Desde copias automáticas (`.bak` / `backups/`)

`restoreJournalBackup()` — copia el archivo de backup sobre `journal.db` tras archivar el actual.

### Desde réplica Litestream

1. Detener Litestream y cerrar SQLite.
2. Copia de seguridad: `journal.db.pre-litestream-restore`.
3. `litestream restore -o journal.db {replicaPath}`.
4. Reabrir base de datos y reiniciar Litestream.

En ambos casos el archivo restaurado sigue cifrado; el usuario debe poder desbloquearlo con su contraseña o almacén seguro habitual.

## 6. Lo que Atrium no puede hacer

- **Leer** el contenido del diario en servidores propios (no hay ingestión).
- **Recuperar** la contraseña maestra del usuario.
- **Acceder** a la réplica en la nube del usuario (no hay credenciales de Dropbox/Drive en Atrium).
- **Descifrar** `journal.db` o su réplica sin la clave local del usuario.

## 7. Recomendaciones al usuario

1. Mantener activa la réplica Litestream (estado «Réplica activa» en Ajustes).
2. Opcionalmente, elegir una carpeta sincronizada por el SO para redundancia off-device bajo su control.
3. Guardar de forma segura la contraseña maestra si usa cifrado por contraseña.
4. Probar ocasionalmente la restauración en un entorno de prueba.

## Referencias en el código

| Componente | Archivo |
|------------|---------|
| Gestor Litestream | `electron/litestream/manager.ts` |
| IPC / ciclo de vida | `electron/main.ts` |
| Bridge renderer | `electron/preload.ts`, `src/lib/db/client.ts` |
| UI | `src/pages/Settings.tsx` |
| Cifrado SQLCipher | `src/lib/db/connection.ts`, `src/lib/crypto/keyManagerMain.ts` |
| Copias rotativas | `src/lib/db/service.ts` |
| Descarga binarios | `scripts/download-litestream.mts` |

---

*Documento técnico para auditoría y cumplimiento. Versión del esquema: SQLite cifrado + Litestream embebido.*
