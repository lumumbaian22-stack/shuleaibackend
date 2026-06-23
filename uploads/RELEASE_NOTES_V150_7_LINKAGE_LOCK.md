# Shule AI v150.7 — School Linkage Repair Lock

This build is a targeted linkage repair on top of the v150.6 access/assessment build and preserves the working v149.8 timetable database fix.

## Locked fixes
- Added shared `schoolLinkageService` for teacher → class, class → students, parent → child, and teacher → class parents resolution.
- Fixed `/api/chat-v9/teacher/class-parents` so it no longer queries the non-existent `Student.schoolCode` column.
- Teacher class parent messages now resolve students through `Student -> User.schoolCode` and parents through `StudentParent -> Parent -> User`.
- Class-teacher access middleware now uses the same shared resolver instead of separate partial logic.
- My Class Birthdays now resolves class-teacher assignment through the same resolver and supports canonical/legacy class links.
- Frontend query parameters now drop `undefined` and `null` string values to prevent `/reports/snapshots?classId=undefined` API crashes.
- Student grades realtime refresh now avoids noisy forbidden loops and only runs in student sessions.
- Cache bumped to `?v=1507`.

## Do not change
- Timetable backend DB connection fix from v149.8.
- Report snapshot immutability.
- Existing dashboard routing outside linkage-specific fixes.
