# Shule AI v149.0 Final Locked Build Report

Build ID: `v149.0-final-locked`  
Frontend asset version: `?v=1490`  
Service-worker cache: `shule-ai-1490-final-locked`

## What this build finalizes

### Runtime and old-file cleanup
- Updated backend health endpoints to report `v149.0-final-locked`.
- Updated every active frontend asset reference in `index.html` to `?v=1490`.
- Added `final-locked-overrides.js` as the last runtime override layer.
- Updated the service worker to a new cache name so old v148.x caches are deleted/replaced.
- Removed old root deployment/report files that referenced v148.x so they cannot be confused with deployable runtime instructions.
- Verified there are no old `?v=148x` references in active HTML/service-worker/runtime loaders.

### Final school finance logic
- Locked one permission-based School Finance Workspace.
- School Admin sees only Finance Overview and Finance Team management by default.
- Finance Officer is the fallback full owner when no Bursar/Accountant exists.
- Bursar and Accountant have different default permission sets and therefore different visible tabs/actions.
- Added canonical backend finance routes for:
  - `/api/finance/modules`
  - `/api/finance/invoices`
  - `/api/finance/analytics`
  - `/api/finance/audit-trail`
- Frontend Finance Workspace now exposes:
  - Overview
  - Fee Structures
  - Invoices
  - Payments & Receipts
  - Balances & Bursaries
  - Verification & Reconciliation
  - Expenses
  - Alerts
  - Analytics
  - Reports
  - Settings
  - Audit Trail
- Finance tabs render from permissions. Hidden modules mean missing permission, not missing code.

### Report-card locked logic
- Report-card generation now reads the school’s saved assessment settings.
- Selected assessments are filtered and attached to the snapshot.
- Report metadata records the selected-assessment engine.
- School logo fallback and watermark values are included in report-card snapshot data.
- Added frontend A4 report-card renderer helper with top logo, center watermark, student details, selected assessment columns, competency insights, comments, and class/head teacher signatures.
- Fallback logo uses the clean Shule AI logo when no official school logo exists.

### School Birthdays
- Admin-facing birthdays are renamed and treated as `School Birthdays`.
- Teacher birthdays remain class-scoped as `My Class Birthdays`.
- Birthday responses include missing DOB count so Admin can identify records needing cleanup.
- Existing birthday settings remain persisted and school-scoped.

### Preserved from previous locked builds
- Safe class generation from persisted school setup.
- Monthly/termly/yearly subscription enforcement foundation.
- Student enrollment-history transfer and promotion workflow.
- Timetable draft/save/publish sync.
- Parent/child ownership protections already present in parent endpoints.
- Durable branding/media fallback behavior.
- Analytics learner-coverage logic from v148.5.

## Verification performed
- Frontend JavaScript syntax check passed.
- Backend JavaScript syntax check passed.
- Backend application imported successfully after production dependency install; only database connection was unavailable in this sandbox.
- Duplicate `exports.*` assignments check passed for backend controllers.
- Active runtime references use `?v=1490`.
- No `rerenderBody` reference remains in active frontend JS.
- `checkTeacherAssignment` is now defined in class management.
- ZIP archive integrity checks passed.

## Deployment rule
Deploy the backend ZIP first, then the frontend ZIP as complete replacements. Do not merge old v148.x files back into these folders.

Recommended Render commands:

```text
Build Command: npm ci --omit=dev
Pre-Deploy Command: npm run migrate
Start Command: npm start
```

After deployment verify:

```text
/api/health → build: v149.0-final-locked
```

Browser network should show:

```text
api.js?v=1490
finance-fees.js?v=1490
final-locked-overrides.js?v=1490
```
