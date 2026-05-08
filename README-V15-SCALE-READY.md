# Shule AI v15 Scale-Ready Upgrade

This build adds the scale foundations needed before onboarding tens of thousands of students.

## Included

- PostgreSQL connection pool settings
- Route-aware rate limiting: auth, reads, writes, uploads
- Request IDs for production logs
- Pagination helpers with max page size
- `/api/scale/*` paginated endpoints for large student/teacher/parent/records lists
- `/api/jobs/*` queue foundation for CSV imports, marks imports, and report card generation
- Database index migration: `20260504000100-scale-indexes-and-query-performance.js`
- Manual SQL index hotfix: `SCALE_INDEXES_HOTFIX_V15.sql`
- Frontend scale API helpers and safe list loaders

## Deploy notes

1. Deploy backend.
2. Run migrations: `npm run migrate`.
3. If migrations fail because old tables differ, run `SCALE_INDEXES_HOTFIX_V15.sql` manually in PostgreSQL.
4. Deploy frontend.
5. Test `/health` and `/api/scale/overview`.

## Still required before 50,000+ active users

- Real Redis/BullMQ workers for background jobs. This build creates a queue foundation but does not ship a distributed worker.
- Load test with k6/Artillery.
- Managed PostgreSQL with backups and enough RAM/CPU.
- Object storage for heavy files.
