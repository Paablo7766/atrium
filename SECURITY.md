# Security

Atrium is a **local-first** trading journal: your trades and notes stay on your machine unless you explicitly turn on optional backup or sync features. Even so, please report security issues responsibly so users are not put at risk before a fix is ready.

## Reporting a vulnerability

**Do not open a public GitHub issue** for security problems (exploits, key handling bugs, backup bypasses, webhook abuse, etc.).

Instead, contact me **in private** using one of these channels:

1. **In-app feedback (preferred)** — In Atrium: **Settings → Send suggestion or bug report** (or **Send feedback** in the sidebar). Choose **Bug**, describe the issue, and add a line such as `security / responsible disclosure` so it is routed like other beta reports (Discord). Do **not** paste live trading data or screenshots with account numbers.
2. **GitHub Security Advisories** — [Open a private report](https://github.com/Paablo7766/atrium/security/advisories/new) on this repository if you have a GitHub account.

If you already have my personal contact email, you may use that instead.

## What to include

- A clear description of the issue and impact
- Steps to reproduce (desktop vs web, version if known)
- Proof-of-concept if you have one (keep it minimal)

## What to expect

This project is maintained by **one person in spare time**. I will acknowledge reports when I can, but **response and fix timelines may be slow**. I will coordinate public disclosure with you when a fix is released (or explain if a fix is not feasible).

## Scope (rough guide)

In scope: Atrium application code, Electron shell, encrypted local storage, backup/sync paths documented in this repo, and the small Vercel/Edge surfaces used for feedback and optional APIs.

Out of scope: third-party brokers, your OS, misconfigured `.env` secrets on your machine, and social engineering.

Thank you for helping keep users safe.
