# Shule AI v148 — Locked Repair Verification Report

## Release purpose

This release repairs the locked Finance, media upload, session storage, teacher-role visibility, Duty display, class release, custom subject, birthday-setting, profile-image and school-scoping problems reported from v147.

It preserves the approved v147 theme. No CSS file was changed.

## Main implemented repairs

### Finance ownership and access
- School Admin now receives a compact Finance Overview and Finance Team management view.
- The full operational Finance Workspace belongs to Finance Officer/Bursar/Accountant logins.
- Existing users in the same school can be assigned Finance Team access without creating a duplicate account.
- Emails registered to another school are blocked without revealing the other school.
- Parent/student accounts are not eligible for Finance staff assignment.
- Finance permissions are enforced by backend middleware.
- Finance totals are calculated from school-scoped fee accounts.
- Finance staff can handle fee structures, payments/receipts, balances/bursaries, verification/reconciliation, expenses, alerts, reports and settings.
- Expense records are audited and remain school-scoped.
- Payment confirmations and finance events are delivered to Finance staff through deduplicated Finance alerts.
- The undefined `toast` finance error path was removed and replaced with inline form feedback/system notifications.

### Profile photos, logos and signatures
- New `MediaAssets` table stores image bytes in PostgreSQL.
- New stable `/api/media/:token` URLs replace reliance on Render's temporary `/uploads` directory.
- Profile photos, signatures and school logos now save canonical database-backed media URLs.
- Old missing `/uploads/...` URLs resolve to placeholders instead of repeated broken-image requests.
- Core teacher, student, parent and chat responses now include profile-image fields.
- Chat and user cards use profile images when available and initials placeholders otherwise.

### Login/session storage
- The complete school object is no longer saved to localStorage.
- Base64 photos, signatures, logos, dashboard payloads and full school settings are cleared from session storage.
- Only minimal user, school identity, role, token and small canonical media URLs are persisted.
- Quota cleanup retries the minimal session save and does not convert a successful backend login into a failed login.
- Existing same-school users with an additional Finance role can sign in through the Finance Staff login without changing their original account.

### Teacher visibility and class ownership
- My Students, Report Cards, Class Birthdays, Attendance, Parent Conversations and Release Class appear only for assigned class teachers.
- Subject-only teachers are blocked by both frontend visibility and backend middleware.
- Sections can reappear when a teacher receives a class-teacher assignment.
- Subject teachers retain assigned-class and assigned-subject access through the appropriate subject-teacher workflows.

### Duty and student release
- Teacher Today's Duty reads the authenticated teacher's returned Duty assignment instead of comparing a teacher ID with a user ID.
- Duty status displays scheduled, checked-in, late and checked-out states.
- Class teachers receive a dedicated Release Class section after attendance is locked.
- The latest release/update is displayed and linked parents receive the release alert through the existing lifecycle service.

### Custom subjects
- Add Custom Subject is connected to a real school-scoped backend endpoint.
- Custom subjects may be whole-school or class-scoped.
- Duplicate names/codes are blocked per school.
- Saved custom subjects remain in the curriculum structure and feed assignments, marks, reports, analytics and Timetable subject options.
- Saving curriculum checkboxes no longer deletes existing custom subjects.

### Birthday settings
- Birthday configuration remains school-specific.
- Same-day and advance reminder behaviour stays in each school's settings.
- Teacher birthday access is restricted to class-teacher classes rather than all subject assignments.
- Privacy, suppression and opt-out rules remain part of the birthday service.

### Senior subject requests
- Teacher subject requests are limited to active Grade 10–12 class assignments.
- Teachers without senior-class assignments receive an empty senior request result.

### School isolation
- Finance overview, expenses, staff, fees, payment verification and reports derive school scope from the authenticated account.
- Ordinary school users cannot override school scope by sending another `schoolCode` in request data.

## Database migration

`20260609010000-v148-finance-media-session-role-fixes.js`

Creates:
- `MediaAssets`
- `FinanceExpenses`
- Supporting indexes

Existing data is not deleted.

## Source verification completed
- Frontend JavaScript files parsed: 50
- Backend JavaScript files parsed: 277
- Missing local backend require targets: 0
- Missing frontend script/style/image references: 0
- Approved CSS files changed from v147: 0
- Internal/private npm registry links: 0
- Frontend and backend are packaged separately.

## Live acceptance still required

Static/source verification cannot prove Render PostgreSQL migration execution, provider callbacks or two-device WebSocket delivery. After deployment, verify:
- Finance existing-user assignment and dedicated login
- Finance school isolation with two different schools
- Profile/signature/logo persistence after a Render redeploy
- Login with previously full localStorage
- Class-teacher/subject-teacher visibility
- Duty assignment display
- Release alert delivery
- Custom subject propagation
- School-specific birthday preferences
- Parent/class-teacher realtime messaging on two devices

This report does not claim those live-environment checks were executed inside the sandbox.
