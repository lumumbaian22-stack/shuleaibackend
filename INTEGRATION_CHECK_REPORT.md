# V2025 Integration Check Report

Build: 2025-canonical-analytics-data-cleanup-lock

## Checks performed
- Parsed backend route declarations from `backend/src/routes`.
- Parsed frontend `apiRequest()` calls from `frontend/js`.
- Patched role analytics API helpers to use `/api/analytics/dashboard`.
- Patched role analytics routes to use the canonical analytics dashboard controller.
- Removed stale version-lock markdown notes from the deployment package.
- Removed unused `frontend/js/final-locked-overrides.js`.

## Route/API counts
- Backend route declarations parsed: 583
- Frontend API calls parsed: 494
- Backend analytics route declarations parsed: 20
- Frontend analytics API calls parsed: 14

## Analytics canonical route
The active analytics dashboard route is:

`GET /api/analytics/dashboard`

The role-specific analytics endpoints now delegate to the same canonical controller, so dashboards do not split between old/fallback analytics and the refined analytics system.

## Notes
This static parser checks wiring patterns; it does not replace live database testing. Final rollout should still test each role with real school data after deployment.
