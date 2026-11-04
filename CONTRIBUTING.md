# Contributing to Pantrybook

Thanks for helping pantries spend less time on paperwork. Contributions of every size are welcome:
bug reports, ideas from people who run distributions, translations, docs and code.

## Ground rules

- **Volunteers first.** Every screen should make sense to someone on their first shift. Prefer fewer
  options, plain words and big touch targets.
- **Offline is a feature, not an afterthought.** Anything a volunteer does at check-in must work with
  no connection. Server-only features (reports, admin) should say clearly when they need one.
- **Privacy by default.** Collect only what pantries need, never send data anywhere but the pantry's
  own server, and never log personal details.
- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

```bash
git clone https://github.com/lobojoel2003/Pantrybook.git
cd Pantrybook
npm install
npm run seed:demo   # fictional data; sign in as admin / pantrybook
npm run dev
```

You need Node.js 22.18 or newer.

## Before you open a pull request

```bash
npm run format      # Prettier
npm run check       # svelte-check + TypeScript
npm run lint        # Prettier check + ESLint
npm test            # unit tests
npm run test:e2e    # end-to-end tests (run `npx playwright install chromium` once)
```

CI runs all of these on every pull request.

- Add or update tests for behaviour changes. Pure logic (limits, dates, search, CSV) belongs in
  `src/lib/shared` with Vitest tests next to it; user flows belong in `tests/e2e`.
- Database changes go in a **new** entry at the end of `src/lib/server/migrations.ts`. Never edit a
  released migration.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` describing the change for pantry staff.
- Keep pull requests focused; one feature or fix each.

## Commit messages

Use short, imperative subjects, optionally with a [Conventional Commits](https://www.conventionalcommits.org/)
prefix: `feat: print a weekly sign-in sheet`, `fix: count seniors in ZIP report`.

## Releases

Maintainers release with `npm version <patch|minor|major>` and `git push --follow-tags`, or by
running the **Release** workflow from the Actions tab after bumping the version on `main`. See
[Versioning and releases](README.md#versioning-and-releases) in the README.
