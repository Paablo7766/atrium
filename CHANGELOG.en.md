# What's new

Versions follow `package.json`. Newest first.

## 1.2.0-beta.6 — 2026-09-28

- [Improvement] Top app bar navigation: more room for the journal; Ctrl+B focuses trade search
- [Improvement] Web APIs (logos, quotes, feedback) with origin allowlist and tighter CSP
- [Improvement] Desktop save returns clear errors when IPC or journal data is invalid
- [Improvement] Refined journal persistence and web migrations; partial-close fees documented
- [Improvement] README, SECURITY.md, and DECISIONS.md for project expectations and security reports

## 1.2.0-beta.5 — 2026-09-27

- [Improvement] More reliable broker import: Auto scoring, clearer empty/duplicate messages, summary in Settings
- [Improvement] Import tests (XTB/IB/DEGIRO), anonymized XTB fixture, CI for mapper/xlsx
- [Improvement] Journal persistence, web backup, and encrypted sync (Supabase migration 006)
- [Improvement] Onboarding with master password; logo/quotes APIs; CI workflow

## 1.2.0-beta.4 — 2026-09-27

- [Fix] Trades persist immediately and when you hide or close the tab (web)
- [Fix] After onboarding, the journal is saved in the browser too
- [Improvement] Initial setup only uses a master password

## 1.2.0-beta.3 — 2026-09-27

- [Improvement] The update notice is clearer and dismisses with Got it
- [Fix] After download, the journal is no longer blocked: install on quit or restart when you like

## 1.2.0-beta.2 — 2026-09-27

- [New] When you update, Atrium quits, installs on its own, and reopens
- [Improvement] What's new matches the history card: only this version, in plain language, with pictures

## 1.2.0-beta.1 — 2026-09-27

- [New] You open the journal in one step: the password is asked on welcome
- [Improvement] Asset logos stay sharp and no longer go blank
- [Improvement] On the overview, the recent table and strategy ranking share the same height

## 1.1.3 — 2026-09-27

- [Fix] After installing on Windows, Atrium opens as usual

## 1.1.2 — 2026-09-27

- [Fix] Creating the journal is more reliable if setup was interrupted

## 1.1.1 — 2026-09-27

- [Fix] The first time, the journal is created cleanly when you set a password

## 1.1.0 — 2026-09-26

- [New] Send an idea or a bug from Atrium, with a screenshot if you want
- [New] You can also use the journal in the browser
- [Improvement] A clearer calendar: month P&L and the detail of each day

## 1.0.0 — 2026-09-20

- First public release of the journal
