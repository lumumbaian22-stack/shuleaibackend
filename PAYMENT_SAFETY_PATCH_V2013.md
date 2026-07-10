# ShuleAI Payment Safety Patch V2013

This patch hardens backend-authoritative payments.

## What changed

1. Webhook authenticity verification added:
   - Stripe: `Stripe-Signature` HMAC-SHA256 check using webhook secret.
   - Paystack: `x-paystack-signature` HMAC-SHA512 check using Paystack secret key.
   - Flutterwave: `flutterwave-signature` HMAC-SHA256 or legacy `verif-hash` check.
   - M-Pesa: callback source IP allowlist in production plus Daraja STK status query before finalization.
   - PesaPal: IPN is treated as notification only; backend queries PesaPal status before finalization.

2. Webhook idempotency hardened:
   - `PaymentEvents(provider, providerEventId)` is now unique.
   - Duplicate provider events are accepted but not processed again.

3. Payment finalization hardened:
   - Payment row is locked with `FOR UPDATE` inside a DB transaction.
   - Paid callbacks require confirmed amount.
   - Confirmed amount must be >= expected amount.
   - Currency must match.
   - Underpaid/mismatched payments are held for manual review instead of being marked paid.

4. Payment vault hardened:
   - Removed hardcoded fallback encryption key.
   - `PAYMENT_VAULT_KEY` is now required for encryption/decryption.

5. Production environment fail-fast added:
   - `JWT_SECRET`, `PAYMENT_VAULT_KEY`, `DATABASE_URL`, and `PUBLIC_API_BASE_URL` are required in production.

6. Runtime DDL safety:
   - Critical dashboard schema repair no longer runs on every request.
   - It only runs once and only if `ALLOW_RUNTIME_SCHEMA_REPAIR=true`.

7. CORS/preflight cleanup:
   - CORS runs before request context.
   - Webhook signature headers are allowed.

8. Frontend upload/API cleanup:
   - `apiRequest()` no longer sets `Content-Type: application/json` for `FormData`.
   - Old Render backend default was replaced with `https://api.shuleai.live`.

## Required production env vars

```env
NODE_ENV=production
JWT_SECRET=replace_with_strong_random_secret
PAYMENT_VAULT_KEY=replace_with_separate_strong_random_secret
DATABASE_URL=your_postgres_url
PUBLIC_API_BASE_URL=https://api.shuleai.live
ALLOW_RUNTIME_SCHEMA_REPAIR=false
```

For M-Pesa production callbacks also set:

```env
MPESA_CALLBACK_IP_ALLOWLIST=comma,separated,safaricom,callback,ips_or_cidrs
```

Do not set `MPESA_SKIP_IP_ALLOWLIST=true` in production.

## Required deploy order

```bash
cd backend
npm install
npm run migrate
npm start
```

