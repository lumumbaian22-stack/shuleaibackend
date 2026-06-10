# Shule AI v148.3 — Subscription Enforcement & Safe Class Generation

Build ID: `v148.3-subscription-class-safety`

This release extends the v148.2 regression-repair build. It does not replace or redesign the repaired Finance Workspace, branding, teacher profile, class-teacher assignment, attendance, media, or payment-record implementations.

## 1. Enforced school subscription cadence

School plan and payment cadence remain separate:

- Plans: Starter, Growth, Enterprise
- Billing cadence: Monthly, Termly, Yearly

Only `monthly`, `termly`, and `yearly` are accepted for school subscriptions. Invalid values return HTTP 400.

### Monthly

- The first selected payment is due immediately with a seven-day grace period.
- A confirmed payment activates one calendar-month period.
- Reminders are created before the next due date, on the due date, daily during grace, and daily after grace until payment is confirmed.

### Termly

- Requires saved school academic-calendar opening and closing dates.
- Confirmed payment activates the applicable real school term.
- Reminders cover term ending, the approaching next term, the next term opening, grace, and overdue states.

### Yearly

- Requires saved academic-year dates derived from the school calendar.
- Confirmed payment activates the real academic year rather than adding a blind 365-day interval.
- Reminders cover academic-year ending, the next academic year approaching/starting, grace, and overdue states.

### Enforcement and data safety

- Due-soon and grace states keep access active while showing persistent reminders.
- After grace, normal operational endpoints return HTTP 402.
- Dashboard, Subscription & Billing, payment initiation, alerts, settings, profile, and help remain accessible.
- Suspension/restriction never deletes school data.
- Payment confirmation restores the subscribed period.
- Pilot, trial, and Super Admin overrides remain separate.
- Alert deduplication uses subscription, billing period, reminder stage, and admin user identity.
- The subscription scheduler runs at startup and hourly.
- The Admin dashboard refreshes subscription status on every login/render and shows a payment banner without requiring the Billing page to be opened.

## 2. Safe school-scoped class generation

During admin signup, the system persists:

- Curriculum
- School structure
- Exact grades/classes selected
- Default streams
- Per-grade stream overrides
- Custom class names

Later School Settings changes update the same persisted source of truth.

### Generation contract

Saving School Settings does not create, reactivate, deactivate, rename, delete, or overwrite Class rows.

The flow is now:

1. Save the latest school setup.
2. Request a server-generated preview.
3. Review classes to create and classes that will be skipped.
4. Explicitly confirm using the preview token.
5. Create only classes still missing at confirmation time.

Safety controls:

- Strict school scoping
- Case-insensitive duplicate detection
- Existing archived classes are preserved and skipped, not reactivated
- Existing class teachers and subject-teacher assignments are untouched
- Existing students and history are untouched
- Manually created classes are preserved
- Custom-only schools do not fall back to a universal mixed-school class list
- CBC Secondary Only correctly resolves to Grade 7–12
- Concurrent generation is serialized using a school-row transaction lock
- A stale preview receives HTTP 409 and must be reviewed again
- Generation is recorded in the platform audit log

## 3. Preserved v148.2 regression repairs

This release keeps the prior repairs, including:

- One Finance Workspace for Finance Staff and Finance Overview for School Admin
- No undefined `rerenderBody()` calls
- Existing-email Finance Team assignment without duplicate users
- Canonical school branding/media behavior
- Teacher profile editing separated from class/subject assignment
- Teacher deactivation preserving history and assignments
- Canonical controller ownership without duplicate overridden exports
- Safe finance query parameters and payment-record handling
- Attendance session/class ID separation
- Service-worker removal of older runtime caches

## 4. Additional regression caught during testing

The signup consent helper was recursively calling itself instead of the consent API. It now calls `api.consent.accept(true, true)` and no longer risks a signup stack overflow.

## 5. Database migration

Additive migration:

`20260610000000-v1483-subscription-class-generation-enforcement.js`

It adds subscription enforcement fields and indexes. Existing subscriptions default to `enforcementEnabled = false`, so deployment does not unexpectedly lock existing schools. Enforcement begins when a school explicitly selects a cadence.

The migration has a deliberately non-destructive down operation so billing and audit history are not dropped.

## 6. Verification performed

- All backend and frontend JavaScript files passed `node --check`.
- Backend application imported and registered 74 Express stack entries.
- Required class-generation and subscription routes are registered.
- No duplicated controller export assignments were found.
- All local frontend assets referenced by `index.html` exist.
- All local backend relative imports resolve.
- Pure logic tests passed for:
  - Monthly grace and overdue restriction
  - Strict billing-cycle validation
  - CBC Secondary Only Grade 7–12
  - Custom-only class generation
  - Default and per-level streams
  - Access restoration/restriction state selection
- ZIP integrity testing passed after packaging.

A real Render PostgreSQL transaction, real scheduled alert delivery, and live Daraja callback could not be executed in the isolated build environment because the production database and credentials are not attached. The application import test reached only the expected local PostgreSQL connection refusal when a test attempted database access.

## 7. Deployment order

Deploy the backend first as a complete replacement:

- Build Command: `npm ci --omit=dev`
- Pre-Deploy Command: `npm run migrate`
- Start Command: `npm start`

Then deploy the matching frontend as a complete replacement.

Do not merge older v148/v148.1/v148.2 runtime files into this release.

After deployment verify:

- `/api/health` reports `v148.3-subscription-class-safety`
- Browser assets load with `?v=1483`
- One hard refresh activates the new service worker
