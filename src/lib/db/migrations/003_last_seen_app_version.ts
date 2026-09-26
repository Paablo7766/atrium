/** SQL for migration 003 — last app version whose changelog the user already saw. */
export const SQL_003_LAST_SEEN_APP_VERSION = `
ALTER TABLE settings ADD COLUMN last_seen_app_version TEXT;
`
