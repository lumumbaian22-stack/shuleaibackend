# Shule AI v149.8 — Final Timetable DB Write Lock

Locked fixes:
- Timetable save/publish now resets Sequelize's PostgreSQL pool after transient Render connection drops before retrying.
- Timetable payloads are compacted before saving to avoid duplicated class timetable JSON and reduce DB write size.
- Frontend sends compact timetable payloads and keeps unsaved edits on screen after transient DB interruption.
- Frontend cache bumped to ?v=1498.
- Database pool defaults reduced for Render stability and SSL keepalive enabled.
