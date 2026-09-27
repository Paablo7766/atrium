# What's new

Versions follow `package.json`. Newest first.

## 1.2.0-beta.1 — 2026-09-27

- [New] Master password unlock lives on the welcome hero instead of a lock screen
- [Fix] Ticker logos: an API key failure is no longer cached as “no logo” and is logged to the console
- [Improvement] What's new shows only the current version; a stale localStorage entry cannot hide the card
- [Improvement] Dashboard: recent table and strategy ranking stretch to the same height

## 1.1.3 — 2026-09-27

- [Fix] Windows installer finds `better_sqlite3.node` in `app.asar.unpacked` even if `isPackaged` is wrong

## 1.1.2 — 2026-09-27

- [Fix] Update notes render as plain text instead of raw GitHub HTML
- [Fix] Onboarding no longer skips the password step when `journal.db` is missing (avoids «Invalid password» while assembling)
- [Fix] Leftover `.crypto-meta` or a half-written `journal.db` no longer blocks Continue with a cipher init error

## 1.1.1 — 2026-09-27

- [Fix] Reliable encrypted `journal.db` creation after master password setup on fresh installs
- [Fix] Password verification via HMAC in `.crypto-meta` (no longer confused with database errors)
- [Fix] Update notice shown while the journal is locked or during onboarding

## 1.1.0 — 2026-09-26

- [New] Send suggestions and bug reports with an optional screenshot
- [New] Web/PWA version with encrypted data in the browser
- [Improvement] Cleaner calendar: monthly P&L, cells, and day panel
- [Improvement] Dashboard: recent table and strategy ranking aligned

## 1.0.0 — 2026-09-20

- First public release of the journal
