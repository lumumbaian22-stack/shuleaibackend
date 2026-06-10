# Shule AI v148.4 — Complete Student Enrollment Lifecycle Repair

## Build identity

- Backend package version: `2.1.484`
- Health build: `v148.4-enrollment-lifecycle-complete`
- Frontend runtime: `?v=1484`
- Service-worker cache: `shule-ai-v1484-enrollment-lifecycle`
- Migration: `20260610010000-v1484-student-enrollment-transfer-workflow.js`

This build extends the matched v148.3 subscription/class-safety build. It does not replace the working finance, branding, teacher-assignment, subscription-enforcement, or safe class-generation repairs.

## Completed student-movement workflows

### Individual Transfer Class

School Admin and Super Admin can:

- Preview an individual same-school class transfer.
- See the current class and target class.
- Set the effective date, academic year, term, reason, and note.
- Review attendance, mark, published-report, and fee impacts before confirmation.
- Apply immediately or schedule the move for a future effective date.
- Cancel an open transfer.
- Roll back the latest applied transfer without deleting its audit record.

### Class-teacher request and Admin approval

A class teacher can:

- See only active students belonging to a class where they are the assigned class teacher.
- Preview a transfer.
- Submit the request to the School Admin.
- Cancel their own request while it is still open.
- View their submitted requests and permitted enrollment history.

A teacher cannot approve their own request. Admin approval revalidates the current class, target class, date, fee handling, and historical impact before applying or scheduling the transfer.

### Planned promotion/transition

The existing academic-year bulk promotion workflow remains separate. Promotion decisions use the same enrollment-history service, block stale previews, block unresolved individual transfers, preserve historical enrollment rows, and create the next academic-period fee account when configured.

## Enrollment-history protections

A movement does not overwrite an old enrollment.

- The previous enrollment is closed with an effective end date, term, reason, actor, movement type, and class teacher at the end of the period.
- A new active enrollment is created for the target class with the effective start date, term, academic year, previous-enrollment link, movement reason, and target class teacher.
- `Student.classId` remains the fast current-class pointer and changes only when the movement becomes effective.
- Future scheduled transfers leave the learner in the original class until the due date.
- The permanent Elimu ID, account, parent links, profile, fees, messages, attendance, marks, reports, and audit history are preserved.
- Published and historical records are not reassigned to the target class.

The migration creates PostgreSQL partial unique indexes enforcing:

- One active enrollment per school/student.
- One open transfer request per school/student.

Duplicate legacy active enrollments are closed and retained; they are not deleted.

## Class-teacher behavior

Class teachers remain assigned to classes. Moving a learner never rewrites the class or teacher assignment.

The workflow resolves supported class-teacher storage safely from:

1. `Classes.teacherId`
2. Explicit class-teacher JSON assignment
3. `Teachers.classId`
4. `TeacherSubjectAssignments.isClassTeacher`
5. Exact legacy `Teacher.classTeacher` name only when canonical links are absent

The former and target class teachers are recorded in enrollment history and receive movement notifications. The target teacher receives current operational access from the effective date. The former teacher retains only permitted historical access.

## Cross-module current-class enforcement

The current class pointer now controls:

- Teacher class lists and My Students
- Teacher dashboard counts and performance
- Individual and bulk marks entry
- Draft-mark editing/deletion
- Gradebooks and publishing
- Draft report-card preview
- Attendance registers and class release
- Competency heatmaps and class analytics
- Homework assignment to a class
- Admin class rosters
- Student classmate messaging
- Parent-to-current-class-teacher messaging
- Parent/student/teacher enrollment-history access

Legacy grade text is used only when a student has no `classId`. A student with a valid `classId` cannot leak into another stream because the grade text matches.

When a learner moves, old draft marks become historical and read-only to the former teacher. Any correction must use the authorised audited correction workflow.

## Fee handling

The transfer preview compares the current and target class fee structures.

Admin chooses one explicit action:

- Keep the current-period invoice unchanged.
- Apply the target-class structure from the next billing period.
- Create an audited current-period adjustment.

Payments and credits already received are preserved. An existing next-period account is reconciled rather than duplicated. Rollback restores the previous fee state where recorded and never deletes payment history.

## Historical-impact handling

A same-day or backdated movement checks for:

- Attendance entries from the effective date
- Academic records from the effective date
- Published report cards for the selected period

When such records exist, Admin must explicitly acknowledge the impact. Those records stay with the original class and are not rewritten.

## Realtime and alerts

After a movement commits, the backend sends targeted events and deduplicated alerts to:

- Old class room
- New class room
- Student context
- Linked parents
- Former and target class teachers
- School administrators

Affected dashboards refresh the membership-dependent section instead of requiring a full application reload. Analytics invalidation is emitted after the database transaction succeeds.

## Scheduling and timezone

Scheduled transfers are processed shortly after startup and during the hourly lifecycle job. Effective-date comparison uses `Africa/Nairobi`, not UTC, preventing a three-hour date delay around midnight in Kenya.

Transient scheduler errors remain scheduled for retry. Stale or impossible requests are marked failed with the error retained in metadata rather than silently moving the learner.

## Validation and regression results

Completed checks:

- 270 backend/project JavaScript files passed syntax validation.
- 49 frontend JavaScript files passed syntax validation.
- Production dependency tree passed `npm ls --omit=dev --depth=0`.
- Backend application imported successfully.
- 74 Express application stack entries registered.
- 22 student-lifecycle route stack entries registered.
- No duplicate controller export remained.
- No duplicate literal route remained.
- No missing relative backend import remained.
- No missing `index.html` frontend asset remained.
- No v148.1, v148.2, or v148.3 runtime cache reference remained.
- No `rerenderBody()` reference remained.
- No `term=undefined` request remained.
- No destructive Student/StudentEnrollment/ClassTransferRequest deletion exists in the lifecycle workflow.
- Mocked immediate-transfer test passed.
- Mocked rollback test passed.
- Mocked fee-transfer/fee-rollback test passed.
- Both generated ZIP archives must pass `unzip -t` before release.

## Environment limitation

The production Render PostgreSQL database, live school data, Socket.IO clients, email/SMS providers, and Daraja credentials are not connected to this build environment. Therefore a real production transaction and live notification delivery could not be executed here. The migration, models, routes, controllers, frontend assets, mocked transactional workflows, static permissions, and archive integrity were validated locally. Deploy the backend and run the migration before deploying the matching frontend.
