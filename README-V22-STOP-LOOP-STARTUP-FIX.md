# Shule AI v22 - Stop-loop Tutor Startup Fix

This build fixes the Render crash:

```txt
column "schoolId" does not exist
CREATE INDEX idx_tutor_messages_school_student_created ON "TutorMessages" ("schoolId", "studentId", "createdAt")
```

## What changed

1. `src/utils/schemaSafety.js` now adds/repairs every tutor table column before creating indexes.
2. Index creation now checks that required columns exist and skips safely instead of crashing the server.
3. Tutor migration `20260505000000-add-enhanced-ai-tutor.js` now skips unsafe indexes instead of taking down Render.
4. Included `RENDER_TUTOR_FORCE_REPAIR_V22.sql` for direct database repair.

## Deploy steps

1. In Render Postgres, run `RENDER_TUTOR_FORCE_REPAIR_V22.sql`.
2. Deploy this v22 backend.
3. Restart Render service.

After this, the backend should not crash on the tutor index again.
