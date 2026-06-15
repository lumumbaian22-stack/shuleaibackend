# Shule AI v150.6 — Final Access + Assessment Lock

Built from the safe v149.8/v150.5 line. This release targets only the locked fixes requested after v150.5.

## Locked fixes

- Parent and student timetables now use the published class timetable and resolve subject names from subjectName/subject/learningArea aliases.
- Parent timetable is child-scoped through `/api/timetable/parent/child/:studentId` and returns currentLesson, nextLesson and todayLessons.
- Student timetable is self-scoped through `/api/timetable/student/me` and returns currentLesson, nextLesson and todayLessons.
- Fixed timetable class-block resolution so compact class summaries do not hide the real global published timetable slots.
- Report-card history/PDF access now preserves parent-child and student-self ownership checks without noisy wrong-child fallback loops.
- Teacher report snapshot refresh no longer calls `classId=undefined`; frontend guards and backend validates missing classId.
- Realtime academic refresh now checks role and classId before calling protected endpoints.
- Teacher messages can load linked parents for students in the teacher’s assigned class using `/api/chat-v9/teacher/class-parents`.
- Report Card Settings inside School Settings now supports openers/custom tests, show/count toggles, weights, display order, class/level, curriculum and max score.
- Report snapshot format default is now v150.6.
- Cache/version bumped to `?v=1506`.

## Not touched

- Timetable DB pool/connection fix from v149.8 remains intact.
- Core dashboard controller, authentication flow, finance workspace, duty workspace and subscription matrix were not broadly rewritten.
