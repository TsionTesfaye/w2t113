# Business Logic Questions Log — TrainingOps Enrollment & Quality Console

---

## 1. Registration State Reversal

Question:  
The prompt defines registration states but does not specify whether a rejected or approved registration can return to a previous state.

Assumption:  
Once a registration reaches Approved or Rejected, it is terminal and cannot transition back.

Solution:  
Implemented terminal states for Approved and Rejected with no backward transitions allowed.

---

## 2. Waitlist Promotion Logic

Question:  
The prompt states waitlist promotion occurs when fill rate drops below 95%, but does not specify which user is promoted.

Assumption:  
Waitlisted users are promoted in FIFO order.

Solution:  
Maintained a queue for waitlisted users and promoted the earliest entry when conditions are met.

---

## 3. Cancellation Rules

Question:  
The prompt includes a Cancelled state but does not define from which states cancellation is allowed.

Assumption:  
Cancellation is allowed from all non-terminal states: Draft, Submitted, Needs More Info, Under Review, and Waitlisted.

Solution:  
Enabled cancellation from all non-terminal states and logged cancellation reason.

---

## 4. Reviewer Comment Validation

Question:  
The prompt requires a minimum 20-character comment on rejection but does not specify enforcement timing.

Assumption:  
Validation must occur before state transition to Rejected.

Solution:  
Blocked rejection submission unless comment length ≥ 20 characters.

---

## 5. Audit Timeline Immutability

Question:  
The prompt describes an immutable audit timeline but does not define enforcement.

Assumption:  
Audit entries cannot be edited or deleted after creation.

Solution:  
Implemented append-only audit logs with timestamped entries.

---

## 6. Quiz Question Validation

Question:  
The prompt defines multiple question types but does not specify validation rules for each type.

Assumption:  
Each type has required fields:
- Single/Multiple: must have correct options
- Fill-in: must have correct answer
- Subjective: requires manual grading

Solution:  
Implemented type-specific validation logic before saving questions.

---

## 7. Bulk Import Error Handling

Question:  
The prompt supports bulk import but does not define behavior when some rows fail validation.

Assumption:  
If any row fails, the entire import is rejected.

Solution:  
Validated all rows before insertion and aborted import if any errors occur.

---

## 8. Paper Generation Distribution

Question:  
The prompt defines percentage-based difficulty distribution but does not specify rounding behavior.

Assumption:  
Rounding is handled by prioritizing higher difficulty levels first.

Solution:  
Calculated counts using floor values and distributed remaining slots to higher difficulty categories.

---

## 9. Subjective Grading Limits

Question:  
The prompt defines subjective grading (0–10) but does not specify decimal allowance.

Assumption:  
Only integer scores are allowed.

Solution:  
Restricted input to integer values between 0 and 10.

---

## 10. Wrong-Question Notebook Behavior

Question:  
The prompt mentions a wrong-question notebook but does not define when questions are added.

Assumption:  
Questions are added when answered incorrectly.

Solution:  
Automatically stored incorrect answers with reference to explanations.

---

## 11. Review Submission Limits

Question:  
The prompt allows one follow-up review within 14 days but does not define enforcement.

Assumption:  
Users can only submit one follow-up review per original review.

Solution:  
Tracked follow-up submissions and blocked additional entries after one submission.

---

## 12. Image Upload Constraints

Question:  
The prompt defines image limits but does not specify behavior when limits are exceeded.

Assumption:  
Uploads exceeding limits are rejected.

Solution:  
Validated:
- Max 6 images
- Max 2MB each
Rejected invalid uploads with error message.

---

## 13. Moderation Workflow

Question:  
The prompt defines moderation outcomes but does not specify default handling.

Assumption:  
All flagged content must be reviewed before final decision.

Solution:  
Implemented moderation queue with required outcome selection before resolution.

---

## 14. Abuse Report Deadline

Question:  
The prompt requires resolution within 7 days but does not define enforcement.

Assumption:  
Overdue reports are flagged but not auto-resolved.

Solution:  
Displayed overdue status in UI and prioritized in moderation queue.

---

## 15. Reputation Score Calculation

Question:  
The prompt defines reputation score inputs but not exact formula.

Assumption:  
Score is calculated as weighted average of:
- fulfillment rate
- late rate
- complaint rate

Solution:  
Implemented configurable weighted formula using local configuration.

---

## 16. Reputation Threshold Enforcement

Question:  
The prompt states users below 60 are blocked but does not define scope of restriction.

Assumption:  
Users cannot create new registrations but can still view existing data.

Solution:  
Blocked creation actions and displayed restriction message.

---

## 17. Appeal Workflow

Question:  
The prompt includes appeals but does not define decision outcomes.

Assumption:  
Reviewer can uphold, adjust, or void a rating.

Solution:  
Implemented appeal resolution with required rationale logging.

---

## 18. Contract Versioning

Question:  
The prompt mentions versioning but does not define active version rules.

Assumption:  
Only one active version per contract template.

Solution:  
Marked versions with active flag and enforced single active version.

---

## 19. Signature Validation

Question:  
The prompt defines signature hashing but does not specify verification.

Assumption:  
Signature hash ensures integrity but is not revalidated dynamically.

Solution:  
Generated SHA-256 hash at signing time and stored with document.

---

## 20. Export/Import Conflict Handling

Question:  
The prompt supports import/export but does not define conflict resolution.

Assumption:  
Imported data overwrites existing data after confirmation.

Solution:  
Added preview step and user confirmation before applying import.

---

## 21. Sensitive Data Masking

Question:  
The prompt mentions masking but does not define default visibility.

Assumption:  
Sensitive fields are masked by default.

Solution:  
Displayed partial values with option to reveal if permitted.

---

## 22. Session Persistence

Question:  
The prompt uses LocalStorage but does not define session behavior.

Assumption:  
Session persists until browser is closed or user logs out.

Solution:  
Stored session state in LocalStorage with manual logout option.

---

## 23. Role Assignment Rules

Question:  
The prompt defines roles but does not specify multi-role support.

Assumption:  
Each user has a single role.

Solution:  
Enforced one role per user for simplified RBAC.

---

## 24. Data Storage Separation

Question:  
The prompt uses both LocalStorage and IndexedDB but does not define boundaries.

Assumption:  
Large data stored in IndexedDB, small preferences in LocalStorage.

Solution:  
Separated storage:
- IndexedDB → main data
- LocalStorage → UI settings