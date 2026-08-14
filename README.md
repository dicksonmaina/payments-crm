# payments-crm

Minimal payments + CRM starter. Run it, bill clients, track customers.

## Setup

1. `npm install`
2. `copy .env.example .env`
3. Fill in Stripe + Resend keys
4. `npm start`

## Endpoints

- `GET /health`
- `GET /customers`
- `POST /customers` — `{"name","email","phone","source","notes"}`
- `POST /invoices` — `{"customer_email","amount_cents","description"}`
- `GET /success?session_id=...`
- `GET /cancel`
- `POST /webhooks/stripe`

## Production

```powershell
pm2 start src/server.js --name payments-crm
pm2 startup
pm2 save
```

Pair with nginx + certbot when you have a public domain.
