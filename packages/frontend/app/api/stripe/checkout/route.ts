import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getConnectAccountId } from '@/lib/stripe-connect-store';

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

/** Platform fee in cents (e.g. 50 = $0.50 per payment). Set to 0 to send full amount to business. */
const APPLICATION_FEE_CENTS = Number(process.env.STRIPE_APPLICATION_FEE_CENTS) || 0;

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.' },
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  try {
    const body = await req.json();
    const { business_id, founder_session_id, amount_cents = 499, success_url, cancel_url } = body;
    if (!business_id) {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    }
    const metadata: Record<string, string> = { business_id };
    if (founder_session_id) metadata.founder_session_id = founder_session_id;

    const accountId = await getConnectAccountId(business_id);
    let chargesEnabled = false;
    if (accountId) {
      try {
        const account = await stripe.accounts.retrieve(accountId);
        chargesEnabled = account.charges_enabled ?? false;
      } catch {
        // ignore
      }
    }

    const baseParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount_cents,
            product_data: { name: 'vibers.money funding' },
          },
          quantity: 1,
        },
      ],
      success_url: success_url || `${FRONTEND_URL}/chat/${business_id}?funded=1`,
      cancel_url: cancel_url || `${FRONTEND_URL}/chat/${business_id}`,
      metadata,
    };

    if (chargesEnabled && accountId) {
      baseParams.payment_intent_data = {
        transfer_data: { destination: accountId },
        ...(APPLICATION_FEE_CENTS > 0 && { application_fee_amount: Math.min(APPLICATION_FEE_CENTS, amount_cents) }),
      };
    }

    const session = await stripe.checkout.sessions.create(baseParams);
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
