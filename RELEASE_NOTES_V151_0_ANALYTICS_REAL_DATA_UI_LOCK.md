# Shule AI v151.0 Analytics Real Data UI Lock

- Adds role-safe `/api/analytics/dashboard` backend endpoint.
- Super Admin gets platform analytics across schools only.
- School Admin gets school-scoped analytics using `req.user.schoolCode`.
- Teacher gets assigned-class analytics through shared class membership/linkage resolver.
- Parent gets selected-child analytics only through StudentParent ownership.
- Student gets self analytics only.
- Finance Officer gets school-scoped finance analytics.
- Frontend Analytics section redesigned to match the approved generated dashboard concepts.
- Charts and cards use live backend data, not fake sample data.
- Dark mode supported through v151 analytics CSS variables and theme re-render.
- No changes to v150.9 class membership/enrollment backfill logic.
