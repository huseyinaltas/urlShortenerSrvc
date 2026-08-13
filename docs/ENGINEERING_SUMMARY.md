# Final Engineering Summary

This document is the engineer-owned narrative behind the prototype: how the
requirement was understood, decomposed, executed with AI as an accelerator, and
validated. It maps to the assessment's Core Requirements (§4) and Deliverables
(§5). The runnable system, architecture diagram, and setup live in the
[README](../README.md).

**Principle followed throughout:** AI assists within tasks; the engineer defines
intent, constraints, and acceptance criteria, reviews every output, and owns
correctness, security, and production-readiness.

---

## 1. Requirement understanding

The brief — *"a URL shortener with core APIs, analytics, and reliability
features"* — was interpreted and normalized into a concrete engineering problem:

| Intent | Normalized into |
|---|---|
| "Shorten URLs" | `POST /api/shorten` → collision-safe base62 code; optional custom alias |
| "Redirect" | `GET /:code` → **302** to the destination |
| "Analytics" | Per-link click count + 30-day timeline + top referrers (`GET /api/stats/:code`) |
| "Reliability" | Atomic counters, transactional code allocation, input validation, graceful 404s |
| "Runnable end-to-end" | **Emulator-first** — clone, install, run; no cloud account or secrets |

**Ambiguities identified and resolved** (defensible defaults, documented rather
than gold-plated):

| Ambiguity | Decision | Rationale |
|---|---|---|
| How deep should "analytics" go? | Count + 30-day timeline + top referrers, from a bounded recent sample; lifetime total stays exact via the atomic counter | Meaningful insight without a data pipeline; trade-off documented |
| 301 vs 302 redirect? | **302** | 301 is browser-cached and would under-count clicks; analytics accuracy wins |
| Custom aliases? | Supported, optional, validated, reserved-word protected | Common shortener feature; low cost, high value |
| Auth / ownership? | Out of scope for the demo; security boundary still enforced | Keeps scope tight; additive later (noted in limitations) |

---

## 2. Task decomposition

High-level requirement → sequenced, dependency-ordered tasks. Each phase gated on
the previous one compiling and passing its checks before proceeding.

```
Phase 1  Backend foundation
  1.1 Firestore data model + pure helpers (codec, validation)      [no deps]
  1.2 Store layer (transactional create, atomic click, stats)      → 1.1
  1.3 Express API (shorten / redirect / stats / health)            → 1.2
  1.4 Cloud Functions v2 entry (single `app` function)             → 1.3
Phase 2  Tests (backend)
  2.1 Unit: codec, validation, URL-base resolution                 → 1.1,1.4
  2.2 Integration: supertest vs. Firestore emulator                → 1.4
Phase 3  Frontend
  3.1 React + TS dashboard (create form, links table, analytics)   → 1.3
Phase 4  Delivery
  4.1 CI (lint/build/unit/integration) + optional deploy           → 2.x
  4.2 Documentation (architecture, scenarios, setup, trade-offs)   → all
Phase 5  End-to-end (added iteration)
  5.1 Playwright E2E (UI + API) against the built app + CI job     → 3.1,4.1
```

The dependency ordering was deliberate: pure/testable logic first (unit-testable
with no emulator), then the Firestore boundary, then transport, then UI — so each
layer could be validated in isolation before the next depended on it.

---

## 3. Architecture & key decisions

Full detail and the diagram are in the [README](../README.md#architecture). The
decisions that shaped the system:

| Decision | Why | Alternative rejected |
|---|---|---|
| **Single Express Cloud Function** behind a Hosting rewrite (`**` → `app`) serves both the API and `/:code` redirects | One deploy unit, one cold-start surface, easy local reasoning | Separate functions per route (more surfaces, more config) |
| **Firestore atomic counter** (`FieldValue.increment`) + append-only `clicks` subcollection, written in **one batch** | Concurrent-safe totals that can never disagree with the event log | Read-modify-write counter (race conditions); external cache (extra infra) |
| **Server-only data access** — `firestore.rules` denies all client access | A leaked web API key is inert; validation can't be bypassed | Client-side Firestore writes (trust boundary on the device) |
| **Pure / impure separation** — `codec.ts`, `validation.ts`, `urls.ts` are dependency-free; `store.ts` is the only Firestore boundary | Fast unit tests, swappable storage, clear seams | Logic entangled with Firestore (untestable without an emulator) |
| **Emulator-first** with `demo-` project id | Zero-credential review; safe public repo | Requiring a live Firebase project + service-account secret |

---

## 4. AI-assisted execution & traceability *(the critical differentiator)*

AI (Claude) was used as an accelerator across implementation, debugging,
refactoring, test generation, documentation, and review prep. Every task was
defined with **intent + constraints + acceptance criteria**, and every output was
reviewed and owned by the engineer.

### How tasks were framed to the AI (disciplined prompting)
- **Intent + constraints up front:** e.g. *"match the existing `shockServices`
  conventions — Cloud Functions v2, `firebase-admin/firestore`, TypeScript
  strict, Jest, GitHub Actions."* The AI read those real projects first rather
  than inventing a stack.
- **Acceptance criteria as executable checks:** "it builds, lints, and the tests
  pass against the emulator" — not "looks right."
- **Iterative refinement:** each layer was run and observed before moving on;
  failures fed back into the next revision.

### Traceability log — generated / edited / rejected, with rationale

| Item | AI role | Engineer action & rationale | Quality gate |
|---|---|---|---|
| Backend scaffolding, Firestore model, Express routes, React dashboard, SVG chart, docs | **Generated** | Reviewed for convention-match and correctness; kept | tsc, ESLint |
| Short-URL builder returned `http://127.0.0.1:5001/...` (internal Functions-emulator host) → links 404'd | **Edited** | Root-caused: trusting the raw `Host` header. Replaced with a pure `resolveBaseUrl` (PUBLIC_BASE_URL → emulator origin → `X-Forwarded-Host` → Host) and unit-tested it | Reproduced live; unit test added |
| `deploy.yml` used `if: ${{ secrets.* }}` | **Edited** | GitHub rejects `secrets` in `if:` as an *invalid workflow* — it failed on every push. Mapped secret → job-level `env`, gated on `env` | Actions run inspection |
| Integration test used a 2-char alias (`"go"`) | **Edited (test, not code)** | Violated the intended 3-char minimum. The failing test correctly flagged it; fixed the **test**, not the rule — the rule was right | Integration test run |
| `moduleResolution: "node"` (deprecated node10) | **Edited** | Editor/`tsc` flagged the TS 7.0 deprecation. Switched to `bundler` (matching `web/`) instead of silencing it | `tsc --noEmit`, editor |
| Express error-handler's unused 4th arg tripped lint | **Edited** | Configured ESLint `argsIgnorePattern: "^_"` — the arg is required for Express to treat it as an error handler | ESLint |
| **301** permanent redirect | **Rejected** | Would be browser-cached and under-count clicks; chose **302** for analytics accuracy | Design review |
| A charting library for the dashboard | **Rejected** | Kept the bundle small and self-contained with a hand-rolled SVG bar chart | Design review |
| `fullyParallel` E2E | **Rejected** | Tests share one Firestore emulator; chose `workers: 1` for deterministic counts/ordering, with unique codes per test for isolation | E2E run |

### Secure AI usage & controlled oversight
- No secrets or credentials were shared with the AI; the repo ships none (`.env`
  and service-account files are git-ignored; the emulator needs no keys).
- High-impact changes (the workflow fix, the redirect-host fix) were
  engineer-reviewed and verified before landing.
- CI failing was **demonstrated on purpose** (a throwaway failing test on a
  branch/PR) to prove the quality gate blocks bad changes — then reverted.

---

## 5. Validation & risk control

**Quality gates (all green on `main`):** `tsc` build · ESLint · **22** unit ·
**10** integration (Firestore emulator) · **21** Playwright E2E (UI + API) · CI +
E2E GitHub Actions on every push/PR.

**Failure scenarios considered and guarded:**

| Failure scenario | Guardrail |
|---|---|
| Two concurrent creates claim the same code | Uniqueness enforced inside a Firestore **transaction**; random collisions retry with a widening length |
| Counter and event log drift apart | Increment + click event written in **one atomic batch** |
| Leaked web API key used to read/tamper data | `firestore.rules` denies all client access — server-only via Admin SDK |
| Malicious destination (`javascript:`, `data:`, `file:`) | URL validation allows **only** absolute `http`/`https`; everything else rejected |
| Short code shadows a real route (`/api`, `/app`) | Reserved-word set blocks those codes/aliases |
| Stack traces / internals leak to clients | Centralized error handler returns generic 500; no trace exposed |
| macOS port 5000 (Control Center/AirPlay) conflict | Hosting emulator moved to **:5050** so it runs out-of-the-box |

---

## 6. Controlled oversight

The engineer led execution and approved every output: framed each task, reviewed
all AI-generated code for convention-match and correctness, made the
irreversible/architectural calls (single-function design, atomic-write strategy,
security boundary, 302-vs-301), and verified each layer by running it. AI
accelerated; it did not decide.

---

## 7. Assumptions & limitations

**Assumptions:** reviewer has Node 20+, a JDK, and the Firebase CLI; emulator-first
is acceptable for evaluation; anonymous links are fine for a demo.

**Limitations & production direction** (also in the [README](../README.md#known-limitations--trade-offs)):

| Area | Current (demo) | Production direction |
|---|---|---|
| Analytics breakdown | Timeline/referrers from the recent ~500 clicks | Stream clicks to BigQuery / an events table; pre-aggregate |
| Rate limiting | None | Per-IP limiting + App Check |
| Auth / ownership | Anonymous links | Auth; per-user scoping; management API |
| Deployment | Emulator-first (live deploy is optional/manual) | Wire the service account + project and enable `deploy.yml` |

---

## 8. Artifacts index

| Artifact | Location |
|---|---|
| Backend API (Functions v2 + Express) | [`functions/src/`](../functions/src/) |
| Data access + analytics | [`functions/src/store.ts`](../functions/src/store.ts) |
| Pure logic (codec, validation, URL base) | [`codec.ts`](../functions/src/codec.ts), [`validation.ts`](../functions/src/validation.ts), [`urls.ts`](../functions/src/urls.ts) |
| React dashboard | [`web/src/`](../web/src/) |
| Unit + integration tests | [`functions/src/*.test.ts`](../functions/src/) |
| Playwright E2E (UI + API) | [`e2e/`](../e2e/) |
| CI / E2E / deploy workflows | [`.github/workflows/`](../.github/workflows/) |
| Architecture, scenarios, setup, trade-offs | [`README.md`](../README.md) |
