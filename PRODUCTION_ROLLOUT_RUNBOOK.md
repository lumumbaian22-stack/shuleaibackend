# ShuleAI Production Rollout Runbook — v2023

## Deployment order
1. Add/check Render environment variables using `.env.example`.
2. Confirm `RUN_MIGRATIONS_ON_START=true` or run `npm run migrate` as a Render pre-deploy command.
3. Keep `ALLOW_RUNTIME_SCHEMA_REPAIR=false` in production.
4. Deploy backend.
5. Check `/health/ready` and `/api/health/detailed`.
6. Deploy frontend.
7. Hard refresh / clear old service worker cache.

## Required production checks
- `/health/ready` returns ready.
- `/api/health/detailed` database check is ok.
- Storage provider is durable: `cloudinary` or `database`.
- Monitoring health shows configured when `SENTRY_DSN` is set.
- Redis warning is gone if running more than one Render instance.

## Break-glass emergency only
If a migration was missed and traffic is failing, temporarily set:

```txt
ALLOW_RUNTIME_SCHEMA_REPAIR=true
```

Then run migrations and turn it back to false. Do not leave runtime repair enabled as normal production behavior.
