# E2E tests (Playwright)

End-to-end tests that exercise the **real production artifact** — the built React
SPA served by the Firebase Hosting emulator at `http://localhost:5050`, with
`/api/*` and `/:code` handled by the Cloud Function (exactly what deploys).

Both layers are covered from one runner:

- **API** (`tests/api/`) — Playwright's built-in `request` fixture: shorten
  (valid / invalid / duplicate-alias / reserved), 302 redirect + `Location`,
  click-count increment, referrer breakdown, stats 404.
- **UI** (`tests/ui/`) — a `DashboardPage` Page Object: load the dashboard,
  create a link via the form, see it in the table, open its analytics; plus a
  combined **UI + API** flow (create in the UI → drive redirects via `request` →
  reload → assert the click count rose).

## Run it

```bash
# from the repo root — one-time: install Playwright + the Chromium browser
npm run e2e:install

# run everything (Playwright builds the app + boots the emulators for you)
npm run e2e

# just one layer
npm --prefix e2e run test:api
npm --prefix e2e run test:ui

# open the last HTML report
npm run e2e:report
```

`playwright.config.ts`'s `webServer` runs `npm run e2e:app` (build → emulators)
and waits for `:5050`. Locally, if you already have `npm run dev` running it
**reuses** that server; in CI it starts a fresh one.

Prerequisites: Node 20+, a JDK (for the Firestore emulator), and the Firebase
CLI (`npm i -g firebase-tools`).

> ⚠️ `global-setup` clears the Firestore emulator at the start of a run, so E2E
> wipes emulator data. Every test also uses unique short codes, so runs are
> independent regardless.

## In CI

`.github/workflows/e2e.yml` runs the whole suite on push/PR (Node + Java +
Firebase CLI + Chromium), and uploads the Playwright HTML report as a build
artifact on every run.
