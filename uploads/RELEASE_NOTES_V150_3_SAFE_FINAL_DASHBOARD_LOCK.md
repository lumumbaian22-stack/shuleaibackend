# Shule AI v150.3 — Safe Final Dashboard Lock

Base: stable v149.8 timetable DB lock, carried through v150.2 safe line.

## Locked fixes

- Kept the working v149.8 timetable backend path unchanged.
- Class teacher My Students is now strictly class-first: class teachers see only their assigned class, even if they also teach subjects elsewhere.
- Teacher class assignment detection now supports all existing assignment sources: Class.teacherId, Teacher.classId, Teacher.classTeacher, TeacherSubjectAssignment.isClassTeacher, and Class.subjectTeachers.isClassTeacher.
- My Students roster is cleaner and no longer shows a compressed subject table by default.
- Expand/Edit opens inline subject mark editing directly inside My Students.
- Inline marks save through the real teacher marks APIs and update report publishing inputs.
- Class report review auto-loads the Current Draft Review tab.
- Published Archive and Data Issues stay separate from the current draft.
- Publish Anyway remains available for unresolved warnings, with publishAnyway and issueSummary recorded in report snapshot metadata.
- Report-card opening checks official report history first; if no published report exists, it shows a clean “No published report card yet” message instead of hitting noisy latest-PDF 404s.
- Student timetable now shows current/upcoming/ended lesson status like the parent timetable.
- Student dashboard leaderboard, badges, and home tasks now show honest empty states instead of staying stuck on Loading.
- Realtime class/conversation authorization now recognizes class teacher assignments stored in TeacherSubjectAssignment.isClassTeacher.
- Stale profile images continue to fall back safely.
- Cache bumped to ?v=1503.

## Not changed

- Timetable DB save/publish retry logic from v149.8.
- Finance workspace.
- Admin calendar.
- Parent/student dashboard core logic except agreed timetable/empty-state behavior.
- Report snapshot backend engine except publish-anyway metadata.
