# Shortly — URL Shortener Service

[![CI](https://github.com/huseyinaltas/urlShortenerSrvc/actions/workflows/ci.yml/badge.svg)](https://github.com/huseyinaltas/urlShortenerSrvc/actions/workflows/ci.yml)

An AI-assisted URL shortener built for the AI Engineering Assessment. It shortens
long URLs, redirects visitors, and tracks per-link analytics (click counts, a
daily timeline, and top referrers) behind a small React dashboard.

The whole thing runs **locally on the Firebase emulators with no cloud account,
no credentials, and no billing** — clone, install, run.

- **API** — Firebase Cloud Functions v2 (TypeScript + Express)
- **Storage** — Firestore (atomic counters + an append-only click log)
- **Frontend** — React + TypeScript (Vite), served by Firebase Hosting
- **CI/CD** — GitHub Actions: lint → build → unit tests → emulator integration tests
- **Tests** — Jest (pure unit tests + integration tests against the Firestore emulator)

> Stack note: this mirrors the conventions in my existing Firebase backend
> (`shockServices`) — Cloud Functions v2, `firebase-admin/firestore`, TypeScript,
> Jest, GitHub Actions — so it reads like production code I already maintain.

---

## Quick start

**Prerequisites:** Node 20+ and the Firebase CLI (`npm i -g firebase-tools`). The
Firestore emulator needs a JDK (Java 17+) — `java -version` should work.

```bash
# 1. Install all workspaces (root, functions, web)
npm run install:all

# 2. Build functions + web, then start emulators AND the Vite dev server
npm run dev
```

Then open:

| URL | What |
|-----|------|
| http://localhost:5173 | The React dashboard (Vite, hot reload) |
| http://localhost:5050 | The app as production serves it (Hosting emulator → function) |
| http://localhost:4000 | Firebase Emulator UI (inspect Firestore) |

Optionally seed demo links + clicks (emulators must be running):

```bash
npm run seed
```

Create a link in the UI, click its short URL to be redirected, then select the
link to watch its analytics update.

### How dev wiring works

The dashboard calls same-origin `/api/*`. In dev, Vite proxies `/api` to the
**Hosting** emulator (:5050), which applies the production rewrites and forwards
to the `app` function. Because the proxy rewrites the `Host` header, the
`shortUrl` the API returns is a real, clickable `http://localhost:5050/<code>`
redirect. In production the SPA and the function share one origin, so the same
relative calls work with no proxy.

---

## API

Base path is the deployed origin (or `http://localhost:5050` on the emulator).

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/shorten` | Create a short link. Body: `{ "url": "https://…", "alias"?: "custom" }` → `201 { code, shortUrl, url }` |
| `GET`  | `/api/stats/:code` | Analytics for a code → `{ clickCount, timeline[], topReferrers[], … }` |
| `GET`  | `/api/links?limit=` | Recent links (newest first) for the dashboard |
| `GET`  | `/api/health` | Liveness probe |
| `GET`  | `/:code` | **302** redirect to the destination; records the click |

```bash
# Create
curl -s -XPOST http://localhost:5050/api/shorten \
  -H 'content-type: application/json' \
  -d '{"url":"https://firebase.google.com/docs/functions"}'
# → {"code":"aZ3k9Qx","shortUrl":"http://localhost:5050/aZ3k9Qx","url":"…"}

# Follow it (counts a click)
curl -sI http://localhost:5050/aZ3k9Qx        # HTTP/1.1 302 Found

# Stats
curl -s http://localhost:5050/api/stats/aZ3k9Qx
```

---

## Architecture

```
┌────────────┐        /api/*  (fetch)         ┌──────────────────────────┐
│  React SPA │ ─────────────────────────────▶ │  Cloud Function "app"    │
│  (Hosting) │ ◀─────────────────────────────  │  Express router          │
└────────────┘     JSON / 302 redirects        │  ├─ POST /api/shorten    │
       ▲    visitor hits /:code                 │  ├─ GET  /api/stats/:c   │
       └───────────────────────────────────────│  ├─ GET  /:code → 302    │
                                                │  └─ validation + codec   │
                                                └────────────┬─────────────┘
                                                  Admin SDK   │
                                                ┌─────────────▼─────────────┐
                                                │  Firestore                 │
                                                │  links/{code}              │
                                                │    clickCount (atomic)     │
                                                │    links/{code}/clicks/*   │
                                                └────────────────────────────┘
```

**One function, two jobs.** A single Hosting rewrite (`**` → `app`) sends both
the JSON API and every `/:code` redirect to one Express app. Static assets and
the SPA shell are served directly by Hosting. Fewer cold-start surfaces, one
deploy unit.

**Data model** (`functions/src/store.ts`):

```
links/{code}
  url            string      normalized destination
  code           string
  createdAt      Timestamp
  clickCount     number      ← FieldValue.increment (atomic)
  lastClickedAt  Timestamp|null
  clicks/{auto}              ← append-only click events
    at           Timestamp
    referer      string
    userAgent    string
```

The parent counter gives O(1) totals; the subcollection backs the timeline and
referrer breakdown. On each redirect, the counter bump **and** the click event
are written in **one atomic batch**, so the headline total and the event log can
never disagree.

**Security model.** `firestore.rules` denies all direct client access — the SPA
never touches Firestore. Every read/write goes through the Admin SDK inside the
function, so a leaked web API key is inert. URL validation (`validation.ts`)
only ever mints links for absolute `http`/`https` URLs, rejecting
`javascript:`, `data:`, `file:`, protocol-relative, and malformed inputs so a
short link can't smuggle a script or local-file navigation.

**Reliability.**
- Short codes are generated with crypto-strong randomness and **claimed inside a
  Firestore transaction**, so two concurrent creates can't take the same code;
  random collisions retry with a widening code length.
- Redirects use **302** (not 301) so browsers don't cache them and every visit is
  counted.
- Unknown codes return a friendly 404 page; the error handler never leaks stack
  traces.

---

## Three engineering scenarios

The assessment asks how this design behaves across three situations.

### 1. Greenfield (this repo)
Starting clean, the goal was the shortest path to a **runnable, reviewable**
prototype. Choices: emulator-first (zero-credential review), a single Express
function (one deploy surface, easy local reasoning), Firestore atomic counters
(correct concurrent writes without a separate cache), and pure/impure separation
(`codec.ts`, `validation.ts` are dependency-free and unit-tested; `store.ts` is
the only Firestore boundary). AI accelerated scaffolding and test authoring; the
architecture and trade-offs were engineer-decided.

### 2. Brownfield (integrating into an existing system)
If this dropped into an existing product (e.g. my `shockServices` backend), the
seams are deliberate:
- **Storage** is isolated behind `store.ts` — swap Firestore for Postgres/Redis
  by reimplementing that module; the Express layer and validation don't change.
- **The function** is plain Express, so it mounts under an existing API gateway
  or as another route group without a rewrite of business logic.
- **Analytics** currently samples recent clicks in-process. In an established
  system you'd fan click events onto the existing pipeline (Pub/Sub → BigQuery,
  or an events table) and keep only the atomic counter hot. The write path
  already isolates that in `resolveAndRecordClick`, so it's a one-function change.
- **Naming collisions**: the reserved-word set (`codec.ts`) already prevents new
  short codes from shadowing existing routes like `/api` or `/app`.

### 3. Ambiguous requirements (deciding under uncertainty)
Several requirements were intentionally open ("analytics", "reliability"). Where
the spec was silent I chose a **defensible default and documented the trade-off**
rather than gold-plating:
- *"Analytics" — how deep?* → click count + 30-day timeline + top referrers,
  computed from a bounded recent sample. Exact lifetime total stays correct (the
  atomic counter); the breakdown is a sample. Documented below.
- *Custom aliases?* → supported but optional, with validation and reserved words.
- *Redirect permanence?* → 302 chosen so analytics stay accurate, trading away
  browser-side redirect caching. Stated explicitly.
- *Auth?* → out of scope for the demo; the security boundary (server-only
  Firestore access, input validation) is in place so adding auth is additive.

The through-line: **make the reversible call quickly, flag it, and keep the
expensive/irreversible seams open.**

---

## Testing

Three layers — pure unit, service integration, and full end-to-end:

```bash
npm test                      # unit tests (integration self-skips w/o emulator)
npm run test:unit             # pure logic: codec + URL validation (fast, no Java)
npm run test:integration      # full API against the Firestore emulator

npm run e2e:install           # one-time: Playwright + Chromium
npm run e2e                   # Playwright UI + API E2E (builds app + boots emulators)
```

- **Unit** (`functions/**/*.unit.test.ts`) — code generation, URL validation,
  and short-URL base resolution. No external dependencies.
- **Integration** (`functions/**/*.integration.test.ts`) — drives the real
  Express app with `supertest` against a live Firestore emulator: shorten
  (valid/invalid/alias/duplicate/reserved), 302 redirect, click counting, stats
  aggregation, 404s, recent-links ordering. Self-skips when
  `FIRESTORE_EMULATOR_HOST` is unset, so a bare `npm test` is safe without Java.
- **E2E** ([`e2e/`](e2e/), Playwright) — runs against the **built** SPA on the
  Hosting emulator (production parity). API tests via the `request` fixture; UI
  tests via a `DashboardPage` Page Object; plus a combined UI+API flow (create in
  the UI → drive redirects → assert the click count in the dashboard). See
  [e2e/README.md](e2e/README.md).

---

## CI/CD

- **`.github/workflows/ci.yml`** — on every push/PR: install → lint → build
  (functions + web) → unit tests → integration tests under the Firestore
  emulator (Java + Firebase CLI provisioned in the job).
- **`.github/workflows/e2e.yml`** — on every push/PR: Playwright UI + API E2E
  against the built app on the emulators (Chromium), uploading the HTML report
  as a build artifact.
- **`.github/workflows/deploy.yml`** — optional, **manual** (`workflow_dispatch`).
  Emulator-first means live deploy is off by default; enable it by setting a
  Firebase project and a `FIREBASE_SERVICE_ACCOUNT` secret (instructions in the
  file header).

---

## How AI was used (traceability)

This was built AI-assisted with an engineer in the loop the whole way:
- **AI accelerated**: scaffolding config, boilerplate, the test matrix, the SVG
  chart, and this documentation.
- **Engineer-led**: the architecture (single-function + Hosting rewrite), the
  data model and atomic-write strategy, the security boundary (server-only
  Firestore + scheme allow-list), the 301-vs-302 analytics decision, and the
  handling of ambiguous requirements above.
- **Verified, not assumed**: every layer was run — `tsc` build, ESLint, 22 unit
  tests, 10 integration tests, and 12 Playwright E2E tests (UI + API) against the
  live emulators all pass before this was called done. Real bugs were caught and
  fixed during verification, not papered over — e.g. the short-URL builder was
  returning the internal Functions-emulator host, and `deploy.yml` was an invalid
  workflow (`secrets` used in an `if:`) that failed on every push.

---

## Known limitations & trade-offs

| Area | Current (demo) | Production direction |
|------|----------------|----------------------|
| Analytics breakdown | Timeline/referrers from the most recent ~500 clicks | Stream clicks to BigQuery / an events table; pre-aggregate |
| Rate limiting | None | Add per-IP limiting (e.g. Firebase App Check + a token bucket) |
| Auth / ownership | Links are anonymous | Add auth; scope links to a user; management API |
| Redirect caching | 302 every time (accurate counts, more requests) | Optional 301 + async click logging for hot links |
| Custom domains | `localhost` / default Hosting domain | Map a branded short domain in Hosting |
| Code length | 7 chars, widening on collision | Fine to ~10^12 links; revisit for hyperscale |

---

## Project layout

```
urlShortenerSrvc/
├─ functions/            # Cloud Functions v2 API (TypeScript)
│  └─ src/
│     ├─ index.ts        #   function entry — exports `app`
│     ├─ app.ts          #   Express routes (API + redirect)
│     ├─ store.ts        #   Firestore data access + analytics
│     ├─ codec.ts        #   short-code generation + reserved words
│     ├─ validation.ts   #   URL validation / normalization
│     └─ *.test.ts       #   unit + integration tests
├─ web/                  # React + TS dashboard (Vite)
│  └─ src/
│     ├─ App.tsx, api.ts
│     └─ components/      #   CreateLink, LinkList, StatsPanel, BarChart
├─ e2e/                  # Playwright E2E (UI + API) against the built app
│  ├─ pages/             #   DashboardPage (POM)
│  └─ tests/{api,ui}/    #   request-fixture API specs + UI specs
├─ scripts/seed.mjs      # seed demo data via the API
├─ firebase.json         # Hosting rewrites, emulators, functions config
├─ firestore.rules       # deny-all client access (server-only)
└─ .github/workflows/    # ci.yml, deploy.yml
```
