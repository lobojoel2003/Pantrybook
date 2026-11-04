# Changelog

All notable changes to Pantrybook are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every build also carries a
build number (the commit count) and the commit it was built from, shown under Account and at
`/api/health`.

## [Unreleased]

## [1.0.0] - 2026-11-04

The first release: everything a small pantry needs for distribution day, free and self-hosted.

### Added

- **Check-in in a few taps.** Search by name, phone digits or household number (accent- and
  typo-tolerant prefix search, keyboard friendly), see each program's eligibility at a glance, record
  the amount given, and undo mistakes from the confirmation message.
- **Household registration** with only two required fields (a name and household size), children /
  adults / seniors counts, contact details, language, dietary needs, notes, and self-declared income
  eligibility (TEFAP). Live duplicate warnings by phone, address or name.
- **Visit limits per program**: per day, calendar week (Sunday or Monday start), calendar month,
  calendar year, or rolling N days. Volunteers see "2 of 4 this month" and the next eligible date.
  Over-limit check-ins can be allowed for anyone, coordinators only, or nobody, and always need a
  reason.
- **Works offline.** The app installs as a PWA, keeps households and recent visits on the device, and
  queues changes while the connection is down. Changes upload automatically when it returns; the
  server re-checks limits and flags any over-limit visits recorded offline.
- **Reports for funders**: unduplicated households and individuals, age groups, duplicated
  (per-visit) individuals, first-time households, amounts distributed per program, ZIP code
  breakdown, visits per day or month chart, and an over-limit report with reasons. Download a summary
  CSV or every visit as CSV, or print.
- **Daily visit log** that doubles as a printable sign-in sheet.
- **Printable intake form**, blank or filled in for a household, for days without a device or power.
- **Annual re-certification reminders**: volunteers are prompted to confirm household details after a
  configurable number of months.
- **Spreadsheet import** from CSV (Excel, Google Sheets) with automatic column matching, preview and
  duplicate skipping; **CSV exports** of households and visits.
- **Accounts and roles**: coordinators (admins) and volunteers; first-run setup; password changes and
  resets; deactivating accounts signs them out everywhere; admin activity log.
- **Privacy tools**: erase a household's personal details while keeping anonymous totals; devices wipe
  their local copy on sign-out.
- **One-file backups** from the Admin screen and the `backup` CLI command; automatic database
  migrations on start.
- **Demo mode** (`PANTRYBOOK_DEMO=true`) with a fictional pantry of 160 households and six months of
  visits that resets itself daily.
- **Admin CLI** (`node scripts/cli.ts`): `info`, `create-admin`, `reset-password`, `backup`,
  `seed-demo`.
- **Deployment**: multi-arch Docker image (amd64, arm64) on GHCR, Docker Compose with optional
  automatic HTTPS (Caddy), Render Blueprint, Fly.io config, and a plain Node.js bundle.
- **Security**: scrypt password hashing, hashed session tokens with sliding expiry, login throttling,
  JSON-only API (CSRF protection), strict Content Security Policy and security headers, formula-safe
  CSV exports.
- **Quality**: unit tests (Vitest), end-to-end tests including offline check-in and sync
  (Playwright), CI on Node 22 and 24, CodeQL, Dependabot, and tagged releases with checksums, SBOM and
  signed build provenance.

[Unreleased]: https://github.com/lobojoel2003/Pantrybook/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lobojoel2003/Pantrybook/releases/tag/v1.0.0
