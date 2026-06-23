# Shule AI v150.2 — Safe Report Review Lock

Base: stable v149.8 timetable DB lock.

This release deliberately avoids the broken v150.0/v150.1 dashboard rewrites. It changes only the isolated frontend paths required for the class teacher report-review workflow and sidebar visibility.

## Locked fixes

- Class Teacher My Students keeps the stable v149.8 roster loading path.
- Report-review area is split into Current Draft Review, Published Archive, and Data Issues without replacing the full dashboard.
- Sidebar report-card history links are removed for admin, teacher, parent, and student roles.
- The report-history mock/final-report-card preview card is removed; official PDF history remains available from published rows.
- Class teacher can expand a learner from My Students and edit subject marks inline.
- Inline mark saves use the existing `/api/teacher/marks/:recordId` update path when a record exists and `/api/teacher/marks/bulk` when a mark does not yet exist.
- Publish is no longer hard-blocked by unresolved warnings; the teacher can publish anyway after confirmation.
- Timetable backend and the v149.8 DB connection fix are untouched.

## Cache

Frontend assets are bumped to `?v=1502` and service-worker cache is `shule-ai-1502-safe-report-review-lock`.
