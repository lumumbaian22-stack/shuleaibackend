# Shule AI v149.4 Final Console Audit Lock — Backend

This backend package is rebuilt from the uploaded `files(2).zip` source and repairs the confirmed v149.2/v149.3 console-audit blockers.

## Included fixes
- Repaired `src/controllers/timetableController.js` fatal syntax error and restored `exports.publish`.
- Hardened timetable manual save/publish with school scope checks, conflict checks, clear 400/404 responses, and detailed server logs for real 500 diagnosis.
- Added migration `20260613000000-v1494-final-console-audit-lock.js` to harden timetable columns and clear stale Render `/uploads/signatures` pointers.
- Updated report snapshot `formatVersion` to `process.env.REPORT_FORMAT_VERSION || 'v149.4'`.
- Updated backend health build label to `v149.4-final-console-audit-lock`.

## Verification performed
- `node --check` passed for all backend JS files under `src`, `server.js`, `runMigrations.js`, and `scripts`.
