# Shule AI Backend V4 Recovery

This package fixes the production crashes caused by code referencing columns that were not yet in the Render PostgreSQL database.

## Root cause

`npm run migrate` was pointing to:

```js
migrations/*.js
```

but the migrations are actually in:

```js
src/migrations/*.js
```

So the schema patch that added `Student.assessmentNumber`, `SchoolCalendar.term`, and `Timetable.year` was not applied.

## What changed

- Fixed `runMigrations.js` to use `src/migrations/*.js`.
- Added `src/utils/schemaSafety.js` to add missing columns on startup safely.
- Added `RENDER_DB_HOTFIX.sql` for manual emergency repair.
- Fixed `/api/user/profile-picture` upload middleware conflict.
- Added `GET /api/admin/classes/:id`.

## Deploy steps on Render

1. Upload/deploy this backend.
2. In Render, run:

```bash
npm run migrate
```

3. Restart the web service.

If Render does not let you run the command, paste `RENDER_DB_HOTFIX.sql` into your database SQL console.

## Important

After this deploy, these errors should disappear:

- `column Student.assessmentNumber does not exist`
- `column "term" does not exist`
- `column "year" does not exist`
- `Route not found` for `/api/admin/classes/:id`
- `Unexpected end of form` on profile picture upload