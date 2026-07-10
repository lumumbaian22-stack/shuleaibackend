# ShuleAI v2014 Performance Speed Patch

This patch adds the first safe database speed layer for ShuleAI without changing the main business logic.

## Added

1. Performance indexes migration
   - File: `src/migrations/20260708000001-performance-indexes-pagination-cache.js`
   - Adds safe indexes for users, students, teachers, classes, attendance, academic records, fees, payments, messages, alerts, duty rosters, calendars and LearnFeed tables.
   - The migration checks if each table and column exists before adding an index, so it can run safely across slightly different deployments.

2. Pagination helper
   - File: `src/utils/pagination.js`
   - Supports page/limit pagination and cursor pagination.

3. In-memory cache service
   - File: `src/services/cacheService.js`
   - No extra dependency required.
   - Supports TTL cache, prefix flushing, and school-scoped cache clearing.

4. Slow-query logging
   - File: `src/config/database.js`
   - Logs queries slower than `DB_SLOW_QUERY_MS`.
   - Defaults to 500ms.
   - Disable with `DB_SLOW_QUERY_LOGGING=false`.

## Optimized endpoints

- `GET /api/admin/dashboard`
  - Uses parallel count queries.
  - Caches admin dashboard stats for 45 seconds per school.

- `GET /api/admin/students`
  - Adds `page` and `limit` support.
  - Defaults to 50 rows and caps at 200.

- `GET /api/admin/teachers`
  - Adds `page` and `limit` support.
  - Defaults to 50 rows and caps at 200.

- `GET /api/admin/classes`
  - Caches active classes for 5 minutes per school.
  - Clears cache after class create/update/delete/teacher assignment.

- `GET /api/teacher/messages/:parentId`
  - Adds cursor pagination using `before` and `limit`.

- `GET /api/parent/messages/:otherUserId`
  - Adds cursor pagination using `before` and `limit`.

- `GET /api/admin/messages/:parentId`
  - Adds cursor pagination using `before` and `limit`.

## Cache invalidation added

School cache is cleared after:

- teacher profile update/deactivation
- class create/update/delete
- teacher assignment/removal from class
- teacher manual student creation
- teacher CSV student upload

## Recommended production env

```env
DB_SLOW_QUERY_MS=500
DB_SLOW_QUERY_LOGGING=true
DB_POOL_MAX=10
CACHE_DEFAULT_TTL_SECONDS=60
CACHE_MAX_KEYS=5000
ALLOW_RUNTIME_SCHEMA_REPAIR=false
```

## Run

```bash
cd backend
npm install
npm run migrate
npm start
```

## Notes

Partitioning was not added yet because it is only useful after very large row counts. This patch gives the immediate speed wins first: indexing, pagination, caching, and slow-query visibility.
