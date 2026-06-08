# Shule AI v146 — Grounded Repair Report

## Release identity
- Frontend build: `v146-grounded-consolidation`
- Backend package: `2.1.47`
- Database migration: `20260608020000-v146-grounded-consolidation.js`

This release is based on the separated v145 frontend and backend source. It is a consolidation/repair build, not another feature-only patch.

## Consolidation completed

The following competing frontend files were removed from the deployment package and from `index.html`:
- `js/websocket.js`
- `js/messaging.js`
- `js/chat.js`
- `js/duty.js`
- `js/duty-points.js`

Realtime is owned by `realtime-client.js`; messaging is owned by `chat-v9-ui.js` plus the parent/admin scoped messaging integration; Duty is owned by `duty-ui.js`.

## Parent dashboard
- Removed the duplicate Child Subscription sidebar entry.
- Child subscription remains inside the working Payments section and follows the selected child.
- Parent ↔ Class Teacher and Parent ↔ School Admin messaging uses selected-child conversation keys.
- Parent messages use optimistic sending, `clientMessageId` reconciliation, realtime room joins, read states and reconnect-safe canonical events.
- The backend socket room service now authorizes `parent_class_teacher` and `parent_admin` conversation keys.
- The socket server now supports delivery/read acknowledgements for both `ChatMessage` and legacy `Message` records.

## Teacher/admin messaging and Study Rooms
- Study Rooms join their actual conversation room when opened.
- Class-teacher parent conversations use the same canonical realtime path.
- Admin-parent modal conversations join the conversation room and refresh on incoming canonical events.
- Message deletion emits `chat:message_deleted` rather than only legacy hyphenated events.

## Alerts
- All dashboard roles receive a Recent Alerts preview from the same Alerts API.
- Parent alert previews use the selected child context.
- Entity-backed alerts use stable semantic deduplication keys rather than a retry-time bucket.
- Existing alert read status is not reset by duplicate producers.
- Calendar and release events refresh relevant alert/dashboard views through canonical realtime events.

## Calendar and events
- Calendar frontend no longer treats localStorage as permanent event storage.
- Admin Calendar fetches PostgreSQL events before initial rendering.
- Admin dashboard shows Upcoming and Recent events separately.
- Existing events display immediately after login or refresh.
- Calendar realtime events refresh both the dashboard preview and Calendar section.

## Student School Cycle
- Renamed Student Lifecycle to Student School Cycle.
- Removed separate sidebar links for Academic Year Transition, Attendance Corrections, Report History, and Birthdays & Ages.
- Added one tabbed Student School Cycle workspace containing:
  - Student Overview
  - Academic Year Transition
  - Attendance Corrections
  - Report History
  - Birthdays & Ages
  - Transfers & Withdrawals
  - Enrolment History
- Report History is class → student → published versions, rather than one flat school list.

## Students and subjects
- Student Management remains class-first.
- Added a visible Upload CSV action to Add Students.
- The mixed-class CSV workflow uploads one file, matches real school classes, preserves successful rows and offers a clean failed-row CSV.
- Elimu ID generation remains backend-owned.
- Add Subjects now visibly separates curriculum subjects from the Add Custom Subject workflow.
- Grade 10–12 Subject Requests are hidden unless the school and the current admin/teacher/parent/student context are senior-eligible.

## Duty
- Schools create their own duty points instead of being forced to use hard-coded locations.
- Schools create their own duty schedules with point, reporting/start/end time and teachers-per-slot.
- Roster generation uses the saved school-specific points and times.
- Daily QR tokens are HMAC-signed by the backend.
- QR is returned as a real scannable image for display on a separate authorized device.
- Teachers can scan with the phone camera through `BarcodeDetector`, with a manual-token fallback for unsupported browsers.
- Arrival/checkout uses the configured schedule and preserves verification/audit metadata.

## Timetable
- Draft → edit → save → publish remains the required flow.
- The published timetable remains separate from editable drafts.
- Manual save and publication now validate:
  - teacher double-booking;
  - class double-booking;
  - room double-booking;
  - invalid period start/end times;
  - empty publication.
- Teacher/student/parent reads remain published-only.

## Report cards and release
- Existing report-card builder already contains top school logo, child photo, centre watermark, signatures/fallback lines and draft-preview protection.
- Student release remains available only after attendance is submitted and locked.
- Release alerts use the shared Alerts/realtime path.
- Report History in Student School Cycle now enforces class-first and student-first selection.

## Analytics
- Advanced academic analytics remain the source of calculations and exports.
- Existing line, bar, pie/doughnut, distribution, leaderboard and trend visualizations remain enabled.
- Admin, class teacher, subject teacher, parent and student scopes continue to be enforced by the backend.

## School subscriptions
- Public pricing now states:
  - Starter: 1–400 active students
  - Growth: 401–800 active students
  - Enterprise: 801+ active students
- All three tiers show the complete core school platform.
- The v146 migration forces school SubscriptionPlans to use the shared full-core feature list and clears school-plan locked features.
- Parent subscriptions remain separate.

## SMS allocation
- Super Admin SMS allocation now records:
  - school;
  - quantity change;
  - previous/new balance;
  - reason/reference;
  - allocating user;
  - timestamp;
  - optional expiry.
- Added `SmsAllocations` migration table and allocation-history display.

## Finance
- Renamed the admin navigation item to Finance Workspace.
- Finance opens on a compact Overview rather than the full operational screen.
- Detailed tabs are now Overview, Fee Structures, Payments, Defaulters, Verification, and Settings.
- Class summaries lead directly to class-filtered records.

## Profile images and signatures
- Fixed the repeated profile upload failure caused by writing a long data URL into a varchar profileImage column.
- Profile image storage now saves a normal URL in `profileImage` and keeps the durable data URL in user preferences.
- Migration changes `Users.profileImage` to TEXT for compatibility.
- Frontend upload token fallback now supports both `authToken` and `token`.
- Added file type and size validation.
- Signature upload keeps the existing database-backed data URL behavior.

## AI Tutor
- Added persistent Tutor Session list endpoints.
- Added New Chat and Chat History UI.
- Continuing a conversation reuses its `sessionId` instead of creating a disconnected session for every question.
- Previous messages can be reopened after refresh.

## Verification performed
- All frontend and backend JavaScript passed `node --check`.
- All local files referenced by `index.html` exist.
- Production dependencies installed successfully with `npm ci --omit=dev`.
- Backend Express app and routes loaded with package version `2.1.47`.
- NPM audit: 0 high and 0 critical findings; 3 moderate transitive findings.
- Frontend service worker cache advanced to `shule-ai-v146-grounded-consolidation`.
- Frontend contains visible build metadata; `/health` and `/api/health` return backend version/build metadata.

## Environment tests still required after deployment
This sandbox does not have the live Render PostgreSQL database, production Redis, Daraja credentials, SMS/email providers or separate logged-in physical devices. Therefore these must be confirmed after deployment:
- migration execution against the live database;
- two-device realtime parent/teacher/admin/study-room tests;
- camera permission and QR scan on the actual teacher phone;
- Daraja, SMS and email provider delivery;
- production file/storage behavior;
- complete role-based acceptance test with real school assignments and data.

A successful syntax/install check is not presented as proof of those live integrations.
