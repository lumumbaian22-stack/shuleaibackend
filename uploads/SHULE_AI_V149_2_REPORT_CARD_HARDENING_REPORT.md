# Shule AI v149.2 Report Card + Runtime Hardening Report

Build ID: `v149.2-report-card-hardening`  
Frontend asset version: `?v=1492`  
Service-worker cache: `shule-ai-1492-report-card-hardening`

## Why this hotfix exists

The v149.0/v149.1 logic was loading, but two important user-facing issues remained:

1. Admin could not clearly find the place where report-card tests/assessments are selected.
2. The agreed final A4 report-card design was not visible enough in Admin, Teacher, Parent, and Student dashboards.

This build makes report-card settings and final report-card viewing a first-class visible workflow instead of leaving it hidden inside school settings or only inside a PDF endpoint.

## Fixed / added

### Admin report-card test selection

Added a visible Admin sidebar item:

- `Report Card Settings`

The screen is now labelled clearly as:

- `Report Card Settings`
- `Assessment Columns`

This is the place where Admin selects:

- CAT 1
- CAT 2
- Midterm
- End Term
- SBA / Project
- Practical/custom assessments
- Show on report
- Count in final
- Weight percentage
- Display order

The settings still save through the existing `/api/admin/assessment-settings` backend route.

### Final report card visibility

The `Report Cards` / `Report History` section now includes a visible A4 report-card design preview panel for:

- Admin
- Class Teacher
- Parent
- Student

The panel explains what each role sees and provides direct actions:

- Admin: `Choose Assessment Columns`
- Users with published reports: `Open Latest Published PDF`

### Final PDF report-card design

The backend report-card PDF renderer has been upgraded to a one-page A4 styled template with:

- School logo
- School-logo watermark where available
- Neutral Shule AI fallback watermark when no official logo exists
- Student identity section
- Selected assessment columns
- Learning-area table
- Final score / grade
- Competency insights
- Attendance summary
- Account summary where enabled
- Class teacher comment/signature
- Head teacher comment/signature
- Generated with Shule AI footer

### Assessment defaults cleaned

Default report-card assessments are now less ambiguous:

- CAT 1 — 10%
- CAT 2 — 10%
- Midterm — 20%
- End Term — 40%
- SBA / Project — 20%
- Practical — optional / 0% by default

This avoids the old single `CAT` label confusion.

### Runtime cleanup

- Updated backend health build to `v149.2-report-card-hardening`.
- Updated all frontend active asset references to `?v=1492`.
- Updated service-worker cache to `shule-ai-1492-report-card-hardening`.
- Removed active old `?v=1490` / `?v=1491` runtime references.
- Kept prior v149.1 fixes for analytics enum handling, timetable retry, token handling, and Admin Finance Overview calls.

## Verification performed

- Frontend JavaScript syntax check passed.
- Backend JavaScript syntax check passed.
- Backend application imported successfully after production dependency install.
- Expected local PostgreSQL refusal occurred only because the Render database is not attached inside this sandbox.
- No active v149.0/v149.1 frontend runtime references remain in the packaged frontend.
- No `rerenderBody` reference remains in active frontend JS.
- `checkTeacherAssignment` remains defined.
- No invalid `Class.profileImage` query string found in active source.

## Deployment

Deploy backend first, then frontend as complete replacements.

Backend Render commands:

```text
Build Command: npm ci --omit=dev
Pre-Deploy Command: npm run migrate
Start Command: npm start
```

After deployment, verify:

```text
/api/health → build: v149.2-report-card-hardening
```

Browser Network should show:

```text
api.js?v=1492
admin-dashboard.js?v=1492
locked-features-ui.js?v=1492
final-locked-overrides.js?v=1492
```

Use one hard refresh after deployment.
