# Shule AI Backend V8 Final Platform Suite

Built on V7.

## Key rules implemented

### School name approval
- New/unapproved schools show `ShuleAI School` as the public/platform display name.
- Requested school names are stored separately as `requestedName`.
- Super admin approval sets `approvedName` and public `displayName`.
- Super admin rejection clears the pending request and keeps the platform/default name unless there is already an earlier approved name.
- Sidebar/frontends should use `displayName/publicName/approvedName/platformDisplayName`, not raw requested name.

### Super admin
- Added `/api/super-admin/live-stats`.
- Added `/api/super-admin/schools/:schoolId/stats`.
- Live platform stats aggregate schools, users, students, teachers, parents, and classes.

### Search
- `/api/search` is role-aware.
- Super admin searches platform schools/users.
- School users search only their school-scoped data.

### Help
- Help is role-aware and covers features for each user type.

### Curriculum progress
- Admin: `/api/admin/curriculum-progress`
- Teacher: `GET/PUT /api/teacher/curriculum-progress`
- Tracks subject completion using class subject assignments.

## Deploy
1. Deploy backend V8.
2. Run:
```bash
npm run migrate
```
3. Restart backend.
4. Deploy frontend V8.
