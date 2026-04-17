# TrainingOps Enrollment & Quality Console

> **Project type: web** — Pure frontend SPA. No backend, no API endpoints.

Offline browser-based SPA for managing training class registrations, assessments, contracts, and trust workflows.

---

## Architecture & Tech Stack

```
UI Layer  (Pages / Components / Router — Vanilla JS ES Modules)
      |
Service Layer  (business logic, validation, RBAC)
      |
Repository Layer  (IndexedDB abstraction — InMemoryStore in tests)
      |
IndexedDB + LocalStorage  (browser-only; zero backend)
```

**Pure frontend — no backend, no third-party services.**

- `server.js` is a zero-dependency static file server. It serves HTML/CSS/JS; it has no business logic, no API endpoints, and no database.
- All data lives in IndexedDB. No `fetch()` is issued for application data.
- No build step. Files are served directly as ES Modules.
- LocalStorage holds only the session token and admin config overrides.

| Layer | Technology |
|-------|-----------|
| UI | Vanilla HTML5 / CSS3 / JavaScript (ES2022+) |
| Storage | IndexedDB (25 object stores), LocalStorage |
| Crypto | Web Crypto API — PBKDF2, AES-GCM, SHA-256 |
| Runtime | Node.js 18+ (static server + test runner only) |
| Container | Docker |
| E2E tests | Playwright / Chromium |

### Roles

| Role | Capabilities |
|------|-------------|
| Administrator | Full access: configure rules, manage users/classes/templates, all operations |
| Staff Reviewer | Process registrations, resolve disputes, reports, appeals |
| Instructor | Grade quizzes, review learner progress |
| Learner | Submit registrations, take quizzes, leave reviews |

---

## Project Structure

```
public/
  index.html                  Entry point HTML

src/
  app.js                      Boot: DB init, bootstrap check, class seeding, routing
  styles/main.css             Full responsive stylesheet
  store/Database.js           IndexedDB setup (25 object stores)
  router/Router.js            Hash-based SPA router
  config/                     JSON configuration and sensitive-word defaults
  utils/                      Helpers, validators, EventBus
  models/                     Domain models (17 files)
  repositories/               IndexedDB CRUD abstraction (21 files)
  services/                   Business logic layer (18 files)
  components/                 Reusable UI components (Toast, Modal, Drawer, DataTable, ...)
  pages/                      Page orchestrators and tab submodules

unit_tests/                   Service-layer unit tests (positive, negative, edge cases, RBAC)
e2e_tests/                    Service-layer end-to-end multi-actor user journeys
browser_tests/                Frontend unit tests: components, pages, tab modules (MinimalElement DOM simulation)
playwright_tests/             Full browser E2E tests via Playwright/Chromium

server.js                     Zero-dependency static file server
Dockerfile                    Production container image
Dockerfile.test               Test runner container image (includes Playwright)
docker-compose.yml            One-command app startup
playwright.config.js          Playwright configuration
run_tests.js                  Unified Node.js test runner (unit + e2e + browser)
run_tests.sh                  Docker-based test runner (all suites)
test-helpers.js               Shared InMemoryStore, assertions, service factory
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker | 20+ | Run the app and tests in a container |
| Node.js | 18+ | Run the server and tests locally (optional) |

No other tools, libraries, or accounts are required. All dependencies are either built into the browser or Node.js.

---

## Running the Application

### With Docker (recommended)

```bash
docker-compose up
```

Open **http://localhost:8080** in your browser.

```bash
docker-compose down   # stop
```

> Docker Desktop v2+ also accepts `docker compose` (without hyphen) as an alias.

### Without Docker

```bash
node server.js
```

Open **http://localhost:8080**. Requires Node.js 18+.

### Custom port

```bash
PORT=8099 node server.js
# or
PORT=8099 docker-compose up
```

---

## Testing

### Docker (canonical — no local setup required)

```bash
./run_tests.sh
```

Builds the test image (`Dockerfile.test`), runs all suites inside Docker, and exits with code 0 on success.

### Local

Unit, E2E, and browser simulation tests require no package installation:

```bash
node run_tests.js
```

Playwright E2E tests are included automatically when running via Docker
(`./run_tests.sh`). For local Playwright execution, refer to `Dockerfile.test`
for the required runtime setup.

### Test suites

| Suite | Location | Nature | What it covers |
|-------|----------|--------|---------------|
| Service unit | `unit_tests/` | Service-layer, in-process | Every public method on every service — positive, negative, edge cases, role enforcement |
| Service E2E | `e2e_tests/` | Service-layer, in-process | Full multi-actor user journeys via real service calls |
| Frontend unit | `browser_tests/` | DOM simulation (MinimalElement) | Components (Toast, Modal, Drawer, DataTable, AppShell, Chart), page classes (LoginPage, BootstrapPage, DashboardPage, RegistrationsPage, ReviewsPage, QuizPage, ContractsPage, AdminPage), and all 19 tab modules — render structure, RBAC gates, validation paths. Service calls are overridden by direct method replacement on imported singletons so no IndexedDB is touched. |
| Browser sim E2E | `browser_tests/` | DOM simulation (MinimalElement) | Route enforcement, persistence, import/export, smoke |
| Playwright E2E | `playwright_tests/` | Real Chromium | Full browser flows: auth, registrations, quiz, reviews, contracts, admin |

> **Coverage measurement:** `npm run test:coverage` runs the service/browser test suites under [c8](https://github.com/bcoe/c8) (V8 native coverage) and enforces ≥ 70% lines/branches/functions across `src/**/*.js`. The Playwright suite and IndexedDB adapter (`src/store/Database.js`) are excluded — those are exercised by Playwright against a running server, not the coverage runner.

> **Taxonomy note:** `unit_tests/` tests services in isolation using an `InMemoryStore` repository double — no IndexedDB. `browser_tests/` tests frontend classes using `MinimalElement` DOM simulation — no browser. Both are fast and require no external dependencies beyond Node.js 18+.

All unit/e2e/browser tests run with `node run_tests.js` — no browser required. Playwright tests launch a real Chromium instance against the running server.

---

## Demo Credentials

The default `docker-compose up` (and `DEMO_SEED=true node server.js`) automatically
creates four ready-to-use accounts on first launch. Open **http://localhost:8080** and
log in immediately — no setup required.

| Role | Username | Password |
|------|----------|----------|
| Administrator | `admin` | `Admin1234!` |
| Staff Reviewer | `reviewer` | `Review123!` |
| Instructor | `instructor` | `Teach1234!` |
| Learner | `learner` | `Learn1234!` |

Seeding is **idempotent** — if accounts already exist the seed step is skipped silently.
All passwords are hashed with PBKDF2 before storage; the plaintext values above are
never persisted anywhere.

### Disabling auto-seed (production / custom setup)

Run the server without the `DEMO_SEED` variable:

```bash
node server.js           # no DEMO_SEED → bootstrap screen appears on first launch
PORT=8080 docker-compose run --rm -e DEMO_SEED= app   # override to empty in Docker
```

When `DEMO_SEED` is absent the app enters **bootstrap mode** on first launch — a
dedicated screen blocks all other access until you create an administrator account
manually. After that, additional users are created via **Admin → Users → Create User**.

Security notes:
- Seed credentials are defined in `src/config/demoSeeds.js` — edit that file to change them
- Auto-seed only runs when the user database is completely empty
- All passwords are hashed with PBKDF2 before storage
- `createBootstrapAdmin()` and `seedDemoUsers()` both throw/no-op if users already exist
