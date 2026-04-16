# TrainingOps Enrollment & Quality Console

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

unit_tests/                   Unit tests for individual service methods
e2e_tests/                    Service-layer end-to-end user journeys
browser_tests/                Browser simulation tests (DOM, persistence, routing)
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
docker compose up
```

Open **http://localhost:8080** in your browser.

```bash
docker compose down   # stop
```

### Without Docker

```bash
node server.js
```

Open **http://localhost:8080**. Requires Node.js 18+.

### Custom port

```bash
PORT=8099 node server.js
# or
PORT=8099 docker compose up
```

---

## Testing

### Docker (canonical — no local setup required)

```bash
./run_tests.sh
```

Builds the test image (`Dockerfile.test`), runs all suites inside Docker, and exits with code 0 on success.

### Local

Unit, E2E, and browser simulation tests run with no package installation:

```bash
node run_tests.js
```

Playwright E2E tests require installing the test runner and Chromium (these run
automatically inside Docker via `./run_tests.sh`):

```bash
npm install                            # install @playwright/test
npx playwright install chromium --with-deps
npx playwright test                    # requires server on localhost:8080
```

### Test suites

| Suite | Location | What it covers |
|-------|----------|---------------|
| Unit | `unit_tests/` | Every public method on every service — positive, negative, edge cases, role enforcement |
| E2E (service-layer) | `e2e_tests/` | Full multi-actor user journeys via real service calls |
| Browser simulation | `browser_tests/` | DOM simulation, route enforcement, persistence, component rendering, import/export |
| Playwright E2E | `playwright_tests/` | Full browser flows: auth, registrations, quiz, reviews, contracts, admin |

All unit/e2e/browser tests run with `node run_tests.js` — no browser required. Playwright tests launch a real Chromium instance against the running server.

---

## Seeded Credentials

**The system has no default credentials.**

On first launch the app enters **bootstrap mode** — a dedicated screen blocks all other access until you create an administrator account:

1. Run the app and open **http://localhost:8080**
2. The bootstrap screen appears (only shown when the user database is empty)
3. Enter a username and password (minimum 8 characters)
4. The administrator account is created; bootstrap mode exits permanently

After that, the administrator creates additional users (Staff Reviewer, Instructor, Learner) through **Admin → Users**.

Security guarantees:
- No hardcoded credentials anywhere in the codebase
- No automatic credential seeding at any time
- All passwords are hashed with PBKDF2 before storage
- `createBootstrapAdmin()` throws if called when users already exist
