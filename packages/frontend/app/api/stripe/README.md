# Stripe funding per business

Each **business** can have its own **Stripe Connect Express** account: they add a bank account or card, and funding payments for that business are sent to their account (destination charge). The platform (vibers-app) can optionally take an application fee.

## What you need

### 1. API keys (required)

Add to your `.env` (see repo root `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| **`STRIPE_SECRET_KEY`** | Yes | Secret key from [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikeys). Use `sk_test_...` for dev. |
| **`STRIPE_WEBHOOK_SECRET`** | Yes (for webhooks) | Signing secret for the webhook endpoint. See below. |
| **`NEXT_PUBLIC_APP_URL`** | No | Base URL for checkout success/cancel redirects. Default: `http://localhost:3001`. |

Without `STRIPE_SECRET_KEY`, checkout will fail. Without `STRIPE_WEBHOOK_SECRET`, the webhook will reject all events (payment notifications won’t be processed).

### 2. Webhook (for payment completion)

Stripe calls your app when a payment succeeds. You need a **webhook endpoint** and its **signing secret**.

- **Local dev:** use Stripe CLI:
  ```bash
  stripe listen --forward-to http://localhost:3001/api/stripe/webhook
  ```
  Copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

- **Production:** in [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks), add endpoint `https://your-domain.com/api/stripe/webhook` and subscribe to **`checkout.session.completed`**. Use the signing secret from the created webhook.

---

## Flow (per business)

1. **Checkout**  
   User clicks “Fund” (or similar) → frontend calls `createCheckoutSession(businessId)` → `POST /api/stripe/checkout` creates a Stripe Checkout Session with:
   - `metadata.business_id` = business id  
   - `metadata.founder_session_id` = founder session (for access)  
   - One-time payment (default 499¢ “vibers.money funding”).  

2. **User pays**  
   User is redirected to Stripe Checkout, pays, then redirected back to `success_url` (e.g. `/chat/{business_id}?funded=1`).

3. **Webhook**  
   Stripe sends `checkout.session.completed` to `POST /api/stripe/webhook`. The route:
   - Verifies the event with `STRIPE_WEBHOOK_SECRET`.
   - Injects a `stripe_payment` event into **Swarm Bus** for that business (CEO sees “Payment received: $X.XX”).
   - Calls **orchestrator** `POST /api/business/link-session` so the founder session is linked to the business (access control).

There is **no Stripe Customer or Stripe “wallet” per business** in this flow: each funding is a one-off Checkout Session. The finance page “Wallet balance” is not yet filled from Stripe payments; it would need a backend (e.g. Swarm Bus or your API) to aggregate `stripe_payment` events and expose a balance per business.

---

## Per-business payouts (Stripe Connect)

1. **Onboarding** – From the **Finance** page for a business, the founder clicks **“Set up payouts”**.  
   - **`POST /api/stripe/connect/onboard`** creates (or reuses) a Stripe Express connected account for that `business_id`, then returns an **Account Link** URL.  
   - User is sent to Stripe to add identity and **bank account or card** for payouts.  
   - On completion, Stripe redirects to `/finance/{businessId}/stripe-return`.

2. **Status** – **`GET /api/stripe/connect/status?business_id=xxx`** returns whether the business has an account and if it can receive charges (`charges_enabled`).

3. **Checkout** – When creating a Checkout Session, if the business has a connected account with `charges_enabled`, the session uses a **destination charge**: funds go to the platform then are transferred to that connected account. Optionally set **`STRIPE_APPLICATION_FEE_CENTS`** (e.g. `50` for $0.50) to take a platform fee; otherwise the full amount goes to the business.

4. **Storage** – Connected account IDs are stored in **`data/stripe-connect.json`** (relative to app root; `data/` is gitignored). For serverless (e.g. Vercel), set **`STRIPE_CONNECT_DATA_PATH`** to a persistent path or replace the file store with a DB/KV in `lib/stripe-connect-store.ts`.

## Routes

- **`POST /api/stripe/checkout`** – creates Checkout Session (uses `STRIPE_SECRET_KEY`; destination charge if business has Connect).
- **`POST /api/stripe/webhook`** – receives Stripe events (uses `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`).
- **`POST /api/stripe/connect/onboard`** – start Connect onboarding for a business (returns Stripe Account Link URL).
- **`GET /api/stripe/connect/status?business_id=xxx`** – Connect status for that business.
