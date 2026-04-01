# TrainingOps Enrollment & Quality Console — Design Document

## 1. System Overview

TrainingOps is a fully offline, browser-based single-page application (SPA) for managing training enrollment, assessments, contracts, and trust workflows.

Primary roles:
- Administrator
- Staff Reviewer
- Instructor
- Learner

Core capabilities:
- registration lifecycle management (state machine)
- quiz/question bank and assessment workflows
- review and moderation system
- contract/template management with signing
- audit logging and trust signals (reputation, ratings)
- local analytics and dashboards
- full data portability (export/import)

The application runs entirely offline with all business logic implemented in a frontend service layer. Data is stored in IndexedDB (primary) and LocalStorage (secondary).

---

## 2. Design Goals

- Fully offline operation with no backend dependency
- Clear separation between UI, business logic, and persistence
- Deterministic workflows for registrations, grading, and moderation
- Modular architecture for maintainability and extensibility
- Complete functional flows (no mock-only UI)
- Secure local handling of sensitive data
- Future backend integration readiness

---

## 3. High-Level Architecture

The system follows a layered frontend-only architecture:

UI Layer (Pages / Components / Router)  
↓  
Application Services Layer  
↓  
Repository Layer (IndexedDB abstraction)  
↓  
IndexedDB + LocalStorage  

Supporting runtime modules:
- Event Bus
- Scheduler
- Crypto Service
- Import/Export Service
- Validation Engine

### Architecture Principle

All business logic resides in services. UI components are responsible only for rendering and user interaction.

---

## 4. Repository Abstraction

Each domain defines:
- a repository interface
- an IndexedDB implementation

Flow:
Service → Repository → IndexedDB

Benefits:
- decouples business logic from persistence
- improves maintainability
- enables future backend integration

---

## 5. Frontend Architecture

### 5.1 Framework

- Vanilla HTML/CSS/JavaScript SPA
- Hash-based routing
- Responsive layout

### 5.2 Route Structure

- `#/login`
- `#/dashboard`
- `#/registrations`
- `#/quiz`
- `#/reviews`
- `#/contracts`
- `#/admin`

### 5.3 UI Composition

- app shell with role-based navigation
- page-level views
- reusable components (tables, modals, drawers, forms)

### 5.4 Core Components

- registration queue table
- registration detail drawer
- audit timeline component
- quiz builder/editor
- grading interface
- review submission and moderation panel
- contract editor and signature canvas
- dashboard cards and charts

---

## 6. Application Services Layer

### 6.1 AuthService

- user authentication
- password hashing (PBKDF2)
- session handling
- lockout logic

---

### 6.2 RegistrationService

- registration CRUD
- state machine transitions
- validation rules
- waitlist handling (FIFO)
- cancellation handling
- audit logging

---

### 6.3 QuizService

- question bank CRUD
- bulk import validation
- paper generation rules
- answer evaluation
- wrong-question tracking

---

### 6.4 GradingService

- subjective grading (0–10)
- rubric validation
- grading persistence

---

### 6.5 ReviewService

- review CRUD
- follow-up logic (1 within 14 days)
- rating system
- favorites and Q&A
- support two-way ratings (learner ↔ instructor)
- tag-based feedback system

---

### 6.6 ModerationService

- sensitive word filtering
- abuse reporting workflow
- moderation queue
- resolution tracking (dismissed / removed / warned)

---

### 6.7 ReputationService

- score calculation (configurable weights)
- threshold enforcement (<60 restriction)
- rating aggregation

---

### 6.8 ContractService

- template management
- placeholder substitution
- versioning
- signature handling (canvas + hash)

---

### 6.9 NotificationService

- in-app notifications
- read/unread tracking
- event-triggered generation

---

### 6.10 AuditService

- append-only logs
- event tracking
- state transition history

---

### 6.11 ImportExportService

- full data export
- schema validation on import
- preview and overwrite confirmation

---

### 6.12 CryptoService

- password hashing (PBKDF2)
- AES encryption (sensitive data)
- masking utilities

---

### 6.13 SchedulerService

- periodic checks (reports, moderation deadlines)
- cleanup tasks

---

## 7. Data Persistence Design

### 7.1 IndexedDB Stores

- users
- sessions
- registrations
- registrationEvents
- questions
- quizzes
- quizResults
- reviews
- reports
- contracts
- templates
- auditLogs
- notifications
- reputationScores
- appConfig

---

### 7.2 LocalStorage

- session token
- UI preferences
- theme / layout state

---

### 7.3 Principle

Repositories are the only layer interacting with IndexedDB.

---

## 8. Domain Models

### 8.1 User

- id
- username
- passwordHash
- role
- lockoutUntil

---

### 8.2 Registration

- id
- userId
- status
- createdAt
- updatedAt

Statuses:
- Draft
- Submitted
- NeedsMoreInfo
- UnderReview
- Approved
- Rejected
- Cancelled
- Waitlisted

---

### 8.3 RegistrationEvent

- id
- registrationId
- type
- comment
- timestamp

---

### 8.4 Question

- id
- type
- text
- correctAnswer
- difficulty
- tags

---

### 8.5 Review

- id
- userId
- rating
- text
- images
- createdAt
- targetUserId
- direction (learner_to_instructor / instructor_to_learner)
- tags (array of strings)

---

### 8.6 Contract

- id
- templateId
- content
- signatureHash
- version

---

### 8.7 Report

- id
- targetId
- status
- resolution
- createdAt

---

## 9. Registration Workflow Design

Flow:
Draft → Submitted → Needs More Info → Under Review → Approved / Rejected

Optional:
- Cancelled
- Waitlisted

Rules:
- Approved and Rejected are terminal states
- rejection requires ≥20 character comment
- waitlist uses FIFO
- all transitions are logged

---

## 10. Quiz & Assessment Design

- multiple question types
- bulk import validation
- rule-based paper generation
- automatic grading (objective)
- manual grading (subjective)

---

## 11. Review & Moderation Design

- max 6 images (≤2MB each)
- sensitive word filtering
- abuse report lifecycle
- resolution required within 7 days

---

## 12. Contract & Signature Design

- template variables
- versioning system
- signature via canvas or typed input
- SHA-256 hash for integrity

---

## 13. Security Design

- PBKDF2 password hashing
- AES encryption for sensitive data
- masked UI display
- session handling

---

## 14. Import / Export

- full JSON backup
- schema validation
- overwrite confirmation

---

## 15. Error Handling

- validation before actions
- user-friendly error messages
- no silent failures

---

## 16. Logging

- audit logs for critical actions
- non-sensitive debug logs

---

## 17. Testing Strategy

### Unit
- state transitions
- validation rules
- scoring logic

### Integration
- registration flow
- quiz flow
- moderation flow

### E2E
- full user journey

---

## 18. Implementation Constraints

- Pure frontend only (no backend calls)
- All logic must exist in services
- IndexedDB is source of truth
- No mock-only UI
- Must be runnable locally with minimal setup

---

## 19. Additional Functional Modules

### 19.1 BrowsingHistoryService

Responsibilities:
- track viewed items (classes, questions, reviews)
- store timestamped history
- allow retrieval and filtering

---

### 19.2 QAService

Responsibilities:
- question thread creation
- answer submission
- linking answers to threads
- moderation integration

Models:

QuestionThread:
- id
- authorId
- title
- content
- createdAt

Answer:
- id
- threadId
- authorId
- content
- createdAt

---

## 20. Contract Enhancements

Contract model updates:
- status (initiated, signed, withdrawn, voided)

ContractService updates:
- manage signing state transitions
- log all contract lifecycle events
- generate print-friendly output using CSS (@media print)
- export contracts using Blob download

---

## 21. Import/Export Enhancements

ImportExportService updates:
- optional passphrase input
- AES encryption for exported data
- decryption during import
- validation before applying changes

---

## 22. Dashboard Metrics

Tracked KPIs:
- total registrations
- approval rate
- rejection rate
- average quiz score
- moderation resolution time
- class fill rate

---

## 23. Additional Data Stores

Add to IndexedDB:
- browsingHistory
- questionThreads
- answers