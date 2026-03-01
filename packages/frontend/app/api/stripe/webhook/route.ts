import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SWARM_BUS_URL = process.env.SWARM_BUS_URL || 'http://localhost:3100';
const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
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
    }
  }
  return NextResponse.json({ received: true });
}
