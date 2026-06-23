# Shule AI v149.6 — Final Timetable + Realtime Messaging Lock

This build replaces the v149.3/v149.4 hotfix chain with one clean final package.

Locked fixes included:
- Timetable save/publish no longer runs risky runtime schema repair during requests unless explicitly enabled with TIMETABLE_RUNTIME_SCHEMA_REPAIR=true.
- Timetable PUT/Publish now retries once on transient PostgreSQL/Render connection termination without clearing the browser login session.
- Publishing is transaction-safe and logs school/user/timetable context on failure.
- Existing published timetable edits reuse an existing draft instead of creating duplicate drafts after transient retry.
- Realtime chat emits canonical `chat:message_created` events to user and conversation rooms.
- Web client listens to canonical realtime envelopes, direct chat socket events, and legacy mobile/browser event names.
- Group/bulk Message creates now use individual hooks so recipients get realtime delivery.
- Missing frontend window export crashes are removed.
- Report-card modal download opens the official immutable published PDF instead of raw in-memory print HTML.
- Alert polling pauses/backoffs on repeated 401s instead of flooding the console.
- Report snapshot format version is now v149.6.

Verification performed:
- Backend JavaScript syntax check passed.
- Frontend JavaScript syntax check passed.
