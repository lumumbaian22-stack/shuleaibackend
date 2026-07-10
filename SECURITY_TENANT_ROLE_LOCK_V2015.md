# ShuleAI Security Tenant + Role Lock v2015

This patch closes the launch-blocking privilege-escalation and cross-school IDOR issues found in v2014.

## Locked changes

- User preferences are now whitelist-only. Role, permission, finance, subscription, feature, school identity, and additionalRoles keys are blocked from self-service preference updates.
- Login and token refresh no longer trust raw `preferences.additionalRoles`.
- `authorize()` no longer grants route access from arbitrary additionalRoles.
- Non-super-admin users can never switch into `super_admin` through login role selection or token refresh.
- Existing finance secondary-role compatibility is preserved only for server-assigned finance records with finance assignment metadata.
- Student delete/suspend/reactivate actions are school-scoped.
- Teacher student comment/delete actions are school-scoped and class-scoped.
- Parent home-task recommendations now verify child ownership before loading academic data.
- Chat award endpoints are school-scoped.
- `Students.schoolCode` is added and backfilled to make student tenant scoping safer going forward.
- Tenant hooks now cover additional school-owned chat, tutor, report, home-task, and request models.
- Migration sanitizes stored dangerous preference keys and removes unsafe additionalRoles values.

## Required after deployment

1. Run migrations.
2. Rotate `JWT_SECRET` to invalidate old tokens.
3. Ask all users to log in again.

## Important

Do not reintroduce role or permission authority into user-editable JSON preferences. Roles must come from trusted server-side admin workflows only.
