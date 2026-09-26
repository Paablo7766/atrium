/**
 * Interruptores de UI (el código backend puede seguir presente).
 * Pon a true solo lo que quieras mostrar de nuevo.
 */

/** Copia automática en carpeta sincronizada (Electron) + panel móvil / restauración desde nube. */
export const FOLDER_BACKUP_UI_ENABLED = false

/** Selector Google Drive (VITE_GOOGLE_*); independiente del OAuth de login. */
export const GOOGLE_DRIVE_PICKER_UI_ENABLED = false

/** Compartir → Atrium (PWA) y saltar a Ajustes con copia pendiente. */
export const SHARE_RESTORE_BOOTSTRAP_ENABLED = false

/** Réplica Litestream en Ajustes › Datos. */
export const SHOW_LITESTREAM_PANEL = false

/** Ubicación, .bak locales, CSV/JSON plano, etc. (no es sync entre dispositivos). */
export const SHOW_EXTENDED_DATA_PANELS = true
