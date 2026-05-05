# Shule AI v20 Tutor + Calendar Hotfix

This version fixes the production errors:

- `relation "TutorUsages" does not exist`
- `relation "TutorProgresses" does not exist`
- Academic calendar events saving but disappearing after reload
- Academic calendar events not behaving as school-wide records

## What changed

### AI Tutor
- Runtime schema safety now creates missing tutor tables automatically on server startup.
- Added safe indexes for tutor usage, progress, and message history.
- Tutor message `role` is now stored as a string instead of a restrictive enum.

### Academic Calendar
- Runtime schema safety now creates/repairs `SchoolCalendars` automatically.
- Calendar `eventType` is now a string, so types like `sports`, `activity`, and future event types do not crash Postgres.
- Added `term`, `year`, `description`, `time`, `location`, and `audience` fields.
- Admin calendar save now broadcasts as a school-wide academic calendar event.

## Important Render deployment note

After uploading this backend to Render, restart the service. The server startup runs `ensureRuntimeSchema()` before listening, so it should create the missing tables.

If you want an immediate manual DB fix, run:

```sql
RENDER_TUTOR_CALENDAR_HOTFIX_V20.sql
```

in your Render Postgres SQL console.
