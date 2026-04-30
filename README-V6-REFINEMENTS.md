# Shule AI Backend V6 Refinements

Changes:
- `/api/teacher/messages/:parentId` now validates the target user is actually a parent in the teacher's school.
- `/api/teacher/parent-conversations` parent list is filtered to users with role `parent`.
- Unread count duplicate increment fixed in parent conversations.

Run migrations only if Render says pending migrations exist; otherwise deploy/restart is enough.