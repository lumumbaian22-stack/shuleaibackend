# ShuleAI v2018 Analytics Export Lock

This patch keeps the analytics dashboard layout intact and fixes export behavior.

## Locked behavior
- Dashboard cards keep their existing layout and styling.
- Every exportable analytics card is linked to a backend export section key.
- Quick PDF/Excel/CSV exports use the currently visible analytics type instead of exporting unrelated sections.
- Individual card download exports only that selected card.
- Export drawer supports Select Visible, Select None, and Select All.
- Backend rejects invalid or empty selected export sections instead of silently exporting the wrong fallback.
- PDF, Excel, CSV, and print output use improved ShuleAI report formatting.

## Main files changed
- frontend/js/analytics-dashboard.js
- frontend/css/theme-system.css
- backend/src/controllers/analyticsV152Controller.js
