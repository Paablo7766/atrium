/** SQL for migration 002 — persist multi-device sync flags in settings. */
export const SQL_002_CLOUD_SYNC_SETTINGS = `
ALTER TABLE settings ADD COLUMN cloud_sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN last_cloud_sync_at TEXT;
`
