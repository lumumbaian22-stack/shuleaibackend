# V2021 Auth + Realtime Production Hardening

Focused fixes applied on top of v2020:

1. Protected `POST /api/student/set-first-password` behind authenticated student access.
2. Reworked first-password logic so the logged-in JWT student is the authority, not a submitted Elimu ID.
3. Added password length validation and blocked reuse of the first-password endpoint after first login is complete.
4. Added refresh token issuance/rotation for login and refresh-token flows.
5. Fixed realtime client fallback from the old Render URL to `https://api.shuleai.live`.
6. Updated backend health build label to `v2022-cbc-report-card-docx-template-lock`.
7. Required `SUPER_ADMIN_SECRET` and `JWT_EXPIRE` in production, and rejected the default super-admin placeholder secret.
8. Added recommended production env warnings for refresh-token and CORS settings.
9. Resolved the duplicate migration filename timestamp by renaming the tasks migration to `20240330000001-create-tasks-table.js` and making it idempotent.

Untouched by design: payments, analytics, report-card template, dashboard layout, tenant/payment migrations, and school role permissions.
