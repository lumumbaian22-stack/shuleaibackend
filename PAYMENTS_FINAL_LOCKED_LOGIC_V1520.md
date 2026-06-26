# ShuleAI Final Locked Payment Logic v152.0

This build separates payments by destination while keeping one payment engine.

## Payment destinations

1. `platform`
   - Money belongs to ShuleAI.
   - Used for school subscriptions, parent/student premium packages, name-change fees, SMS bundles, AI packages, storage, and other platform features.
   - Provider credentials are controlled by Super Admin/platform settings.

2. `school_fee`
   - Money belongs to the school.
   - Used for tuition, lunch, transport, boarding, exam fees, activity fees, and any fee account/invoice linked to a student.
   - Provider credentials are controlled by the school admin/finance officer for that school only.

## Non-negotiable safety rules

- A local `Payment` row is created before any provider call.
- The frontend never marks anything paid.
- Callback/redirect success never marks anything paid by itself.
- Only verified webhook/reconciliation confirmation can change a payment to `completed`.
- School fee balances update by recalculating the fee ledger after confirmed payments.
- Duplicate webhooks are safe because `PaymentEvent` records make provider events idempotent.
- Failed provider calls become `pending_provider_error`; the payment is preserved for retry/reconciliation.
- Private credentials are stored through the payment vault helper and are not returned to parents.

## New endpoints

- `GET /api/payments/providers`
- `GET /api/payments/admin/providers`
- `PUT /api/payments/admin/providers`
- `GET /api/payments/parent/methods`
- `POST /api/payments/initiate`
- `GET /api/payments/:reference/status`
- `POST /api/payments/reconcile/:reference`
- `POST /api/payments/webhook/:provider`

Existing Daraja/manual endpoints remain untouched for backward compatibility.

## School fee update rule

When a provider confirms success:

1. The matching `Payment` becomes `completed`.
2. `financeLedger.recalculateFeeAccount(feeId)` runs.
3. The fee account becomes:
   - `paid` when covered amount >= total amount
   - `partial` when covered amount > 0 but less than total
   - `unpaid` when covered amount is 0
4. Parent/admin dashboards receive realtime payment updates.

## Provider readiness

Implemented in one engine:

- Manual/bank/cash/card prompts preserve pending payment rows for verification.
- Daraja continues using the existing STK logic.
- Paystack checkout initialization is wired.
- Flutterwave checkout initialization is wired.
- Stripe Checkout initialization is wired.
- Pesapal is reserved in the provider model and webhook path; live OAuth/IPN finalization needs the school/platform Pesapal registration details.

## Environment requirement

Set `PAYMENT_VAULT_KEY` in production. If it is missing, the system falls back to existing app secrets, but production should use a dedicated long random key.
