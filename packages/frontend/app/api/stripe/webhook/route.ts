import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addPendingClaim } from '@/lib/pending-claims-store';

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;
const SWARM_BUS_URL = process.env.SWARM_BUS_URL || 'http://localhost:3100';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env.' },
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const businessId = session.metadata?.business_id;
    const founderSessionId = session.metadata?.founder_session_id;
    const customerEmail = session.customer_email ?? (session.customer_details?.email) ?? null;
    if (businessId) {
      const amount = (session.amount_total ?? 0) / 100;
      await fetch(`${SWARM_BUS_URL}/api/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          target_role: 'ceo',
          event_type: 'stripe_payment',
          content: `Payment received: $${amount.toFixed(2)}`,
          metadata: { amount, currency: 'usd' },
        }),
      });
      if (founderSessionId) {
        await fetch(`${ORCHESTRATOR_URL}/api/business/link-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId, founder_session_id: founderSessionId }),
        });
      }
      // Store claim by payer email so we can link business to their account when they sign in
      if (customerEmail) {
        await addPendingClaim(customerEmail, businessId);
      }
    }
  }
  return NextResponse.json({ received: true });
}
