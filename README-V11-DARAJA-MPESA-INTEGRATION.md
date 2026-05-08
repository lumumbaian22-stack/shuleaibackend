# Shule AI V11 Daraja / M-PESA Backend Integration

This backend package adds Daraja M-PESA Express/STK Push integration.

## Added files
- `src/services/darajaService.js`
- `src/controllers/paymentController.js`
- `src/routes/paymentRoutes.js`

## Mounted route
- `/api/payments`

## Main endpoints
- `POST /api/payments/parent/fee/stk`
- `POST /api/payments/parent/subscription/stk`
- `POST /api/payments/admin/name-change/stk`
- `POST /api/payments/platform/stk`
- `POST /api/payments/daraja/callback`
- `GET /api/payments/admin/school-settings`
- `PUT /api/payments/admin/school-settings`
- `GET /api/payments/superadmin/platform-settings`
- `PUT /api/payments/superadmin/platform-settings`

## Required environment variables
```env
DARAJA_ENV=sandbox
DARAJA_CONSUMER_KEY=your_daraja_consumer_key
DARAJA_CONSUMER_SECRET=your_daraja_consumer_secret
DARAJA_SHORTCODE=174379
DARAJA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
DARAJA_TRANSACTION_TYPE=CustomerPayBillOnline
DARAJA_CALLBACK_URL=https://your-backend-url.com/api/payments/daraja/callback
```

## Sandbox test
Use phone `254708374149` and amount `1`.

## Important
Direct settlement to each separate school account requires each school to have its own live Daraja shortcode/passkey or a platform collection + settlement model.
