# Shule AI Backend V5 Targeted Recovery

This version specifically fixes the errors reported after V4:

## Admin / super admin
- Super admin does NOT need a schoolCode.
- `Users.schoolCode` is nullable.
- The migration no longer forces `schoolCode='SUPER-ADMIN'`.

## Profile pictures
- Fixes `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`.
- Helmet now allows cross-origin uploaded images.
- `/uploads` sends `Cross-Origin-Resource-Policy: cross-origin`.
- Profile upload returns absolute image URL.

## Analytics
- Fixes parent analytics crash: `a.date.toISOString is not a function`.
- Adds missing timestamp columns used by Sequelize models.
- Makes student analytics skip optional homework/mood stats instead of crashing.

## Rewards/homework
- Rewards return safe default rewards if no rewards exist yet.
- Parent home tasks now show teacher-assigned homework first.
- Homework assignment returns assigned count.

## Deploy
1. Deploy this backend.
2. Run:

```bash
npm run migrate
```

3. Restart Render.

If migrations still fail, use `RENDER_DB_HOTFIX_V5.sql` in the Render PostgreSQL SQL console.