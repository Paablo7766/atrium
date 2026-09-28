# Technical decisions (Atrium)

Short log of product and architecture choices so they do not need to be re-argued every release. See also `docs/en/ARCHITECTURE.md` and `docs/BACKUP_ARCHITECTURE.md`.

---

## `CLOUD_SYNC_FEATURE_ENABLED = false` (Supabase multi-device sync off)

**Decision:** Keep cloud sync **disabled in product** (`src/lib/cloudSyncPref.ts`). The Supabase + E2E blob pipeline remains in the tree for reference, but users cannot turn it on from onboarding or Settings.

**Why:**

- **Complexity vs solo maintenance:** Multi-device sync needs conflict UI, server-side versioning/CAS, migration discipline, and ongoing Supabase ops — too much surface for a single maintainer alongside core journal quality.
- **Product direction:** Atrium is **local-first / BYO storage**. Automatic **folder backup** (encrypted `.atrium-backup` in a path the user chooses — OneDrive, Drive folder, etc.) matches that story better than an Atrium-operated sync backend.
- **Re-enable bar:** Do not flip the flag without (1) conflict resolution UI, (2) version/CAS on the server, (3) migration `006` applied and tested — as noted in `cloudSyncPref.ts`.

---

## `FOLDER_BACKUP_UI_ENABLED` — gated until manual QA

**Decision:** Folder auto-backup is implemented (Electron + Chrome/Edge File System Access API on web), but **broad exposure to beta testers** waits on my **manual QA** on:

- Windows desktop (Electron): pick folder, debounced writes, atomic replace, restore path
- Web: Chrome and Edge — permission persistence, write failures, no silent overwrite of an existing backup

**Why:** The flag (`src/lib/featureFlags.ts`) exists so the UI and backend can be **fully off** (not just hidden). Release 1.1.0 shipped with it off to avoid silent writes in cloud-synced folders before the flow was validated (`docs/BACKUP_ARCHITECTURE.md`). Turning it on for everyone without that pass risks bad backups and support load.

**Note:** The repo may temporarily have the flag `true` while I dogfood; treat “ready for all testers” as **QA checklist green**, not only the boolean in git.

---

## Broker import: IB, DEGIRO, XTB (partial) first

**Decision:** Prioritize adapters that match **real exports from early users** and two grouping models already in the engine:

| Broker | Role in pipeline | Maturity |
|--------|------------------|----------|
| **Interactive Brokers** | FIFO fills (`Activity` / Flex-style) | Solid |
| **DEGIRO** | FIFO fills (account transactions, EU formats) | Solid |
| **XTB** | Ready positions (xStation Closed/Open) + FIFO fallback | Production; **partial** — Open/history edge cases, multi-sheet XLSX, and UX around zero-row imports still matter |

**Why this order:** Covers a large share of EU/desktop journal users; **AUTO** header scoring (`detectBroker`) is tuned so IB/DEGIRO/XTB do not steal each other’s exports. FOMO/AXIOM stay **beta skeletons** until real files prove the mapping.

**On the radar, not prioritized yet:**

- **FOMO / AXIOM** — adapters exist but need real samples and beta labeling (see `docs/AUDIT_BROKER_IMPORT.md`).
- **Other retail brokers** (e.g. Trading 212, Plus500, eToro) — requested informally; no adapter until a consistent export format and test fixtures exist. Until then: manual trades or generic paths documented as non-broker CSV.

**Do not** conflate **Atrium journal CSV export/import** with **broker statement import** — separate actions in Settings.

---

## Legacy trades: fees on partial closes (pre–v1.2.0-beta.5)

**Decision:** **No automatic data migration** for now.

**Context:** Before broker import prorated `fees` / `pnlOverride` across CLOSED + OPEN legs on partial closes, some imported trades may have **all fees on the closed leg** and **zero on the open remainder**. That skews unrealized P&L until those rows are re-imported or edited.

**Future work:** One-off migration (detect `partial-close` / `open-remainder` tag pairs, split `fees` and optional `pnlOverride` by quantity ratio) or document “re-import from broker” as the fix path.

---

## PostHog Cloud **EU** for optional product analytics

**Decision:** Optional anonymous telemetry in production builds uses **PostHog** with default host **`https://eu.i.posthog.com`** (`src/lib/productAnalytics.ts`, overridable via `VITE_POSTHOG_HOST`).

**Why PostHog (and EU region):**

- **Data minimization:** Only explicit events (e.g. `app_session_start` with platform, app version, OS family). **No** autocapture, **no** session replay, **no** trade or journal content — aligned with README “private by design”.
- **EU residency:** PostHog Cloud EU keeps analytics processing in-region, which fits a EU-facing app and GDPR-conscious users better than default US analytics stacks.
- **Pragmatic vs alternatives:** Google Analytics / full product suites are heavier and harder to keep privacy-tight; self-hosted analytics is another ops burden for a solo dev. PostHog is off entirely in dev and when `VITE_POSTHOG_KEY` is unset at build time.

---

*Last updated: 2026-03 — amend this file when a decision changes, not only when code changes.*
