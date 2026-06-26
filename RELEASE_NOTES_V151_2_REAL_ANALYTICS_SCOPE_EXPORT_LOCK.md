# Shule AI v151.2 — Real Analytics Scope + Export Lock

## Locked changes
- Analytics data is loaded only from authenticated backend routes and PostgreSQL.
- No frontend demo/mock analytics values are used.
- Admin can view and export whole-school, stream, class, student, teacher, and subject analytics.
- Finance Officer can view/export school, stream, class, and student-account finance analytics.
- Teacher analytics is limited to assigned classes, students, and subjects.
- Parent analytics is limited to linked children; student analytics is limited to the signed-in student.
- Super Admin alone can access platform-wide analytics.
- Export formats: PDF, XLSX, CSV, and printable HTML. JSON is not offered to users.
- Export contents are selectable before download.
- Dark mode redraws charts without refetching or reloading the analytics section.
- Realtime invalidation refreshes in place and keeps existing content visible.
- v150.9 enrolment, timetable, report, chat, finance, transfer, promotion, and authentication logic were not rewritten.

## Routes
- GET /api/analytics/dashboard
- POST /api/analytics/export

## Cache version
- Frontend assets: v1512
- Service worker: shule-ai-1512-real-analytics-scope-export-lock
