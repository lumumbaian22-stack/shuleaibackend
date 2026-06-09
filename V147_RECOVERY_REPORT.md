# Shule AI v147 — Approved Theme Recovery Report

## Why this recovery exists

The v146 frontend loaded a catch-all `grounded-v146.js` file after the approved dashboard modules. That file replaced several existing renderers at runtime and caused the visible styling and workflows to diverge from the approved system.

## Repaired in this recovery

### Approved styling restored
- Removed the catch-all `grounded-v146.js` runtime override.
- Restored the existing approved CSS without modifying the locked visual files.
- Confirmed the v147 `css/` directory matches the pre-v146 approved CSS files byte-for-byte.
- Restored the approved navy/deep-blue/mint profile header.
- Finance now renders inside the normal dashboard shell instead of replacing the dashboard content with a separate visual theme.

### Finance workspace
- Added a dedicated Finance Workspace using the normal Shule AI dashboard design.
- Added a Finance Team tab for administrators.
- Administrators can create, suspend and reactivate Finance Officer/Bursar accounts.
- Added `finance_officer` as a restricted role.
- Finance officers receive a finance-only dashboard with fees, structures, balances, payments, bursaries, verification and payment settings.
- Finance officers do not receive academic, student-management or school-administration navigation.

### Profile picture and signature uploads
- Aligned `profileImage` and `profilePicture` across the model, database and frontend.
- Added client-side image resizing before upload.
- Added file type and size validation.
- Saved small optimized images as durable database-backed data URLs, with `/uploads` as a secondary fallback.
- Persisted profile and signature metadata in User preferences.
- Updated the in-memory authenticated user, dashboard data and safe local storage after upload.
- Added a data-preserving migration to make profile and signature columns TEXT.

### Parent ↔ class teacher/admin messaging
- Parent message creation now emits the canonical `chat:message_created` realtime event after database persistence.
- Parent replies from teachers/admins emit the same canonical event.
- Parent chat now uses optimistic messages with `clientMessageId` reconciliation.
- Removed the full loading overlay and forced conversation refetch after every send.
- Open parent conversations update from realtime personal/conversation rooms.
- Teacher parent-conversation inboxes receive the same event path.

### Broken actions
- Restored the old Duty Generate button as a delegation to the single current Duty implementation.
- Restored teacher parent-conversation opening through the consolidated Chat v9 UI.
- Reconnected the admin mixed-class student CSV button to the existing uploader.
- Moved recent-alert preview ownership into the alert module instead of a global patch file.

## Database migration

`20260609000000-v147-approved-theme-media-recovery.js`

The migration:
- adds `finance_officer` to User and Alert role enums;
- adds `Users.profilePicture` when missing;
- converts profile/signature columns to TEXT without deleting existing values.

## Verification performed

- 49 frontend JavaScript files passed `node --check`.
- 271 backend JavaScript files passed `node --check`.
- 391 inline UI handlers were scanned; zero unresolved handlers remain.
- 226 frontend API method usages were scanned; zero missing API methods remain.
- 64 frontend script/style/image references were checked; zero missing files remain.
- The removed v146 override is no longer referenced.
- Approved CSS comparison passed.
- Production dependency installation completed successfully: 342 packages.
- Backend routes/controllers and the v147 migration loaded successfully.
- npm audit result: 0 high, 0 critical; 3 moderate transitive findings.

## Not falsely claimed

This environment does not contain the live Render PostgreSQL database or two separately authenticated physical devices. Therefore live migration execution, production image persistence across a Render redeploy, and two-device message delivery must still be confirmed after deployment.

This is a focused recovery of the damaged theme, Finance workspace, uploads and parent realtime messaging. It is not labelled as the final acceptance-tested release of every Shule AI module.
