# ShuleAI v2016 Regression + Security Cleanup

This build is a consolidated cleanup on top of v2015. It fixes the remaining production blockers found after the tenant-role/security patch.

## Fixed

1. `/api/scale/*` no longer crashes after the pagination helper rename.
   - Added backward-compatible `makePageResponse` alias.
   - Updated `scaleRoutes.js` to use `buildPaginatedResponse` directly.

2. `/api/scale/academic-records` is now role-scoped.
   - Admin/super admin: school-scoped access.
   - Teacher: records limited to their own/assigned class or subject scope.
   - Parent: only linked children, published records only.
   - Student: own records only, published records only.

3. `/api/scale/alerts` is no longer school-wide for normal users.
   - Admin/super admin: school alerts.
   - Other roles: own alerts only.

4. Teacher-student access now fails closed.
   - `teacherCanAccessStudentClass()` no longer grants access when class lookup fails.

5. Finance secondary-role access no longer trusts `preferences.additionalRoles`.
   - Added trusted `UserRoleAssignments` model/table.
   - Login, auth middleware, Socket.IO auth, and admin finance assignment now use trusted assignments.
   - New migration removes unsafe preference role keys.

6. Parent home-task access now uses the centralized parent ownership service.
   - Removed the unsafe `parentId = userId` fallback.
   - Completing tasks now requires a real StudentParents link.

7. Chat department teacher assignment is now school-scoped.
   - Admins can only add teachers from their own school to departments/groups.

8. Demo seed students now receive `schoolCode`.

## Deployment notes

Run migrations after deploying:

```bash
cd backend
npm install
npm run migrate
npm start
```

Rotate `JWT_SECRET` after deploying this version if v2015 or earlier was ever exposed to users.
