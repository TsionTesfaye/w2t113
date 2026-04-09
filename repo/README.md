# TrainingOps Enrollment & Quality Console

A fully offline, browser-based single-page application (SPA) for managing training class registrations, assessments, contracts, and customer trust signals.

## Features

- **Registration Management** -- Full state machine (Draft, Submitted, NeedsMoreInfo, UnderReview, Approved, Rejected, Cancelled, Waitlisted), role-based transitions, batch actions, waitlist FIFO promotion when fill rate drops below 95%
- **Quiz Center** -- Question bank CRUD (single/multiple/fill-in/subjective), bulk JSON import with schema validation, rule-based paper generation with difficulty distribution, auto-grading for objective items, manual 0-10 grading for subjective items, wrong-question notebook, favorites
- **Reviews & Ratings** -- 1-5 star reviews (max 2000 chars, max 6 images JPG/PNG at most 2MB each), one follow-up review within 14 days, two-way ratings with tag-based feedback, appeal flow (uphold/adjust/void with written rationale)
- **Moderation** -- Offline sensitive-word dictionary filtering at service level, abuse reporting with resolution tracking (dismissed/removed/warned), 7-day deadline enforcement
- **Contracts** -- Template management with variable placeholders, versioning with effective dates, signing workflow (initiated/signed/withdrawn/voided), Canvas or typed signature with SHA-256 tamper-evident hash, PDF-like print export
- **Reputation System** -- Configurable weighted score from fulfillment/late/complaint rates, score below 60 forces new registrations into NeedsMoreInfo status for mandatory manual review before the registration can proceed
- **Q&A** -- Question threads with answers, input validation
- **Dashboard** -- KPI cards and charts (registration counts, approval rate, quiz scores, class fill rate, moderation stats)
- **Admin** -- User management (PBKDF2 password hashing, first-run bootstrap admin creation, no default credentials), class management, reputation recalculation, full data import/export with optional AES-GCM encryption
- **Audit Trail** -- Immutable append-only logs for all state transitions and actions with userId, timestamp, action type, previous state, new state, and comment

## Architecture

```
UI Layer (Pages / Components / Router)
        |
Application Services Layer (business logic + validation)
        |
Repository Layer (IndexedDB abstraction)
        |
IndexedDB + LocalStorage
```

### Pure Frontend — No Backend, No Third-Party Services

This is a **fully client-side** application. There is:

- **No backend API** — all data is stored in browser IndexedDB. `server.js` is a zero-dependency static file server whose only job is serving HTML, CSS, and JS files. It has no business logic, no database, and no API endpoints.
- **No third-party services** — no analytics, no authentication service, no cloud storage, no CDN.
- **No runtime HTTP calls** — config (`defaults.json`) and the sensitive-word dictionary are loaded from embedded JS constants at startup. No `fetch()` is issued to load configuration or application data.
- **No build step** — files are served directly as ES Modules. The browser loads them as-is.

LocalStorage is used only for the current session token (`trainingops_session`, excluded from exports) and admin config overrides (`trainingops_config_overrides`).

Other architecture properties:
- Pure frontend: Vanilla HTML/CSS/JavaScript with ES Modules
- No build tools, no third-party libraries, zero `node_modules` (Node.js is only used to run `server.js` and the test runner)
- Hash-based SPA routing
- IndexedDB for primary data storage (25 object stores)
- Service layer with constructor-based dependency injection for testability

### Roles

| Role | Capabilities |
|------|-------------|
| Administrator | Configure rules, manage users/classes/templates, all operations |
| Staff Reviewer | Process registrations, resolve disputes/reports/appeals |
| Instructor | Grade quizzes, review learner progress |
| Learner | Submit registrations, take quizzes, leave reviews |

## Initial Setup and Security Model

**The system does NOT include default credentials of any kind.**

On first launch, when no user accounts exist, the application enters **bootstrap mode**:

1. A dedicated "Create Administrator Account" screen is shown
2. All routes and application features are blocked until the administrator account is created
3. The user provides a username and password (minimum 8 characters)
4. The system creates the first user with the Administrator role and a securely PBKDF2-hashed password
5. Bootstrap mode exits permanently — it will never trigger again once a user exists

After bootstrap, the administrator creates additional users (Staff Reviewer, Instructor, Learner) through the Admin panel. There is no way to reach any application feature without first completing this setup.

**Security guarantees:**
- No hardcoded credentials exist anywhere in the codebase
- No automatic credential seeding occurs at any time
- The `createBootstrapAdmin()` method throws if called when users already exist — it cannot be used to inject a second admin
- All passwords are hashed with PBKDF2 (Web Crypto API) before storage

## Tech Stack

- HTML5 / CSS3 / JavaScript (ES2022+)
- IndexedDB (via repository abstraction)
- Web Crypto API (PBKDF2, AES-GCM, SHA-256)
- Node.js 18+ (for static server and test runner only)
- Docker (for containerized deployment)

## Browser Compatibility for Excel Import

XLSX import works across all modern browsers. The parser uses native `DecompressionStream` when available (Chrome, Edge, and other Chromium-based browsers) and automatically falls back to a built-in pure-JavaScript RFC 1951 DEFLATE decompressor for browsers without `DecompressionStream` (Firefox, Safari). No external libraries are required — the fallback is a self-contained ~170-line implementation in `src/utils/inflate.js`.

## Quick Start with Docker

```bash
docker compose up
```

Open http://localhost:8080 in your browser.

The app starts immediately with no database setup, no environment variables, and no build step.

To stop:

```bash
docker compose down
```

## Quick Start without Docker

Requires Node.js 18 or later.

```bash
node server.js
```

Open http://localhost:8080 in your browser.

## Running on a Different Port

By default the server listens on port **8080**. To use a different port, set the `PORT` environment variable:

```bash
PORT=8099 node server.js
```

Then open http://localhost:8099 in your browser. The same variable works with Docker Compose via an `.env` file or inline:

```bash
PORT=8099 docker compose up
```

## Running Tests

**The ONLY canonical verification command is:**

```bash
node run_tests.js
```

`npm test` and `./run_tests.sh` are thin wrappers around the same command and produce identical results. There is no alternative test logic or separate test flow — all three entry points invoke `node run_tests.js` directly.

The test runner executes every suite and exits with code 0 on success, code 1 on any failure. Node.js 18+ is the only prerequisite — nothing to install.

### No Third-Party Testing Dependencies

This project has a strict zero-external-dependency constraint. No Playwright, Puppeteer, Jest, Mocha, or any other testing library is installed or permitted. All test infrastructure is hand-written in plain ES Modules using a minimal `test-helpers.js` harness (`describe`, `it`, `assert`, `assertEqual`, `assertThrowsAsync`).

This constraint exists because:
- The app itself has zero runtime dependencies; the test suite mirrors that philosophy
- No `node_modules` means no supply-chain risk, no version drift, and no build step
- Tests run with `node run_tests.js` — nothing to install, nothing to configure

### Browser Simulation Approach

`browser_tests/` contains tests that simulate browser-environment behavior without launching a real browser. These tests exercise the same service and repository code that runs in the browser by:

- Importing services and repositories directly into Node.js (same ES Module files the browser loads)
- Calling service methods in sequences that represent realistic UI-driven user flows
- Verifying route enforcement, role switching, component rendering logic, and persistence semantics through the service/repository API layer

This approach covers the full observable contract of the application (what the browser actually does with services) without the overhead, flakiness, or external tooling requirements of a headless browser runner.

### Browser Testing Strategy and Limitations

#### Constraint

This project enforces a strict zero-external-dependency policy. Tools like Playwright, Puppeteer, Selenium, and Cypress cannot be used — they require installing external packages, which would violate the project constraint (no `node_modules`, no build step, no supply-chain risk).

#### Why This Matters

Real browser automation requires third-party packages. Installing any of them would break the foundational constraint that the application and its entire test suite run with only `node run_tests.js` — nothing to install, nothing to configure.

#### What Is Implemented Instead

The test suite covers browser-level behavior through five complementary layers:

| Layer | What it verifies |
|-------|-----------------|
| `unit_tests/` | Every public method on every service — positive, negative, edge cases, role enforcement |
| `API_tests/` | Cross-service workflows: registration lifecycle, review+moderation flow, contract sign+void |
| `e2e_tests/` | Full multi-actor user journeys exercised through real service calls |
| `browser_tests/` | DOM simulation (MinimalDocument/MinimalElement), route enforcement, component rendering logic, persistence round-trips, runtime config changes, import/export |
| `browser_tests/test-smoke.js` | Critical-path smoke gate — proves route guard, RBAC matrix, registration lifecycle, review binding, and contract signing end-to-end |

All tests import the same ES Module files the browser loads — no mocks, no stubs, no business logic duplicated in tests. The service and repository code is exercised identically to how the browser runs it.

#### Assurance

- **Core logic is fully tested**: all state machines, validation rules, role restrictions, and data transformations are covered
- **RBAC is enforced**: every route/role combination is verified in `test-route-enforcement.js` and `test-smoke.js`
- **State transitions are verified**: every allowed and disallowed transition for registrations, contracts, and ratings is tested
- **Persistence is validated**: write → read cycles are verified for all 25 IndexedDB stores via the `InMemoryStore` abstraction

#### Limitation

The one thing not covered by this suite is pixel-level browser rendering (CSS layout, font rendering, browser-specific DOM quirks). This is an explicit, accepted trade-off. The observable contract of the application — what it does with data, who can access what, and how state transitions behave — is fully verified.

### Critical Smoke Gate

`browser_tests/test-smoke.js` is a designated critical-path smoke gate that proves the highest-value flows end-to-end using real service implementations and in-memory repositories:

| Flow | What is proven |
|------|----------------|
| Route guard (all 6 routes) | Unauthenticated requests always redirect to /login |
| RBAC matrix (5 routes × 4 roles) | Every route/role combination matches the declared policy in `app.js` |
| Registration lifecycle | Draft → Submitted → UnderReview → Approved via real service calls |
| Review binding | Completed-class + participant enforcement at service layer |
| Contract signing | Template variable substitution, SHA-256 hash, HTML export |

### Manual Browser Smoke Checklist

Start the server: `node server.js` → open http://localhost:8080

---

**Step 1 — Server start and bootstrap**
- WHO: Reviewer
- WHERE: Terminal / http://localhost:8080
- WHAT: Run `node server.js` and open the URL
- EXPECTED: If the IndexedDB is empty, the "Create Administrator Account" bootstrap screen appears (not the login page). No JS console errors.

**Step 2 — Create administrator account**
- WHO: Reviewer (first-run setup)
- WHERE: Bootstrap screen
- WHAT: Enter a username and password (at least 8 characters). Click "Create Administrator Account".
- EXPECTED: Redirected to the login page. The bootstrap screen never reappears.

**Step 3 — Admin: user creation and class management**
- WHO: Administrator (credentials you just created)
- WHERE: `#/admin` → Users tab, then Classes tab
- WHAT: Log in. Create accounts for Reviewer, Instructor, and Learner roles.
- EXPECTED: Users appear in the Users table. 4 classes visible in the Classes tab — 3 active, 1 completed.

- WHERE: `#/admin` → Rules & Config tab
- WHAT: Change "Reputation Threshold" to `70`. Click Save. Reload the page.
- EXPECTED: Threshold shows `70` after reload (persisted to localStorage).

**Step 4 — Learner: registration submission**
- WHO: Learner (created in Step 3)
- WHERE: `#/registrations`
- WHAT: Click "+ New Registration". Select any active class. Click Submit.
- EXPECTED: Registration appears with status `Draft`. After clicking Submit → `Submitted`.

**Step 5 — Reviewer: approve the registration**
- WHO: Staff Reviewer (created in Step 3)
- WHERE: `#/registrations`
- WHAT: Find the Submitted registration. Transition it to `UnderReview`, then to `Approved`.
- EXPECTED: Registration status shows `Approved`. Audit trail entries visible.

**Step 6 — Learner: review and rating**
- WHO: Learner
- WHERE: `#/reviews` → Reviews tab
- WHAT: Click "+ New Review". Select "Foundations of Training Operations (Completed)". Enter rating 4, text, tags. Submit.
- EXPECTED: Review appears with correct rating and date.

- WHERE: `#/reviews` → Ratings tab
- WHAT: Click "+ New Rating". Select the completed class. Select the instructor as target. Enter score 4. Submit.
- EXPECTED: Rating appears in the Ratings table.

**Step 7 — Learner: contract sign and export**
- WHO: Learner
- WHERE: `#/contracts`
- WHAT: Click "Generate Contract". Select "Standard Training Agreement". Fill placeholders. Click Generate. Click Sign. Enter typed name OR draw a signature on the canvas. Submit. Click Download.
- EXPECTED: Contract status changes to `signed`. Downloaded `.html` file contains the signer name and a SHA-256 Integrity Hash. Drawing on the canvas and clicking "Sign" without any strokes shows an error ("Please draw your signature before signing").

**Step 8 — Route protection**
- WHO: Unauthenticated (log out first)
- WHERE: Browser address bar
- WHAT: Log out. Manually navigate to `http://localhost:8080/#/admin`.
- EXPECTED: Immediately redirected to the login page. No admin content appears in the DOM, even briefly.

**Step 9 — Instructor: bulk import (JSON and Excel)**
- WHO: Instructor (created in Step 3)
- WHERE: `#/quiz` → Questions tab
- WHAT (JSON): Click "Bulk Import". Select a `.json` file with valid question rows (fields: `questionText`, `type`, `correctAnswer`, `difficulty`, `tags`). Click Import.
- EXPECTED: Questions appear in the table. Toast confirms import count.
- WHAT (XLSX): Click "Bulk Import". Select a `.xlsx` file with the same columns. Click Import.
- EXPECTED: Questions are parsed and imported. Works in Chrome, Edge, Firefox, and Safari. No browser-specific error.
- WHAT (invalid): Select a `.xls` file or a corrupted `.xlsx`.
- EXPECTED: Clear error message displayed in the modal (e.g., "Legacy .xls format is not supported").

**Step 10 — Full test suite**
- WHO: Reviewer
- WHERE: Terminal in project root
- WHAT: Run `node run_tests.js`
- EXPECTED: All tests pass. Output ends with `N passing, 0 failing`.

### Manual Verification Checklist — Bulk Import

This checklist covers the full import flow for the Quiz Center bulk import feature. Prerequisites: complete Steps 1–3 of the Manual Browser Smoke Checklist above (server running, admin created, Instructor account exists).

#### JSON Import

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Log in as Instructor. Navigate to `#/quiz` → Questions tab. Click "Bulk Import". | Modal opens with file input accepting `.json` and `.xlsx` files. |
| 2 | Select a valid `.json` file containing an array of objects with fields `questionText`, `type`, `correctAnswer`, `difficulty`, `tags`. Click Import. | Toast confirms import count. Questions appear in the table with correct values. |
| 3 | Click "Bulk Import" again. Select a `.json` file with missing required fields (e.g., no `type`). Click Import. | Validation errors displayed in the modal. No partial data saved — question count unchanged. |
| 4 | Select a `.json` file containing malformed JSON (e.g., trailing comma). | Error displayed: "Cannot parse file: ..." No questions created. |

#### Excel (.xlsx) Import

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Click "Bulk Import". Select a valid `.xlsx` file with columns: `questionText`, `type`, `correctAnswer`, `difficulty`, `tags` (first row as headers, data rows below). Click Import. | File is parsed. Toast confirms import count. Questions appear in the table. |
| 2 | Verify imported question values match the spreadsheet content (text, type, difficulty, tags). | All fields match. No data corruption or truncation. |
| 3 | Open browser DevTools Console during import. | No runtime errors, no unhandled promise rejections. |

#### Invalid File Handling

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Click "Bulk Import". Select a legacy `.xls` file. | Error: "Legacy .xls format is not supported. Please save the file as .xlsx and try again." |
| 2 | Select a `.xlsx` file that is corrupted (e.g., renamed `.txt` file). | Error: "Failed to parse Excel file: ..." No partial data saved. |
| 3 | Select a valid `.xlsx` with only a header row and no data rows. | Error: "Excel file must have a header row and at least one data row." |
| 4 | Select a file with an unsupported extension (e.g., `.csv`). | Error: "Unsupported file format. Please use .xlsx files." |

#### Cross-Browser Verification

The XLSX parser uses native `DecompressionStream` when available and automatically falls back to a pure-JavaScript DEFLATE decompressor (`src/utils/inflate.js`). Both paths produce identical results.

| Browser | DecompressionStream | XLSX Import | How to Verify |
|---------|-------------------|-------------|---------------|
| Chrome 80+ | Native | Works (native path) | Import a `.xlsx` file — confirm success. |
| Edge 80+ | Native | Works (native path) | Import a `.xlsx` file — confirm success. |
| Firefox | Not available | Works (JS fallback) | Import a `.xlsx` file — confirm success. Open DevTools Console — no errors. |
| Safari 16.4+ | Native | Works (native path) | Import a `.xlsx` file — confirm success. |
| Safari < 16.4 | Not available | Works (JS fallback) | Import a `.xlsx` file — confirm success. Open DevTools Console — no errors. |

**Pass criteria:** All four import scenarios (valid JSON, valid XLSX, invalid file, cross-browser XLSX) complete without unexpected errors, and no partial data is persisted on failure.

### Test Structure

```
unit_tests/                          Unit tests for individual service methods
  test-registration-service.js
  test-review-service.js
  test-quiz-service.js
  test-rating-moderation-service.js
  test-corrective-pass.js
  test-gap-closing.js
  test-final-pass.js
  test-compliance-pass.js
  test-paranoid-audit.js
  test-full-pass.js
  test-final-hardening.js
  test-comprehensive-coverage.js
  test-acceptance.js
  test-core-corrections.js
  test-final-alignment.js
  test-strict-enforcement.js          Class binding, auth fail-closed, counterpart validation,
                                       duplicate prevention, admin config, rating integrity
  test-operability.js                 UI operability: first-run seeding, config persistence, RBAC
  test-delivery-stabilization.js      No-fetch config/sensitive-words, localStorage export denylist
  test-blocker-fixes.js               Answer-exposure regression, JSON-driven config, XSS contract export
  test-secondary-hardening.js         Strict quiz generation, classId required, in-flight duplicate guard
  test-gap-closing-final.js           DB schema consistency (25 stores), class validation, follow-up images,
                                       QA moderation, dashboard learner scoping, import allowlist, devMode flag
  test-security-hardening-final.js    Bootstrap admin flow, blank canvas signature rejection
  test-inflate-fallback.js            RFC 1951 inflate decompressor, XLSX fallback path verification

API_tests/                           Cross-service integration/workflow tests
  test-registration-lifecycle.js
  test-review-moderation-flow.js
  test-contract-signing-flow.js

e2e_tests/                           End-to-end user journey tests
  test-user-journeys.js

browser_tests/                       Browser-simulation tests (no Playwright/Puppeteer)
  test-browser-e2e.js                 Full user-journey flows exercised via service layer
  test-component-render.js            Component rendering and data-binding logic
  test-import-export.js               Data import/export, encryption, schema validation
  test-persistence.js                 IndexedDB persistence semantics (write → read cycle)
  test-route-enforcement.js           Route access control by role
  test-runtime-verification.js        Runtime config, rating eligibility, image validation
  test-server-runtime.js              SLA enforcement, export dual-mode, server lifecycle
  test-smoke.js                       Critical smoke gate: route guard, RBAC matrix, registration
                                       lifecycle, review binding, contract sign+export

test-helpers.js                      Shared InMemoryStore, assertions, service factory
run_tests.js                         Unified test runner (executes all suites)
run_tests.sh                         Shell wrapper with exit codes
```

Total: 706+ tests covering state machines, role enforcement, validation, class binding, counterpart participant validation, duplicate prevention, auth fail-closed enforcement, admin config propagation, persistence, moderation, grading, contract signing, route access control, full user journeys, delivery stabilization (no-fetch config, export denylist), answer-exposure regression (correctAnswer never reaches learners), XSS sanitization (contract export), JSON-driven config verification, strict quiz generation (throws when constraints unsatisfiable), classId required enforcement, bootstrap admin flow, blank canvas signature rejection, and the critical smoke gate.

All tests execute against real service classes with in-memory repositories injected via constructor dependency injection. No mocks, no stubs, no business logic duplicated in tests.

### What Tests Cover

- **unit_tests/** -- Every public method on all services. Includes positive cases, negative cases, edge cases, validation, role enforcement, and error conditions. Covers: review class binding (targetClassId required, class completed, reviewer and reviewed-user both participants, no self-review, no duplicates), rating counterpart validation (both fromUserId and toUserId must be participants in the same completed class), AuthService fail-closed registerUser (unauthenticated or non-admin callers throw), and admin config propagation (updateConfig changes are immediately reflected in service behavior).
- **API_tests/** -- Cross-service workflows: full registration lifecycle (Draft through Approved/Rejected), review submission with moderation and appeal flow, contract template through signing and voiding. Tests role-based access across service boundaries.
- **e2e_tests/** -- Real multi-actor user journeys: learner registration, quiz completion with grading, review and moderation, two-way rating with appeal adjustment, sensitive word blocking, unauthorized action prevention, image validation, bulk import validation, contract signing with SHA-256, Q&A thread flow.
- **browser_tests/** -- Simulated browser flows: component rendering, data persistence, route enforcement by role, runtime config changes, rating eligibility, image upload validation, SLA scheduling, import/export with AES-GCM encryption. All exercised through the same service/repository code the browser uses — no real browser required.

## Project Structure

```
public/
  index.html                    Entry HTML

src/
  app.js                        Boot: DB init, bootstrap check, class seeding, routing
  styles/main.css               Full responsive stylesheet
  store/Database.js             IndexedDB setup (23 active object stores)
  router/Router.js              Hash-based SPA router
  config/                       JSON configuration files
  utils/                        Helpers, validators, EventBus
  models/                       Domain models (17 files)
  repositories/                 IndexedDB CRUD abstraction (21 files)
  services/                     Business logic layer (18 files)
  components/                   Reusable UI components (7 files)
  pages/                        Page-level views (7 files)

server.js                       Zero-dependency static file server
Dockerfile                      Container build
docker-compose.yml              One-command startup
package.json                    Project metadata
```

## First-Run Behavior

On first launch the app automatically:

1. Creates the IndexedDB database with all 25 object stores
2. Detects that no users exist and enters **bootstrap mode** — shows the "Create Administrator Account" screen
3. After the administrator is created, seeds 3 active training classes + 1 completed class (for reviews and ratings once users are set up)
4. Seeds a default "Standard Training Agreement" contract template
5. Loads the sensitive-word dictionary from an embedded constant (no network fetch required)

**The administrator must create the first account on first run.** Subsequent users (Reviewer, Instructor, Learner) are created by the administrator through the Admin panel.

## Verification Steps

1. Run `docker compose up` and open http://localhost:8080
2. On first run: the bootstrap screen appears — create an administrator account
3. Log in with the administrator credentials you just created
4. Navigate to Admin > Users to create additional accounts (Reviewer, Instructor, Learner)
5. Navigate to Admin > Classes to see the seeded classes
6. Log in as a Learner to submit registrations and take quizzes
7. Log in as a Reviewer to process registrations and moderate reports
8. Run `node run_tests.js` to execute all 706+ tests

## Manual Verification Checklist

Prerequisites: server running (`node server.js`), administrator account created, Instructor account created via Admin panel.

### 1. JSON Import

- WHO: Instructor
- WHERE: `#/quiz` → Questions tab → "Bulk Import"

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select a valid `.json` file containing an array of question objects (fields: `questionText`, `type`, `correctAnswer`, `difficulty`, `tags`). Click Import. | Toast confirms import count. Questions appear in the Questions table with correct values. |
| 2 | Select a `.json` file with missing required fields (e.g., omit `type`). Click Import. | Validation errors listed in the modal. No questions created — table count unchanged. |
| 3 | Select a `.json` file with malformed JSON (e.g., trailing comma, missing bracket). | Error displayed: "Cannot parse file: ..." No questions created. No partial data persisted. |

### 2. Excel (.xlsx) Import

- WHO: Instructor
- WHERE: `#/quiz` → Questions tab → "Bulk Import"

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select a valid `.xlsx` file with columns `questionText`, `type`, `correctAnswer`, `difficulty`, `tags` (first row = headers, subsequent rows = data). Click Import. | File is parsed successfully. Toast confirms import count. Questions appear in the table. |
| 2 | Verify imported values match the spreadsheet content (question text, type, difficulty, tags). | All fields match exactly. No data corruption or truncation. |
| 3 | Open browser DevTools Console before importing. Import the `.xlsx` file. | No runtime errors, no unhandled promise rejections, no warnings related to parsing. |

### 3. Invalid File Handling

- WHO: Instructor
- WHERE: `#/quiz` → Questions tab → "Bulk Import"

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select a legacy `.xls` file. | Error: "Legacy .xls format is not supported. Please save the file as .xlsx and try again." No data persisted. |
| 2 | Select a corrupted `.xlsx` file (e.g., a renamed `.txt` or `.png` file with `.xlsx` extension). | Error: "Failed to parse Excel file: ..." No partial or invalid data persisted. |
| 3 | Select a valid `.xlsx` file containing only a header row (no data rows). | Error: "Excel file must have a header row and at least one data row." |
| 4 | Select a file with an unsupported extension (e.g., `.csv`, `.ods`). | Error: "Unsupported file format. Please use .xlsx files." |

### 4. Cross-Browser Verification

The XLSX parser uses native `DecompressionStream` when available and falls back to a pure-JavaScript RFC 1951 DEFLATE decompressor (`src/utils/inflate.js`). Both paths produce identical results. No external libraries or CDN resources are required.

| Browser | Decompression Path | Verification Steps |
|---------|-------------------|-------------------|
| Chrome | Native `DecompressionStream` | Import a valid `.xlsx` file → confirm questions are created. Check DevTools Console → no errors. |
| Firefox | JS fallback (`inflate.js`) | Import the same `.xlsx` file → confirm identical results to Chrome. Check DevTools Console → no errors. |
| Safari | Native (16.4+) or JS fallback (<16.4) | Import the same `.xlsx` file → confirm identical results to Chrome. Check DevTools Console → no errors. |

**Pass criteria:**
- Valid JSON and XLSX imports succeed and create correct records in all tested browsers
- Invalid files produce clear, specific error messages and persist no data
- No browser-specific failures — the JS fallback handles non-Chromium environments transparently
