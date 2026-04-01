# TrainingOps Service Contract Specification

**Version:** 1.0
**Scope:** Service layer contracts for the TrainingOps frontend-only SPA.
**Architecture:** This is NOT an HTTP API. All contracts describe in-process JavaScript service method calls. Transport is direct function invocation; all persistence is IndexedDB via repository abstractions; all state is client-side.

---

## Conventions

### Error Semantics
- Methods that return `{ success, error }` objects **never throw** — they return the error shape.
- Methods listed as `throws` propagate a native `Error` object with the specified message.
- Callers must distinguish between the two patterns; they are not interchangeable.

### Authorization Fail-Closed
- Any userId that cannot be resolved to a real user record causes an authorization check to **throw**, not to silently downgrade permissions.
- The absence of a userId is equivalent to an unauthorized caller.

### Configuration
All threshold and limit values are read from `getConfig()` at call time, which merges `src/config/defaults.json` with any localStorage overrides. Default values are stated in parentheses throughout this document. They may differ at runtime if an administrator has applied overrides.

### Roles
| Constant | Value |
|----------|-------|
| `USER_ROLES.ADMINISTRATOR` | `"Administrator"` |
| `USER_ROLES.STAFF_REVIEWER` | `"Staff Reviewer"` |
| `USER_ROLES.INSTRUCTOR` | `"Instructor"` |
| `USER_ROLES.LEARNER` | `"Learner"` |

### ID Format
All generated IDs are opaque strings. Import validation rejects IDs that do not match `/^[a-zA-Z0-9_\-.:]+$/`.

### Timestamps
All `createdAt` / `updatedAt` / `timestamp` fields are ISO 8601 strings produced by `now()` (wraps `new Date().toISOString()`).

---

## Table of Contents

1. [AuthService](#1-authservice)
2. [RegistrationService](#2-registrationservice)
3. [ReviewService](#3-reviewservice)
4. [RatingService](#4-ratingservice)
5. [QuizService](#5-quizservice)
6. [GradingService](#6-gradingservice)
7. [ModerationService](#7-moderationservice)
8. [QAService](#8-qaservice)
9. [ContractService](#9-contractservice)
10. [ReputationService](#10-reputationservice)
11. [DashboardService](#11-dashboardservice)
12. [ImportExportService](#12-importexportservice)
13. [AuditService](#13-auditservice)

---

## 1. AuthService

Manages authentication, sessions, user creation, and password lifecycle.

**Constructor dependencies:** `userRepository`, `sessionRepository`, `cryptoService`, `auditService`

---

### 1.1 `init()`

**Purpose:** Restore an existing session from localStorage on app startup.

**Inputs:** None

**Output:**
```
User | null
```
Returns the persisted `User` object if a valid session exists, otherwise `null`.

**Errors:** None thrown. Returns `null` silently for any missing/invalid session.

**Authorization:** None required.

**Side Effects:**
- Reads `trainingops_session` from localStorage.
- If session or user not found, removes `trainingops_session` from localStorage.
- Sets `this._currentUser` on success.

---

### 1.2 `login(username, password)`

**Purpose:** Authenticate a user. Enforces lockout, password-reset gate, and brute-force tracking.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `username` | `string` | Required; non-empty after trim |
| `password` | `string` | Required; non-empty |

**Output (success):**
```js
{ success: true, user: User }
```

**Output (failure):**
```js
{ success: false, error: string }
// OR, for password-reset-required accounts:
{ success: false, requiresPasswordReset: true, userId: string, error: string }
```

**Errors (returned, never thrown):**

| Condition | `error` value |
|-----------|---------------|
| `username` is empty | `"Username is required."` |
| `password` is empty/falsy | `"Password is required."` |
| Username not found | `"Invalid username or password."` |
| Account locked (`lockoutUntil` in future) | `"Account locked. Try again in N minutes."` where N is remaining minutes (ceiling) |
| `_requiresPasswordReset === true` | `"Password reset required. Please set a new password to access your account."` with `requiresPasswordReset: true` and `userId` |
| `passwordHash` is null or lacks `:` separator | `"Account configuration error. Contact administrator."` |
| Wrong password (below lockout threshold) | `"Invalid username or password."` |
| Wrong password (threshold reached on this attempt) | `"Too many failed attempts. Account locked for 15 minutes."` |

**Authorization:** None required (pre-auth).

**State Transition Rules:**
- Failed password attempts increment `this._loginAttempts[username]`.
- When attempts reach 5 (`MAX_LOGIN_ATTEMPTS`), sets `user.lockoutUntil = now + 15 minutes`, persists user, resets counter to 0.
- Successful login resets `this._loginAttempts[username]` to 0 and clears `user.lockoutUntil` if set.
- `_requiresPasswordReset` check is evaluated **before** hash format check. A null-hash user with the reset flag always receives the reset response, never the config error.

**Side Effects:**
- On success: creates `Session { id, userId, createdAt }` in `sessionRepository`; writes session ID to localStorage; sets `this._currentUser`; calls `this.onSessionChange()` if set; appends audit log `action="login"`.
- On lockout trigger: persists updated user with `lockoutUntil`.
- On lockout cleared at success: persists user with `lockoutUntil: null`.

---

### 1.3 `logout()`

**Purpose:** Destroy the current session.

**Inputs:** None

**Output:** `undefined` (fire-and-forget)

**Errors:** None thrown. Session deletion errors are silently swallowed.

**Authorization:** Operates on `this._currentUser`; safe to call even if no user is logged in.

**Side Effects:**
- Deletes session from `sessionRepository` (non-fatal if missing).
- Removes `trainingops_session` from localStorage.
- Appends audit log `action="logout"` if a user was logged in.
- Sets `this._currentUser = null`.
- Calls `this.onSessionChange()` if set.

---

### 1.4 `isBootstrapNeeded()`

**Purpose:** Determine whether the system requires first-run administrator setup.

**Inputs:** None

**Output:** `boolean` — `true` if user store is empty, `false` otherwise.

**Errors:** None thrown.

**Authorization:** None required.

**Side Effects:** None.

---

### 1.5 `createBootstrapAdmin(username, password)`

**Purpose:** Create the first administrator account during first-run setup. Cannot be called again once any user exists.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `username` | `string` | Required; non-empty after trim |
| `password` | `string` | Required; minimum 8 characters |

**Output (success):**
```js
{ success: true, user: User }
```

**Output (failure):**
```js
{ success: false, error: string }
```

**Errors:**

| Condition | Behavior |
|-----------|----------|
| Users already exist | **Throws** `"Bootstrap setup has already been completed. An administrator account exists."` |
| `username` is empty | Returns `{ success: false, error: "Username is required." }` |
| `password` shorter than 8 chars | Returns `{ success: false, error: "Password must be at least 8 characters." }` |

**Authorization:** None required (pre-auth, guarded by user-count check).

**Side Effects:**
- Hashes password via `cryptoService.hashPassword()`.
- Persists `User` with `role = ADMINISTRATOR` to `userRepository`.
- Appends audit log `action="bootstrap"`.

---

### 1.6 `registerUser(username, password, role, displayName?)`

**Purpose:** Create a new user account (administrator action only).

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `username` | `string` | Required; non-empty after trim; must not already exist |
| `password` | `string` | Required; minimum 8 characters |
| `role` | `string` | Must be one of `USER_ROLES` values |
| `displayName` | `string` | Optional; defaults to `username` |

**Output (success):**
```js
{ success: true, user: User }
```

**Output (failure):**
```js
{ success: false, error: string }
```

**Errors:**

| Condition | Behavior |
|-----------|----------|
| `this._currentUser` is null or not `ADMINISTRATOR` | **Throws** `"Only administrators can create users."` |
| `username` is empty | Returns `{ success: false, error: "Username is required." }` |
| `password` shorter than 8 chars | Returns `{ success: false, error: "Password must be at least 8 characters." }` |
| Username already exists | Returns `{ success: false, error: "Username already exists." }` |
| Invalid role value | Returns `{ success: false, error: "Invalid role. Must be one of: Administrator, Staff Reviewer, Instructor, Learner" }` |

**Authorization:** Caller must be the currently authenticated `ADMINISTRATOR` (checked via `this._currentUser.role`).

**Side Effects:**
- Hashes password via `cryptoService.hashPassword()`.
- Persists new `User` to `userRepository`.
- Appends audit log `action="created"`.

---

### 1.7 `resetPassword(userId, newPassword)`

**Purpose:** Reset a user's password. Used for plaintext-import recovery (`_requiresPasswordReset`) and admin-initiated resets. Does not require the caller to be the target user.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `userId` | `string` | Required; non-null/non-empty |
| `newPassword` | `string` | Required; minimum 8 characters |

**Output (success):**
```js
{ success: true }
```

**Output (failure):**
```js
{ success: false, error: string }
```

**Errors (returned):**

| Condition | `error` value |
|-----------|---------------|
| `userId` is falsy | `"User ID is required."` |
| `newPassword` shorter than 8 chars | `"Password must be at least 8 characters."` |
| User not found | `"User not found."` |

**Authorization:** No role check enforced at this layer. Callers (pages/controllers) are responsible for verifying permission before invoking.

**Side Effects:**
- Hashes new password via `cryptoService.hashPassword()`.
- Updates `user.passwordHash`, sets `user._requiresPasswordReset = false`, updates `user.updatedAt`.
- Persists user via `userRepository.put()`.
- Appends audit log `action="password_reset"`.

---

### 1.8 `getCurrentUser()`

**Purpose:** Return the currently authenticated user.

**Inputs:** None

**Output:** `User | null`

**Errors:** None.

**Authorization:** None.

**Side Effects:** None.

---

### 1.9 `isAuthenticated()`

**Purpose:** Check whether any user is currently logged in.

**Inputs:** None

**Output:** `boolean`

**Errors:** None.

**Authorization:** None.

**Side Effects:** None.

---

### 1.10 `hasRole(...roles)`

**Purpose:** Check whether the current user holds one of the specified roles.

**Inputs:** One or more role strings (variadic).

**Output:** `boolean` — `false` if not authenticated.

**Errors:** None.

**Authorization:** None.

**Side Effects:** None.

---

### User Object Shape

```js
{
  id: string,
  username: string,
  passwordHash: string | null,         // "hash:salt" (PBKDF2); null for plaintext-imported users
  role: "Administrator" | "Staff Reviewer" | "Instructor" | "Learner",
  displayName: string,
  email: string,
  lockoutUntil: string | null,         // ISO 8601; null when not locked
  _requiresPasswordReset: boolean,     // true for plaintext-imported users
  createdAt: string,
  updatedAt: string,
}
```

---

## 2. RegistrationService

Manages registration CRUD, the 8-state machine, batch transitions, waitlist promotion, and audit logging.

**Constructor dependencies:** `registrationRepository`, `registrationEventRepository`, `classRepository`, `userRepository`, `auditService`, `reputationService`

---

### Registration State Machine

```
Draft ──────────────────────────────────► Cancelled (terminal)
  │
  ▼
Submitted ──────────────────────────────► Cancelled (terminal)
  │          │             │
  ▼          ▼             ▼
NeedsMoreInfo  Waitlisted  UnderReview ──► Cancelled (terminal)
  │                │          │      │
  ▼                ▼          ▼      ▼
Submitted    UnderReview  Approved  Rejected (terminal)
                                │
                                ▼
                           Cancelled (terminal)
```

**Full transition table (from `defaults.json`):**

| From | Allowed To |
|------|-----------|
| Draft | Submitted, Cancelled |
| Submitted | NeedsMoreInfo, UnderReview, Cancelled, Waitlisted |
| NeedsMoreInfo | Submitted, Cancelled |
| UnderReview | Approved, Rejected, NeedsMoreInfo, Cancelled |
| Waitlisted | UnderReview, Cancelled |
| Approved | Cancelled |
| Rejected | *(terminal — no transitions)* |
| Cancelled | *(terminal — no transitions)* |

**Reviewer-only target states:** UnderReview, Approved, Rejected, NeedsMoreInfo, Waitlisted

**Self-service states (learner/owner may trigger):** Submitted, Cancelled

---

### 2.1 `create(userId, classId, notes?)`

**Purpose:** Create a new registration for a learner. Enforces class availability and reputation gate.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `userId` | `string` | Required |
| `classId` | `string` | Required |
| `notes` | `string` | Optional; defaults to `""` |

**Output:**
```js
Registration  // see Registration Object Shape below
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `userId` falsy | `"userId is required to create a registration."` |
| `classId` falsy | `"classId is required to create a registration."` |
| Class not found | `"Class not found. Cannot create registration for unknown class."` |
| Class status is `"completed"` | `"Cannot register for a completed class."` |
| Approved count ≥ class capacity | `"This class is at full capacity. No spots available."` |

**Authorization:** None checked at this layer (userId is trusted from session).

**State Transition Rules:**
- If `reputationService.isRestricted(userId)` returns `true` (score < threshold, default 60), initial status is `NeedsMoreInfo` and `"[LOW REPUTATION - REQUIRES MANUAL REVIEW]"` is appended to notes.
- If not restricted, initial status is `Draft`.
- If user has no reputation record, `isRestricted` returns `false` (not restricted).

**Side Effects:**
- Persists `Registration` via `registrationRepository.add()`.
- Persists `RegistrationEvent` (fromStatus=null, toStatus=initialStatus).
- Appends audit log `action="created"`.
- Emits `eventBus.emit("registration:created", registration)`.

---

### 2.2 `transition(registrationId, newStatus, comment, userId)`

**Purpose:** Transition a registration to a new status, enforcing RBAC and state machine rules.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `registrationId` | `string` | Required |
| `newStatus` | `string` | Required; must be a valid `REGISTRATION_STATUS` value |
| `comment` | `string` | Optional; required (≥20 chars by default) when `newStatus` is `Rejected` |
| `userId` | `string` | Required |

**Output:**
```js
Registration  // updated object
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `registrationId` falsy | `"registrationId is required."` |
| `newStatus` falsy | `"newStatus is required."` |
| `userId` falsy | `"userId is required for transition."` |
| Registration not found | `"Registration not found."` |
| Transition not allowed by state machine | `"Cannot transition from {from} to {newStatus}."` |
| Acting user not found | `"Acting user not found. Cannot perform transition."` |
| Reviewer-only target + non-reviewer caller | `"Only administrators or staff reviewers can transition to {newStatus}."` |
| Non-reviewer + not owner | `"You can only modify your own registrations."` |
| Non-reviewer + non-self-service target | `"You do not have permission to transition to {newStatus}."` |
| `newStatus === "Rejected"` + comment < `rejectionCommentMinLength` (default 20) | `"Rejection comment must be at least 20 characters."` |

**Authorization:**
- Reviewer-only transitions (UnderReview, Approved, Rejected, NeedsMoreInfo, Waitlisted): caller must have role `ADMINISTRATOR` or `STAFF_REVIEWER`.
- Self-service transitions (Submitted, Cancelled): caller must be the registration owner.
- Admins and reviewers may transition any registration regardless of ownership.

**State Transition Rules:** Governed by `getTransitions()` from `appConfig`. Transitions violating the table throw immediately.

**Side Effects:**
- Persists updated `Registration`.
- Persists `RegistrationEvent` (fromStatus, toStatus, comment, userId).
- Appends audit log `action="status_change"`.
- Emits `eventBus.emit("registration:transition", { registration, fromStatus, toStatus })`.
- If `Approved → Cancelled`: triggers `_checkWaitlistPromotion(classId, userId)`.

---

### 2.3 Waitlist Promotion (internal: `_checkWaitlistPromotion`)

**Purpose:** Automatically promote the oldest waitlisted registration when a seat opens.

**Trigger:** Called internally when a registration transitions from `Approved` to `Cancelled`.

**Logic:**
1. Compute current fill rate: `approvedCount / class.capacity`.
2. If fill rate ≥ `waitlistPromotionFillRate` (default 0.95), no promotion occurs.
3. Find waitlisted registrations for the class; sort by `createdAt` ascending (FIFO).
4. Promote the first one: transition to `UnderReview`.

**Side Effects:**
- Updates promoted registration in `registrationRepository`.
- Persists `RegistrationEvent` with comment `"Auto-promoted from waitlist (seat available, fill rate < 95%)"`.
- Appends audit log `action="status_change"`.
- Emits `eventBus.emit("registration:transition", ...)`.

---

### 2.4 `batchTransition(registrationIds[], newStatus, comment, userId)`

**Purpose:** Transition multiple registrations in a single call. Failures are per-item and do not abort the batch.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `registrationIds` | `string[]` | Array of registration IDs |
| `newStatus` | `string` | Required |
| `comment` | `string` | Optional |
| `userId` | `string` | Required |

**Output:**
```js
Array<{ id: string, success: true, registration: Registration }
     | { id: string, success: false, error: string }>
```

**Errors:** Individual transition errors are captured per-item; no exception propagates from the batch method itself.

**Authorization:** Delegated to `transition()` for each item.

**Side Effects:** Same as `transition()` per item.

---

### 2.5 `getAllScoped(actingUserId)`

**Purpose:** Return registrations visible to the acting user based on role.

**Inputs:** `actingUserId: string`

**Output:** `Registration[]`

**Errors:** Returns `[]` if `actingUserId` is falsy or user not found.

**Authorization:**
- `ADMINISTRATOR` or `STAFF_REVIEWER`: all registrations.
- All other roles: only registrations where `registration.userId === actingUserId`.

---

### 2.6 `getClassFillRate(classId)`

**Purpose:** Return the ratio of approved registrations to class capacity.

**Inputs:** `classId: string`

**Output:** `number` — value in `[0, 1]`. Returns `0` if class not found or has no capacity.

---

### 2.7 Read Methods (no side effects)

| Method | Output |
|--------|--------|
| `getById(registrationId)` | `Registration \| null` |
| `getAll()` | `Registration[]` |
| `getByUserId(userId)` | `Registration[]` |
| `getByStatus(status)` | `Registration[]` |
| `getByStatusScoped(status, actingUserId)` | `Registration[]` scoped by role |
| `getByClassId(classId)` | `Registration[]` |
| `getEvents(registrationId)` | `RegistrationEvent[]` |

---

### Registration Object Shape

```js
{
  id: string,
  userId: string,
  classId: string,
  status: "Draft" | "Submitted" | "NeedsMoreInfo" | "UnderReview" | "Approved" | "Rejected" | "Cancelled" | "Waitlisted",
  notes: string,
  createdAt: string,
  updatedAt: string,
}
```

### RegistrationEvent Object Shape

```js
{
  id: string,
  registrationId: string,
  fromStatus: string | null,
  toStatus: string,
  comment: string,
  userId: string,
  timestamp: string,
}
```

---

## 3. ReviewService

Manages review submission, follow-ups, image storage, and sensitive-word filtering.

**Constructor dependencies:** `reviewRepository`, `imageRepository`, `classRepository`, `registrationRepository`, `auditService`, `moderationService`

**Config-driven limits (from `defaults.json`):**

| Key | Default |
|-----|---------|
| `review.maxTextLength` | 2000 chars |
| `review.maxImages` | 6 |
| `review.maxImageSizeMB` | 2 MB |
| `review.followUpWindowDays` | 14 days |

---

### 3.1 `submitReview({ userId, targetUserId, targetClassId, direction, rating, text, images, tags })`

**Purpose:** Submit a review for a completed class. Enforces participation, uniqueness, content moderation, and image constraints.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `userId` | `string` | Required (reviewer's ID) |
| `targetUserId` | `string \| null` | Optional; if provided, must be a different user and participant in the same class |
| `targetClassId` | `string` | Required |
| `direction` | `string` | One of `REVIEW_DIRECTIONS` values (`"learner_to_instructor"`, `"instructor_to_learner"`, `"learner_to_class"`) |
| `rating` | `integer` | Required; 1–5 inclusive |
| `text` | `string` | Optional; max `maxTextLength` (default 2000) chars; screened for sensitive words |
| `images` | `ImageInput[]` | Optional; max `maxImages` (default 6); each `≤ maxImageSizeMB` (default 2MB); MIME must be `image/jpeg` or `image/png` |
| `tags` | `string[]` | Optional; defaults to `[]` |

**Output:**
```js
Review  // see Review Object Shape
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `rating` not integer 1–5 | `"Rating must be between 1 and 5."` |
| `text` exceeds max length | `"Review text must be at most 2000 characters."` |
| `text` contains sensitive words | `"Review contains prohibited content: {words}. Please revise."` |
| `images.length` > max | `"Maximum 6 images allowed."` |
| Any image size > max | `"Each image must be under 2MB."` |
| Any image MIME not JPG/PNG | `"Only JPG and PNG images are allowed."` |
| `targetClassId` falsy | `"targetClassId is required. Reviews must be tied to a completed class."` |
| Class not found | `"Class not found. Reviews must reference an existing class."` |
| Class not completed | `"Reviews can only be submitted for completed classes."` |
| Reviewer neither approved participant nor instructor | `"You can only review a class you participated in (approved registration required)."` |
| `targetUserId === userId` | `"You cannot review yourself."` |
| `targetUserId` not participant/instructor of same class | `"The reviewed user must also be a participant in the same class."` |
| Duplicate review (same reviewer + target + class, non-follow-up) | `"You have already submitted a review for this class and recipient."` |

**Authorization:** None enforced at service level beyond participation check. Caller identity trusted.

**Side Effects:**
- Stores each image via `imageRepository.add()` as `{ id, entityId, entityType:"review", data, filename, size, type, createdAt }`.
- Persists `Review` with `images` as array of image reference objects `{ imageId, filename, size, type }`.
- Appends audit log `action="created"`.

---

### 3.2 `submitFollowUp(originalReviewId, { text, rating, images, tags }, userId)`

**Purpose:** Submit one follow-up to an existing review. Only the original reviewer may do so, within the follow-up window.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `originalReviewId` | `string` | Required; must exist |
| `userId` | `string` | Must be the original reviewer |
| `text` | `string` | Optional; max `maxTextLength`; sensitive-word screened |
| `rating` | `integer \| null` | Optional; if provided, 1–5; defaults to original rating if omitted |
| `images` | `ImageInput[]` | Optional; same rules as `submitReview` |
| `tags` | `string[]` | Optional |

**Output:**
```js
Review  // with followUpOf = originalReviewId
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| Original not found | `"Original review not found."` |
| `userId !== original.userId` | `"Only the original reviewer can follow up."` |
| Follow-up already exists | `"A follow-up review has already been submitted."` |
| More than `followUpWindowDays` since original | `"Follow-up reviews must be submitted within 14 days."` |
| `rating` provided but not integer 1–5 | `"Rating must be between 1 and 5."` |
| `text` exceeds max | `"Review text must be at most 2000 characters."` |
| `text` contains sensitive words | `"Follow-up contains prohibited content: {words}. Please revise."` |
| Image count/size/type violations | Same messages as `submitReview` |

**Authorization:** Only the original reviewer (enforced by `userId` comparison).

**Side Effects:**
- Stores images via `imageRepository.add()`.
- Persists follow-up `Review` with `followUpOf = originalReviewId`.
- Inherits `targetUserId`, `targetClassId`, `direction` from original.
- Appends audit log `action="follow_up"`.

---

### 3.3 Read Methods

| Method | Output |
|--------|--------|
| `getById(reviewId)` | `Review \| null` |
| `getAll()` | `Review[]` |
| `getByUserId(userId)` | `Review[]` |
| `getByTargetUserId(targetUserId)` | `Review[]` |
| `getByDirection(direction)` | `Review[]` |

---

### Review Object Shape

```js
{
  id: string,
  userId: string,                      // reviewer
  targetUserId: string | null,
  targetClassId: string,
  direction: "learner_to_instructor" | "instructor_to_learner" | "learner_to_class",
  rating: 1 | 2 | 3 | 4 | 5,
  text: string,
  images: Array<{ imageId: string, filename: string, size: number, type: string }>,
  tags: string[],
  followUpOf: string | null,           // null for original reviews
  createdAt: string,
}
```

---

## 4. RatingService

Two-way ratings with explicit status, appeal filing, and appeal resolution.

**Constructor dependencies:** `ratingRepository`, `appealRepository`, `userRepository`, `registrationRepository`, `classRepository`, `auditService`

---

### 4.1 `submitRating({ fromUserId, toUserId, classId, score, tags, comment })`

**Purpose:** Submit a rating from one class participant to another after class completion.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `fromUserId` | `string` | Required |
| `toUserId` | `string` | Required; must differ from `fromUserId` |
| `classId` | `string` | Required |
| `score` | `integer` | Required; 1–5 inclusive |
| `tags` | `string[]` | Optional; defaults to `[]` |
| `comment` | `string` | Optional; defaults to `""` |

**Output:**
```js
Rating  // see Rating Object Shape
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `fromUserId` falsy | `"fromUserId is required."` |
| `toUserId` falsy | `"toUserId is required."` |
| `fromUserId === toUserId` | `"Cannot rate yourself."` |
| `score` not integer 1–5 | `"Score must be between 1 and 5."` |
| `classId` falsy | `"classId is required. Ratings can only be submitted for a completed class."` |
| Class not found | `"Class not found."` |
| Class not completed | `"Ratings can only be submitted for completed classes."` |
| `fromUserId` not approved participant and not instructor | `"You can only rate a class you participated in (approved registration required)."` |
| `toUserId` not approved participant and not instructor | `"The rated user must also be a participant in the same completed class."` |

**Authorization:** Enforced via class participation check only; no session role check.

**Side Effects:**
- Persists `Rating` with `status = "active"`.
- Appends audit log `action="created"`.

---

### 4.2 `fileAppeal(ratingId, appealerId, reason)`

**Purpose:** File an appeal on a rating received by the caller.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `ratingId` | `string` | Required |
| `appealerId` | `string` | Required; must be the rating's `toUserId` |
| `reason` | `string` | Required; non-empty after trim |

**Output:**
```js
Appeal  // see Appeal Object Shape
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `ratingId` falsy | `"ratingId is required."` |
| `appealerId` falsy | `"appealerId is required."` |
| `reason` empty/falsy | `"Appeal reason is required."` |
| Rating not found | `"Rating not found."` |
| `rating.toUserId !== appealerId` | `"Only the rated user can file an appeal on this rating."` — also appends audit log `action="unauthorized_attempt"` |
| Pending appeal already exists for this rating | `"An appeal is already pending for this rating."` |

**Authorization:** Only the subject of the rating (`rating.toUserId`) may appeal.

**Side Effects:**
- Persists `Appeal` with `status = "pending"`.
- Appends audit log `action="filed"`.
- On unauthorized attempt: appends audit log `action="unauthorized_attempt"` before throwing.

---

### 4.3 `resolveAppeal(appealId, decision, rationale, reviewerId, adjustedScore?)`

**Purpose:** Resolve a pending appeal with a written decision. Applies void or score adjustment to the underlying rating.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `appealId` | `string` | Required |
| `decision` | `string` | One of `"upheld"`, `"adjusted"`, `"voided"` |
| `rationale` | `string` | Required; non-empty |
| `reviewerId` | `string` | Required; must be `ADMINISTRATOR` or `STAFF_REVIEWER` |
| `adjustedScore` | `integer \| null` | Required when `decision === "adjusted"`; 1–5 |

**Output:**
```js
Appeal  // updated with decision, rationale, resolvedAt
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `appealId` falsy | `"appealId is required."` |
| `reviewerId` falsy | `"reviewerId is required."` |
| Acting user not found | `"Acting user not found. Cannot resolve appeal."` |
| Acting user lacks reviewer/admin role | `"Only administrators or staff reviewers can resolve appeals."` |
| Appeal not found | `"Appeal not found."` |
| Appeal not in `pending` status | `"Appeal has already been resolved."` |
| `rationale` empty | `"Written rationale is required."` |
| `decision` not in `["upheld","adjusted","voided"]` | `"Decision must be one of: upheld, adjusted, voided"` |
| `decision === "adjusted"` and `adjustedScore` null or not 1–5 | `"Adjusted score must be between 1 and 5."` |

**Authorization:** `ADMINISTRATOR` or `STAFF_REVIEWER` only.

**State Transition Rules:**
- `decision = "voided"`: sets `rating.status = "voided"`. Voided ratings are excluded from all active queries.
- `decision = "adjusted"`: sets `rating.score = adjustedScore`, `rating.status = "adjusted"`.
- `decision = "upheld"`: no change to rating.

**Side Effects:**
- Persists updated `Appeal` (status, decision, rationale, reviewerId, adjustedScore, resolvedAt).
- Persists updated `Rating` if decision is `voided` or `adjusted`.
- Appends audit log `action="resolved"`.

---

### 4.4 Read Methods

| Method | Output | Notes |
|--------|--------|-------|
| `getRatingById(ratingId)` | `Rating \| null` | Includes voided |
| `getActiveRatingsForUser(toUserId)` | `Rating[]` | Excludes `status="voided"` |
| `getRatingsForUser(toUserId)` | `Rating[]` | All statuses |
| `getRatingsByUser(fromUserId)` | `Rating[]` | Ratings submitted by this user |
| `getAllActiveRatings()` | `Rating[]` | Excludes `status="voided"` |
| `getAllRatings()` | `Rating[]` | All statuses |
| `getPendingAppeals()` | `Appeal[]` | Only `status="pending"` |
| `getAppealsByRatingId(ratingId)` | `Appeal[]` | All statuses for that rating |
| `getAllAppeals()` | `Appeal[]` | All |

---

### Rating Object Shape

```js
{
  id: string,
  fromUserId: string,
  toUserId: string,
  classId: string,
  score: 1 | 2 | 3 | 4 | 5,
  tags: string[],
  comment: string,
  status: "active" | "adjusted" | "voided",
  createdAt: string,
}
```

### Appeal Object Shape

```js
{
  id: string,
  ratingId: string,
  appealerId: string,
  reason: string,
  status: "pending" | "upheld" | "adjusted" | "voided",
  reviewerId: string | null,
  decision: string | null,
  rationale: string,
  adjustedScore: number | null,
  resolvedAt: string | null,
  createdAt: string,
}
```

---

## 5. QuizService

Question bank CRUD, bulk JSON import, paper generation with distribution rules, auto-grading, and wrong-question tracking.

**Constructor dependencies:** `questionRepository`, `quizRepository`, `quizResultRepository`, `wrongQuestionRepository`, `userRepository`, `auditService`

---

### Question Types

| Constant | Value |
|----------|-------|
| `QUESTION_TYPES.SINGLE` | `"single"` |
| `QUESTION_TYPES.MULTIPLE` | `"multiple"` |
| `QUESTION_TYPES.FILL_IN` | `"fill_in"` |
| `QUESTION_TYPES.SUBJECTIVE` | `"subjective"` |

---

### 5.1 `createQuestion(data)`

**Purpose:** Add a single question to the bank.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `data.createdBy` | `string` | Required; must be `INSTRUCTOR` or `ADMINISTRATOR` |
| `data.questionText` | `string` | Required; non-empty after trim |
| `data.type` | `string` | Must be one of `QUESTION_TYPES` |
| `data.correctAnswer` | `any` | Required for non-subjective types; may be string or array |
| `data.difficulty` | `integer` | Required; 1–5 inclusive |
| `data.options` | `any[]` | Optional |
| `data.tags` | `string[]` | Optional |
| `data.chapter` | `string` | Optional |
| `data.explanation` | `string` | Optional |

**Output:**
```js
Question
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `data.createdBy` not `INSTRUCTOR`/`ADMINISTRATOR` | `"Only instructors or administrators can manage questions."` |
| `questionText` empty | `"questionText is required."` |
| `type` not in `QUESTION_TYPES` | `"type must be one of: single, multiple, fill_in, subjective"` |
| `correctAnswer` missing for non-subjective | `"correctAnswer is required for non-subjective questions."` |
| `difficulty` not integer 1–5 | `"difficulty must be an integer between 1 and 5."` |

**Authorization:** `INSTRUCTOR` or `ADMINISTRATOR` only (fail-closed: unknown user throws).

**Side Effects:**
- Persists `Question` via `questionRepository.add()`.
- Appends audit log `action="created"`.

---

### 5.2 `updateQuestion(id, updates, userId)`

**Purpose:** Update an existing question in place.

**Inputs:** `id: string`, `updates: object` (partial question fields), `userId: string`

**Output:** `Question` (mutated in place)

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `userId` lacks `INSTRUCTOR`/`ADMINISTRATOR` role | `"Only instructors or administrators can manage questions."` |
| Question not found | `"Question not found."` |

**Authorization:** `INSTRUCTOR` or `ADMINISTRATOR` only.

**Side Effects:** Persists updated question (`updatedAt` set). Appends audit log `action="updated"`.

---

### 5.3 `deleteQuestion(id, userId)`

**Purpose:** Remove a question from the bank.

**Inputs:** `id: string`, `userId: string`

**Output:** `undefined`

**Errors (throws):** Same role check as `updateQuestion`.

**Authorization:** `INSTRUCTOR` or `ADMINISTRATOR` only.

**Side Effects:** Deletes from `questionRepository`. Appends audit log `action="deleted"`.

---

### 5.4 `getQuestionsForLearner()`

**Purpose:** Return all questions with `correctAnswer` stripped. Safe for learner-facing views.

**Inputs:** None

**Output:** `QuestionSafe[]` — each question without `correctAnswer` field.

**Authorization:** None.

**Side Effects:** None.

---

### 5.5 `getQuestionByIdForLearner(id)`

**Purpose:** Return a single question with `correctAnswer` stripped.

**Inputs:** `id: string`

**Output:** `QuestionSafe | null`

**Authorization:** None.

**Side Effects:** None.

---

### 5.6 `bulkImport(rows[], createdBy?)`

**Purpose:** Import multiple questions from a validated JSON array.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `rows` | `object[]` | Non-empty array; each row validated by `validateQuestionRow()` |
| `createdBy` | `string` | Optional; defaults to `"system"`; must be `INSTRUCTOR`/`ADMINISTRATOR` |

**Output (success):**
```js
{ success: true, count: number }
```

**Output (failure):**
```js
{ success: false, errors: string[] }
```

**Errors:** Validation errors are collected across all rows and returned in `errors` array — never thrown. Role error is thrown.

**Authorization:** `INSTRUCTOR` or `ADMINISTRATOR` only.

**Side Effects (on success):**
- Bulk-persists all questions via `questionRepository.bulkAdd()`.
- Appends audit log `action="bulk_import"`.

---

### 5.7 `generatePaper(title, classId, rules, createdBy)`

**Purpose:** Select questions from the bank according to distribution and chapter constraints, produce a `Quiz` record.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `title` | `string` | Required; non-empty |
| `classId` | `string` | Optional class binding |
| `rules` | `object` | Required; must include `totalQuestions: integer > 0` |
| `rules.difficultyDistribution` | `object` | Optional; maps difficulty level → fraction; fractions should sum to ≤ 1 |
| `rules.chapterConstraints` | `object` | Optional; maps chapter name → minimum question count |
| `createdBy` | `string` | Required; `INSTRUCTOR` or `ADMINISTRATOR` |

**Output:**
```js
Quiz  // see Quiz Object Shape
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| Role check fails | `"Only instructors or administrators can manage questions."` |
| `title` empty | `"Paper title is required."` |
| `rules` missing or no `totalQuestions` | `"Paper rules with totalQuestions are required."` |
| Question bank empty | `"No questions available in the bank."` |
| `totalQuestions ≤ 0` | `"totalQuestions must be greater than 0."` |
| Insufficient questions to satisfy constraints | `"Cannot generate quiz: insufficient questions. Required N, found only M. Add more questions or adjust constraints."` |

**Authorization:** `INSTRUCTOR` or `ADMINISTRATOR` only.

**Selection Algorithm:**
1. Apply `chapterConstraints` first — reserve minimum questions per chapter.
2. Fill remaining slots from difficulty distribution buckets (shuffled within each bucket).
3. If distribution fractions don't sum to 1, remainder is added to the last difficulty tier.
4. Dedup by question ID.
5. Truncate or throw if final count < `totalQuestions`.

**Side Effects:**
- Persists `Quiz` via `quizRepository.add()`.
- Appends audit log `action="created"`.

---

### 5.8 `submitAnswers(quizId, userId, answers[])`

**Purpose:** Grade a quiz attempt. Auto-grades objective questions; creates wrong-question records; returns the result.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `quizId` | `string` | Required |
| `userId` | `string` | Required |
| `answers` | `Array<{ questionId: string, answer: any }>` | Required; must be array |

**Output:**
```js
QuizResult  // see QuizResult Object Shape
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `quizId` falsy | `"quizId is required."` |
| `userId` falsy | `"userId is required."` |
| `answers` not array | `"answers must be an array."` |
| Duplicate in-flight submission for same `quizId:userId` | `"Submission already in progress. Please wait."` |
| Quiz not found | `"Quiz not found."` |
| Quiz has no questions | `"Quiz has no questions."` |

**Authorization:** None.

**Grading Logic:**
- `single`, `fill_in`: case-insensitive string equality after trim.
- `multiple`: both correct answer and given answer sorted as arrays, then JSON compared.
- `subjective`: marked `autoGraded = false`, `isCorrect = null` — must be manually graded via `GradingService`.
- `objectiveScore`: percentage of correct objective answers (0–100), or `null` if no objective questions.

**In-flight Guard:** A `Set` keyed by `"quizId:userId"` prevents duplicate concurrent submissions. The key is removed in a `finally` block.

**Side Effects:**
- Persists `QuizResult` via `quizResultRepository.add()`.
- For each incorrect objective answer: persists `WrongQuestion` record via `wrongQuestionRepository.add()`.

---

### 5.9 Read Methods

| Method | Output |
|--------|--------|
| `getQuestionById(id)` | `Question \| null` (includes `correctAnswer`) |
| `getAllQuestions()` | `Question[]` (includes `correctAnswer`) |
| `getQuestionsByType(type)` | `Question[]` |
| `getQuestionsByDifficulty(difficulty)` | `Question[]` |
| `getAllQuizzes()` | `Quiz[]` |
| `getQuizById(quizId)` | `Quiz \| null` |
| `getAllQuizResults()` | `QuizResult[]` |
| `getResultsByUserId(userId)` | `QuizResult[]` |
| `getResultsByQuizId(quizId)` | `QuizResult[]` |
| `getWrongQuestions(userId)` | `WrongQuestion[]` |

---

### Quiz Object Shape

```js
{
  id: string,
  title: string,
  classId: string | null,
  questionIds: string[],
  rules: object,
  createdBy: string,
  createdAt: string,
}
```

### QuizResult Object Shape

```js
{
  id: string,
  quizId: string,
  userId: string,
  answers: Array<{
    questionId: string,
    answer: any,
    autoGraded: boolean,
    isCorrect: boolean | null,
  }>,
  objectiveScore: number | null,       // 0–100 percentage; null if no objective questions
  subjectiveScores: {                  // populated by GradingService
    [questionId]: { score, notes, gradedBy, gradedAt }
  },
  totalScore: number | null,           // 0–100; null until fully graded
  gradedBy: string | null,
  gradedAt: string | null,
}
```

---

## 6. GradingService

Subjective answer grading with 0–10 rubric and composite score recalculation.

**Constructor dependencies:** `quizResultRepository`, `userRepository`, `auditService`

---

### 6.1 `gradeSubjective(resultId, questionId, score, notes, gradedBy)`

**Purpose:** Assign a manual score (0–10) to a subjective answer within a quiz result. Recalculates composite `totalScore`.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `resultId` | `string` | Required |
| `questionId` | `string` | Required |
| `score` | `integer` | Required; 0–10 inclusive |
| `notes` | `string` | Optional |
| `gradedBy` | `string` | Required; must be `INSTRUCTOR` or `ADMINISTRATOR` |

**Output:**
```js
QuizResult  // with updated subjectiveScores and totalScore
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `gradedBy` falsy | `"gradedBy userId is required."` |
| Acting user not found | `"Acting user not found. Cannot grade."` |
| Acting user lacks role | `"Only instructors or administrators can grade submissions."` |
| `score` not integer 0–10 | `"Score must be an integer between 0 and 10."` |
| Quiz result not found | `"Quiz result not found."` |

**Authorization:** `INSTRUCTOR` or `ADMINISTRATOR` only.

**Score Recalculation:**
- Objective portion: `correctCount / totalObjective`.
- Subjective portion: each question's `score / 10` (normalized to [0,1]).
- `totalScore = round((totalPoints / totalPossible) * 100)` where each question is worth 1 point.
- Returns `null` if no answers yet.

**Side Effects:**
- Merges `subjectiveScores[questionId] = { score, notes, gradedBy, gradedAt }` into result.
- Recalculates and sets `result.totalScore`.
- Updates `result.gradedBy` and `result.gradedAt`.
- Persists via `quizResultRepository.put()`.
- Appends audit log `action="graded"`.

---

### 6.2 `isFullyGraded(resultId)`

**Purpose:** Check whether all subjective items in a result have been scored.

**Inputs:** `resultId: string`

**Output:** `boolean` — `false` if result not found.

**Errors:** None thrown.

**Side Effects:** None.

---

### 6.3 `getResultById(resultId)`

**Inputs:** `resultId: string`

**Output:** `QuizResult | null`

---

## 7. ModerationService

Sensitive-word filtering, abuse report lifecycle, and SLA deadline enforcement.

**Constructor dependencies:** `reportRepository`, `userRepository`, `auditService`
**Config:** `moderation.resolutionDeadlineDays` (default 7)

---

### Report States

```
open ──────► under_review ──► resolved (terminal)
  │                │
  └──► escalated ──┘──► resolved (terminal, system-forced after second deadline breach)
```

---

### 7.1 `checkContent(text)`

**Purpose:** Synchronous sensitive-word scan. Used internally by `ReviewService`, `QAService`, and `ModerationService`.

**Inputs:** `text: string | null`

**Output:**
```js
{ flagged: boolean, words: string[] }
```

**Errors:** None.

**Authorization:** None.

**Side Effects:** None.

---

### 7.2 `submitReport(reporterId, targetId, targetType, reason)`

**Purpose:** File an abuse report against any content entity.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `reporterId` | `string` | Required |
| `targetId` | `string` | Required |
| `targetType` | `string` | Required (e.g. `"review"`, `"answer"`, `"user"`) |
| `reason` | `string` | Optional |

**Output:**
```js
Report  // see Report Object Shape
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `reporterId` falsy | `"reporterId is required."` |
| `targetId` falsy | `"targetId is required."` |
| `targetType` falsy | `"targetType is required."` |

**Authorization:** None.

**Side Effects:**
- Auto-flags `riskFlag = true` if `reason` contains sensitive words.
- Persists `Report` with `status = "open"`.
- Appends audit log `action="created"` (with `[RISK-FLAGGED]` suffix if flagged).

---

### 7.3 `resolveReport(reportId, outcome, resolvedBy)`

**Purpose:** Manually resolve an open/escalated report.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `reportId` | `string` | Required |
| `outcome` | `string` | One of `"dismissed"`, `"removed"`, `"warned"` |
| `resolvedBy` | `string` | Required; must be `ADMINISTRATOR` or `STAFF_REVIEWER` |

**Output:**
```js
Report  // updated
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `reportId` falsy | `"reportId is required."` |
| `resolvedBy` falsy | `"resolvedBy is required."` |
| Acting user not found | `"Acting user not found. Cannot resolve report."` |
| Acting user lacks role | `"Only administrators or staff reviewers can resolve reports."` |
| Report not found | `"Report not found."` |
| Report already `resolved` | `"Report has already been resolved."` |
| `outcome` not in valid set | `"Outcome must be one of: dismissed, removed, warned"` |

**Authorization:** `ADMINISTRATOR` or `STAFF_REVIEWER` only.

**Side Effects:**
- Sets `report.status = "resolved"`, `report.resolution = outcome`, `report.resolvedBy`, `report.resolvedAt`.
- Persists via `reportRepository.put()`.
- Appends audit log `action="resolved"`.

---

### 7.4 `enforceDeadlines()`

**Purpose:** Enforce SLA in two stages. Called by the scheduler.

**Inputs:** None

**Output:**
```js
{ escalated: Report[], autoResolved: Report[] }
```

**Errors:** None thrown.

**Authorization:** System-only (called by `SchedulerService`).

**Logic:**
1. Collect all reports in `open`, `under_review`, or `escalated` state where `createdAt` is older than `resolutionDeadlineDays` (default 7).
2. For `open`/`under_review` overdue: transition to `escalated`, set `escalatedAt`.
3. For `escalated` overdue (past deadline twice): force-resolve with `outcome = "dismissed"`, `resolvedBy = "system"`.

**Side Effects:**
- Persists each mutated report.
- Appends audit log per report: `action="escalated"` or `action="auto_resolved"`.

---

### 7.5 Read Methods

| Method | Output |
|--------|--------|
| `getOpenReports()` | `Report[]` — status in `open`, `under_review`, `escalated` |
| `getOverdueReports()` | `Report[]` — open reports past deadline |
| `getAllReports()` | `Report[]` |
| `getReportById(reportId)` | `Report \| null` |

---

### Report Object Shape

```js
{
  id: string,
  reporterId: string,
  targetId: string,
  targetType: string,
  reason: string,
  status: "open" | "under_review" | "escalated" | "resolved",
  resolution: "dismissed" | "removed" | "warned" | null,
  resolvedBy: string | null,
  resolvedAt: string | null,
  riskFlag: boolean,
  escalatedAt: string | null,
  createdAt: string,
}
```

---

## 8. QAService

Q&A thread and answer management with mandatory content moderation.

**Constructor dependencies:** `questionThreadRepository`, `answerRepository`, `auditService`, `moderationService`

---

### 8.1 `createThread(authorId, title, content, classId?)`

**Purpose:** Create a new Q&A thread. Both title and content are screened for sensitive words.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `authorId` | `string` | Required |
| `title` | `string` | Required; non-empty after trim |
| `content` | `string` | Required; non-empty after trim |
| `classId` | `string \| null` | Optional class binding |

**Output:**
```js
QuestionThread
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `authorId` falsy | `"authorId is required."` |
| `title` empty | `"Thread title is required."` |
| `content` empty | `"Thread content is required."` |
| `title` contains sensitive words | `"Thread title contains prohibited content: {words}."` |
| `content` contains sensitive words | `"Thread content contains prohibited content: {words}."` |

**Authorization:** None.

**Side Effects:**
- Persists `QuestionThread`.
- Appends audit log `action="created"`.

---

### 8.2 `submitAnswer(threadId, authorId, content)`

**Purpose:** Post an answer to an existing thread. Content is screened for sensitive words.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `threadId` | `string` | Required; thread must exist |
| `authorId` | `string` | Required |
| `content` | `string` | Required; non-empty after trim |

**Output:**
```js
Answer
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `threadId` falsy | `"threadId is required."` |
| `authorId` falsy | `"authorId is required."` |
| `content` empty | `"Answer content is required."` |
| `content` contains sensitive words | `"Answer contains prohibited content: {words}."` |
| Thread not found | `"Thread not found."` |

**Authorization:** None.

**Side Effects:**
- Persists `Answer`.
- Appends audit log `action="created"`.

---

### 8.3 Read Methods

| Method | Output |
|--------|--------|
| `getAllThreads()` | `QuestionThread[]` |
| `getThreadById(threadId)` | `QuestionThread \| null` |
| `getThreadsByAuthor(authorId)` | `QuestionThread[]` |
| `getAnswersByThreadId(threadId)` | `Answer[]` |
| `getAnswerById(answerId)` | `Answer \| null` |

---

### QuestionThread Object Shape

```js
{
  id: string,
  authorId: string,
  title: string,
  content: string,
  classId: string | null,
  createdAt: string,
}
```

### Answer Object Shape

```js
{
  id: string,
  threadId: string,
  authorId: string,
  content: string,
  createdAt: string,
}
```

---

## 9. ContractService

Template management, placeholder substitution, versioning, signing workflow, and HTML export.

**Constructor dependencies:** `contractRepository`, `templateRepository`, `userRepository`, `documentRepository`, `auditService`, `cryptoService`

---

### Contract State Machine

```
initiated ──────────────────────► withdrawn (terminal)
    │                │
    ▼                ▼
  signed           voided (terminal)
    │
    ▼
  voided (terminal)
```

**Full transition table (from `defaults.json`):**

| From | Allowed To |
|------|-----------|
| `initiated` | `signed`, `withdrawn`, `voided` |
| `signed` | `voided` |
| `withdrawn` | *(terminal)* |
| `voided` | *(terminal)* |

---

### 9.1 `createTemplate(data)`

**Purpose:** Create a new template with automatic placeholder extraction.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `data.createdBy` | `string` | Required; must be `ADMINISTRATOR` |
| `data.name` | `string` | Required |
| `data.content` | `string` | Required; placeholders extracted via `/{[^}]+}/g` |
| `data.effectiveDate` | `string` | Optional; defaults to `now()` |

**Output:**
```js
Template  // see Template Object Shape
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `data.createdBy` falsy | `"userId is required for this operation."` |
| User not found | `"Acting user not found. Cannot perform this operation."` |
| User not `ADMINISTRATOR` | `"Only administrators can manage templates."` |

**Authorization:** `ADMINISTRATOR` only.

**Side Effects:**
- Persists `Template` with `active = true`, `version = 1`.
- Appends audit log `action="created"`.

---

### 9.2 `updateTemplate(templateId, updates, updatedBy)`

**Purpose:** Create a new version of a template. The old version is deactivated in place.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `templateId` | `string` | Required; must exist |
| `updates.name` | `string` | Optional; defaults to existing name |
| `updates.content` | `string` | Optional; defaults to existing content |
| `updates.effectiveDate` | `string` | Optional |
| `updatedBy` | `string` | Required; must be `ADMINISTRATOR` |

**Output:**
```js
Template  // new version
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| Role check fails | Same as `createTemplate` role errors |
| Template not found | `"Template not found."` |

**Authorization:** `ADMINISTRATOR` only.

**Side Effects:**
- Deactivates existing template (`active = false`, `updatedAt = now()`), persists via `templateRepository.put()`.
- Creates new `Template` with `version = existing.version + 1`, `active = true`.
- Appends audit log `action="versioned"`.

---

### 9.3 `generateContract(templateId, variables, createdBy)`

**Purpose:** Render a contract from a template with variable substitution.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `templateId` | `string` | Required; must exist |
| `variables` | `object` | Key-value map; each key replaces `{key}` in template content |
| `createdBy` | `string` | Required |

**Output:**
```js
Contract  // in status "initiated"
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| Template not found | `"Template not found."` |

**Authorization:** None.

**Substitution:** `content.replace(/\{key\}/g, value)` for each entry in `variables`.

**Side Effects:**
- Persists `Contract` with `status = "initiated"`.
- Appends audit log `action="created"`.

---

### 9.4 `signContract(contractId, signatureData, signerName, userId)`

**Purpose:** Apply a signature to an initiated contract. Validates signature content and blanket-canvas rejection.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `contractId` | `string` | Required; contract must exist in `initiated` status |
| `signatureData` | `string` | Required; non-empty; if `data:image/` prefix, base64 payload must be ≥ 500 chars |
| `signerName` | `string` | Required; non-empty after trim |
| `userId` | `string` | Required; must be owner or `ADMINISTRATOR` |

**Output:**
```js
Contract  // in status "signed"
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| Contract not found | `"Contract not found."` |
| Access check fails | See `_requireContractAccess` errors below |
| Contract not in `initiated` status | `"Contract can only be signed when in initiated status."` |
| `signatureData` empty/whitespace | `"Signature is required before signing."` |
| `signerName` empty/whitespace | `"Signer name is required."` |
| `signatureData` starts with `data:image/` and base64 payload < 500 chars | `"Drawn signature appears to be blank. Please draw your signature before submitting."` |

**Authorization:** Owner (`contract.createdBy === userId` or `contract.signedBy === userId`) or `ADMINISTRATOR`. Checked via `_requireContractAccess`.

**Access Control (`_requireContractAccess`) errors:**

| Condition | Message |
|-----------|---------|
| `userId` falsy | `"userId is required for contract operations."` |
| User not found | `"Acting user not found. Cannot perform contract operation."` |
| Non-admin, non-owner | `"You do not have access to this contract."` |

**Side Effects:**
- Sets `contract.signatureData`, `contract.signatureHash` (SHA-256 of content+signerName+timestamp), `contract.signedBy = userId`, `contract.signerName = signerName`, `contract.signedAt`, `contract.status = "signed"`, `contract.updatedAt`.
- Persists via `contractRepository.put()`.
- Appends audit log `action="signed"` (includes first 16 chars of hash).

---

### 9.5 `transitionStatus(contractId, newStatus, userId)`

**Purpose:** Transition a contract's signing status (withdraw, void, etc.).

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `contractId` | `string` | Required; must exist |
| `newStatus` | `string` | Must be allowed by contract state machine |
| `userId` | `string` | Required; owner or `ADMINISTRATOR` |

**Output:**
```js
Contract  // updated
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| Contract not found | `"Contract not found."` |
| Access check fails | See access errors above |
| Transition not allowed | `"Cannot transition contract from {from} to {newStatus}."` |

**Authorization:** Owner or `ADMINISTRATOR`.

**Side Effects:**
- Updates `contract.status`, `contract.updatedAt`.
- Persists via `contractRepository.put()`.
- Appends audit log `action="status_change"`.

---

### 9.6 `withdrawContract(contractId, userId)` / `voidContract(contractId, userId)`

**Purpose:** Convenience wrappers over `transitionStatus`.

`withdrawContract` → `transitionStatus(contractId, "withdrawn", userId)`
`voidContract` → `transitionStatus(contractId, "voided", userId)`

Same inputs, outputs, and errors as `transitionStatus`.

---

### 9.7 `exportToPrintableHTML(contract)`

**Purpose:** Synchronously render the contract to an XSS-safe HTML `Blob` suitable for browser download.

**Inputs:** `contract: Contract`

**Output:** `Blob` (`type: "text/html"`)

**Errors:** None thrown.

**Authorization:** None.

**XSS Safety:** All user-controlled fields (`content`, `id`, `signerName || signedBy`, `signedAt`, `signatureHash`) are passed through `escapeHtml()` before insertion into the HTML string.

**Display Name:** Uses `contract.signerName` (human-readable) with fallback to `contract.signedBy` (userId) if not present.

**Side Effects:** None.

---

### 9.8 `downloadContract(contract)`

**Purpose:** Record a download event and trigger browser download.

**Inputs:** `contract: Contract`

**Output:** `undefined`

**Errors:** None thrown. All internal errors are non-fatal.

**Side Effects:**
- Records `{ id, contractId, type:"html-export", filename, exportedAt }` via `documentRepository.add()` (non-fatal on failure).
- Calls `downloadBlob(blob, filename)` (non-fatal in non-browser environments).

---

### 9.9 `getAllContractsScoped(actingUserId)`

**Purpose:** Return contracts visible to the acting user based on role.

**Inputs:** `actingUserId: string`

**Output:** `Contract[]` — `[]` if `actingUserId` is falsy or user not found.

**Authorization:**
- `ADMINISTRATOR`: all contracts.
- Others: only contracts where `contract.createdBy === actingUserId || contract.signedBy === actingUserId`.

---

### 9.10 Read Methods

| Method | Output |
|--------|--------|
| `getContractById(contractId)` | `Contract \| null` |
| `getAllContracts()` | `Contract[]` |
| `getContractsByStatus(status)` | `Contract[]` |
| `getActiveTemplates()` | `Template[]` — only `active = true`; returns `[]` on error |
| `getTemplateById(templateId)` | `Template \| null` |
| `getAllTemplates()` | `Template[]` |

---

### Template Object Shape

```js
{
  id: string,
  name: string,
  content: string,
  placeholders: string[],              // ["{LearnerName}", "{ClassStartDate}", ...]
  active: boolean,
  version: integer,
  effectiveDate: string,
  createdAt: string,
  updatedAt: string,
}
```

### Contract Object Shape

```js
{
  id: string,
  templateId: string,
  templateVersion: integer,
  content: string,                     // rendered (substituted) template
  status: "initiated" | "signed" | "withdrawn" | "voided",
  signatureData: string | null,        // base64 data URL or typed name
  signatureHash: string | null,        // SHA-256(content + signerName + timestamp)
  signedBy: string | null,             // userId — for access control
  signedAt: string | null,
  signerName: string | null,           // human-readable name — for display/export
  createdBy: string,
  createdAt: string,
  updatedAt: string,
}
```

---

## 10. ReputationService

90-day rolling reputation score computation with configurable weighted formula and restriction gate.

**Constructor dependencies:** `reputationScoreRepository`, `registrationRepository`, `auditService`

**Config (from `defaults.json`):**

| Key | Default |
|-----|---------|
| `reputation.threshold` | 60 |
| `reputation.windowDays` | 90 |
| `reputation.weights.fulfillmentRate` | 0.5 |
| `reputation.weights.lateRate` | 0.3 |
| `reputation.weights.complaintRate` | 0.2 |

---

### 10.1 `computeScoreFromHistory(userId)`

**Purpose:** Derive reputation from actual registration history within the rolling window.

**Inputs:** `userId: string`

**Output:** `ReputationScore | null` — `null` if no registrations exist in the window.

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `userId` falsy | `"userId is required."` |

**Formula:**
```
fulfillmentRate = approved / total
lateRate        = cancelled / total  (cancelled-after-approval = "failed to attend")
complaintRate   = rejected / total

score = round(
  fulfillmentRate × weights.fulfillmentRate +
  (1 - lateRate)  × weights.lateRate +
  (1 - complaintRate) × weights.complaintRate
) × 100
score = clamp(score, 0, 100)
```

**Side Effects:** Delegates to `computeScore()` which persists the record and logs.

---

### 10.2 `computeScore(userId, metrics, weights?)`

**Purpose:** Compute and persist a reputation score from supplied rate metrics.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `userId` | `string` | Required |
| `metrics.fulfillmentRate` | `number` | Required; 0–1 |
| `metrics.lateRate` | `number` | Required; 0–1 |
| `metrics.complaintRate` | `number` | Required; 0–1 |
| `weights` | `object` | Optional; defaults from config |

**Output:**
```js
ReputationScore
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `userId` falsy | `"userId is required."` |
| `metrics` falsy | `"metrics object is required."` |
| Any metric not in `[0, 1]` | `"{field} must be between 0 and 1."` |

**Persistence:** Upserts — if a score record already exists for `userId`, updates it (same `id`). Otherwise creates new.

**Side Effects:**
- Persists `ReputationScore` via `reputationScoreRepository.put()`.
- Appends audit log `action="computed"`.

---

### 10.3 `isRestricted(userId)`

**Purpose:** Determine whether a user is below the reputation threshold.

**Inputs:** `userId: string`

**Output:** `boolean` — `false` if no score record exists (no history = not restricted).

**Errors:** None thrown.

**Side Effects:** None.

---

### 10.4 `getScore(userId)` / `getAllScores()`

| Method | Output |
|--------|--------|
| `getScore(userId)` | `ReputationScore \| null` |
| `getAllScores()` | `ReputationScore[]` |

---

### ReputationScore Object Shape

```js
{
  id: string,
  userId: string,
  score: number,                       // 0–100
  fulfillmentRate: number,             // 0–1
  lateRate: number,                    // 0–1
  complaintRate: number,               // 0–1
  computedAt: string,
}
```

---

## 11. DashboardService

KPI computation scoped by role. Learners see only own metrics. Admins/reviewers see global metrics.

**Constructor dependencies:** `registrationRepository`, `quizResultRepository`, `reportRepository`, `classRepository`, `userRepository`, `analyticsSnapshotRepository`

---

### 11.1 `getKPIs(actingUserId?)`

**Purpose:** Compute and return a KPI bundle, scoped by the acting user's role.

**Inputs:** `actingUserId: string | undefined`

**Output:**
```js
{
  // Registration KPIs (always present; scoped for learners)
  totalRegistrations: number,
  approvedRegistrations: number,
  rejectedRegistrations: number,
  pendingRegistrations: number,        // Submitted + UnderReview + NeedsMoreInfo
  approvalRate: number,                // 0–100 (percentage)
  rejectionRate: number,               // 0–100 (percentage)

  // Quiz KPIs (always present; scoped for learners)
  totalQuizResults: number,
  averageQuizScore: number,            // 0–100

  // Moderation KPIs (null for learners and instructors)
  openReports: number | null,
  resolvedReports: number | null,
  avgResolutionDays: number | null,

  // Class KPIs (null for learners and instructors)
  totalClasses: number | null,
  averageFillRate: number | null,      // 0–100 (percentage)
}
```

**Errors:** None thrown.

**Authorization:**
- `ADMINISTRATOR` or `STAFF_REVIEWER`: all KPIs computed globally.
- All other roles: moderation and class KPIs return `null`; registration and quiz KPIs scoped to `actingUserId`.

**Side Effects:**
- Attempts to write a daily analytics snapshot via `analyticsSnapshotRepository.add()`. Failure is non-fatal (duplicate day acceptable).

---

## 12. ImportExportService

Full-dataset export and import, administrator-only, with optional AES-GCM encryption.

**Constructor dependencies:** `userRepository`
**External dependencies:** `cryptoService` (module-level singleton), `Database` (via `getDatabase()`), `STORES` (all 25 store definitions)

---

### 12.1 `exportAll(actingUserId, passphrase?)`

**Purpose:** Export the entire IndexedDB dataset as a JSON file download.

**Export modes:**
- **Encrypted** (passphrase provided): AES-GCM encrypted payload; credential hashes preserved; full restore possible.
- **Plaintext** (no passphrase): credential hashes stripped; `_requiresPasswordReset: true` set on all users; users must reset passwords after import.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `actingUserId` | `string` | Required; must be `ADMINISTRATOR` |
| `passphrase` | `string \| null` | Optional; if provided and non-empty, enables encrypted mode |

**Output:**
```js
{ success: true, filename: string, encrypted: boolean }
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| `actingUserId` falsy | `"userId is required for import/export operations."` |
| Acting user not found | `"Acting user not found. Cannot perform import/export."` |
| Acting user not `ADMINISTRATOR` | `"Only administrators can perform import/export operations."` |
| Database not initialized | `"Database not initialized."` |

**Authorization:** `ADMINISTRATOR` only.

**Data Sanitization:**
- `sessions` store: always exported as `[]` (sessions are ephemeral).
- `users[*].lockoutUntil`: cleared to `null` (security-transient).
- Plaintext mode only: `passwordHash` removed from all user records, `_requiresPasswordReset: true` added.
- `localStorage`: only the key `trainingops_config_overrides` is included.

**Filename format:** `trainingops-backup-YYYY-MM-DD.json`

**Side Effects:**
- Triggers browser download via `downloadBlob()`.

---

### 12.2 `parseImportFile(actingUserId, file, passphrase?)`

**Purpose:** Parse and validate an import file. Returns preview counts and parsed data, but does not apply it.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `actingUserId` | `string` | Required; must be `ADMINISTRATOR` |
| `file` | `File` | Browser `File` object with `.text()` method |
| `passphrase` | `string \| null` | Required if the backup is encrypted |

**Output (success):**
```js
{
  success: true,
  preview: { [storeName]: number },    // record counts per store
  data: object,                        // parsed data (pass to applyImport)
}
```

**Output (failure):**
```js
{ success: false, error: string }
```

**Errors (returned, not thrown):**

| Condition | `error` |
|-----------|---------|
| File is not valid JSON | `"Invalid JSON file."` |
| File is encrypted but no passphrase provided | `"Backup is encrypted. The passphrase used during export is required."` |
| Decryption fails (wrong passphrase) | `"Decryption failed. Wrong passphrase."` |
| ID format validation fails | `"Import validation failed: {details}"` |

**Throws (role errors):** Same as `exportAll`.

**Authorization:** `ADMINISTRATOR` only.

**ID Validation:** All record IDs must match `/^[a-zA-Z0-9_\-.:]+$/`. Malformed IDs cause `parseImportFile` to fail.

**Side Effects:** None — read-only parse phase.

---

### 12.3 `applyImport(actingUserId, data)`

**Purpose:** Overwrite all IndexedDB stores with the imported data. Destructive and irreversible.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `actingUserId` | `string` | Required; must be `ADMINISTRATOR` |
| `data` | `object` | Must be the `data` object returned from `parseImportFile` |

**Output:**
```js
{ success: true }
```

**Errors (throws):**

| Condition | Message |
|-----------|---------|
| Role errors | Same as `exportAll` |
| `data` is not an object | `"Invalid import data format."` |
| Database not initialized | `"Database not initialized."` |

**Authorization:** `ADMINISTRATOR` only.

**Behavior:**
- For each known store in `STORES`: clears the store, then writes all records from `data[storeName]` in a single transaction.
- Unknown store keys in `data` are silently ignored.
- `data._localStorage`: only keys in the allowlist (`trainingops_config_overrides`) are written. All other keys are silently ignored.

**Side Effects:**
- Clears and repopulates all 25 IndexedDB stores.
- Restores allowlisted localStorage keys.

---

## 13. AuditService

Append-only audit log. All service methods write to this log; entries are never deleted.

**Constructor dependencies:** `auditLogRepository`

---

### 13.1 `log(entityType, entityId, action, details, userId)`

**Purpose:** Append an immutable audit entry.

**Inputs:**

| Field | Type | Rules |
|-------|------|-------|
| `entityType` | `string` | E.g. `"user"`, `"registration"`, `"contract"`, `"report"`, etc. |
| `entityId` | `string` | The primary entity's ID |
| `action` | `string` | E.g. `"created"`, `"status_change"`, `"signed"`, `"login"`, etc. |
| `details` | `string` | Human-readable description |
| `userId` | `string` | Actor; `"system"` for automated actions |

**Output:**
```js
AuditLog  // see AuditLog Object Shape
```

**Errors:** None thrown (failures propagate from repository).

**Authorization:** None (internal service).

**Side Effects:** Persists `AuditLog` via `auditLogRepository.add()`.

---

### 13.2 Read Methods

| Method | Output |
|--------|--------|
| `getTimeline(entityId)` | `AuditLog[]` — all entries for a given entity |
| `getByEntityType(entityType)` | `AuditLog[]` |
| `getAll()` | `AuditLog[]` |

---

### AuditLog Object Shape

```js
{
  id: string,
  entityType: string,
  entityId: string,
  action: string,
  details: string,
  userId: string,
  timestamp: string,
}
```

---

## Appendix A: Role Permission Matrix

| Operation | Administrator | Staff Reviewer | Instructor | Learner |
|-----------|:---:|:---:|:---:|:---:|
| Bootstrap admin creation | ✓ (pre-auth) | — | — | — |
| Register users | ✓ | — | — | — |
| Reset passwords | ✓¹ | — | — | — |
| Create/update templates | ✓ | — | — | — |
| Generate contracts | ✓ | ✓ | ✓ | ✓ |
| Sign/withdraw own contract | ✓ | ✓ | ✓ | ✓ |
| Void any contract | ✓ | — | — | — |
| Create questions | ✓ | — | ✓ | — |
| Bulk import questions | ✓ | — | ✓ | — |
| Generate quiz paper | ✓ | — | ✓ | — |
| Grade subjective answers | ✓ | — | ✓ | — |
| Submit registration | ✓ | ✓ | ✓ | ✓ |
| Approve/reject registrations | ✓ | ✓ | — | — |
| Submit reviews | ✓ | ✓ | ✓ | ✓ |
| Submit ratings | ✓ | ✓ | ✓ | ✓ |
| Resolve appeals | ✓ | ✓ | — | — |
| Submit/resolve reports | ✓ | ✓ | — | — |
| Export/import data | ✓ | — | — | — |
| View global KPIs | ✓ | ✓ | — | — |
| View own KPIs | ✓ | ✓ | ✓ | ✓ |

¹ No role check enforced at service layer; callers are responsible.

---

## Appendix B: Sensitive-Word Screening

`ModerationService.checkContent(text)` is called synchronously in the following paths:
- `ReviewService.submitReview()` — screens `text`
- `ReviewService.submitFollowUp()` — screens `text`
- `QAService.createThread()` — screens `title` and `content`
- `QAService.submitAnswer()` — screens `content`
- `ModerationService.submitReport()` — screens `reason` (does not throw; sets `riskFlag`)

The word list is loaded from `src/config/sensitiveWords.json` at startup. Matching is substring-based and case-insensitive.

---

## Appendix C: Configuration Override Points

All values below are read from `getConfig()` at each service call (not at startup). Administrators may change them at runtime via `updateConfig()`, which persists overrides to localStorage.

| Config path | Default | Consumed by |
|-------------|---------|-------------|
| `reputation.threshold` | `60` | `ReputationService.isRestricted()` |
| `reputation.windowDays` | `90` | `ReputationService.computeScoreFromHistory()` |
| `reputation.weights` | `{fulfillmentRate:0.5, lateRate:0.3, complaintRate:0.2}` | `ReputationService.computeScore()` |
| `registration.waitlistPromotionFillRate` | `0.95` | `RegistrationService._checkWaitlistPromotion()` |
| `registration.rejectionCommentMinLength` | `20` | `RegistrationService.transition()` |
| `registration.transitions` | see §2 table | `Registration.canTransition()` |
| `registration.terminalStates` | `["Rejected","Cancelled"]` | `Registration.getTerminalStates()` |
| `review.maxTextLength` | `2000` | `ReviewService.submitReview/submitFollowUp()` |
| `review.maxImages` | `6` | `ReviewService.submitReview/submitFollowUp()` |
| `review.maxImageSizeMB` | `2` | `ReviewService.submitReview/submitFollowUp()` |
| `review.followUpWindowDays` | `14` | `ReviewService.submitFollowUp()` |
| `moderation.resolutionDeadlineDays` | `7` | `ModerationService.getOverdueReports()` |
| `contract.transitions` | see §9 table | `ContractService.transitionStatus()` |

---

## Appendix D: Crypto Contracts (CryptoService)

Used internally; not a public service. Contracts listed for completeness.

| Method | Input | Output |
|--------|-------|--------|
| `hashPassword(password)` | `string` | `{ hash: string, salt: string }` (PBKDF2, 256-bit key) |
| `verifyPassword(password, hash, salt)` | strings | `boolean` |
| `generateSignatureHash(content, signerName, timestamp)` | strings | `string` (SHA-256 hex) |
| `encrypt(plaintext, passphrase)` | strings | `{ iv, salt, ciphertext }` (AES-GCM, 256-bit key) |
| `decrypt(encryptedObj, passphrase)` | object, string | `string` (plaintext) |

---

*End of Service Contract Specification*
