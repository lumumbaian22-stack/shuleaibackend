# V2025 Canonical Analytics Data Cleanup Lock

This build removes stale version lock notes and makes the analytics path canonical.

## What changed
- Role-specific analytics routes (`/api/admin/analytics`, `/api/teacher/analytics`, `/api/parent/analytics`, `/api/student/analytics`, `/api/super-admin/analytics`) now use the same canonical analytics controller as `/api/analytics/dashboard`.
- Frontend role API helpers now call the canonical dashboard analytics endpoint.
- School analytics uses populated classes for dashboard KPIs, while still reporting configured/empty classes as data-quality warnings.
- Analytics now carries a curriculum context from school/class settings and uses the curriculum helper for student/report analytics grading.
- Subject analytics warns when imported/entered subject names do not match the school curriculum subject bank.
- Old version lock markdown files and unused report-card override stub were removed from the deploy package.

## What did not change
- Payment webhook security and payment provider logic.
- Report-card template/design.
- Auth/tenant isolation.
- Database schema/migrations.

## Active build
2025-canonical-analytics-data-cleanup-lock
