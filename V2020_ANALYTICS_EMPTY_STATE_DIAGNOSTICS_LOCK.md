# ShuleAI v2020 Analytics Empty-State Diagnostics Lock

Focused patch on top of v2019. No payment, auth, tenant, report-card, dashboard routing, or database logic was changed.

## Purpose

Make analytics cards that have no data explain why they are empty, so users can distinguish between:

- working card with no data yet
- setup required
- waiting for school activity
- no risk/problem found
- mapping issue that needs developer review

## Frontend behavior

Each analytics card now has:

- a data-status badge: `Data ready`, `Waiting for data`, or `Needs mapping`
- a disabled `No data` button when exportable data is not available yet
- a specific empty-state explanation based on the card title
- required data details
- an action message telling the admin/teacher/parent what must happen for the card to populate

## Export behavior

Existing v2018 export behavior remains intact. Cards with no exportable data no longer show an active per-card download button. Once the backend returns data for that section, the card becomes downloadable again.

## Files changed

- frontend/js/analytics-dashboard.js
- frontend/css/theme-system.css
- frontend/index.html
- frontend/service-worker.js
- frontend/js/app-health.js
- frontend/SHULE_AI_VERSION.txt

## No migration required
