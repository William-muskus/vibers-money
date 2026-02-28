import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { business_id, amount_cents = 499, success_url, cancel_url } = body;
    if (!business_id) {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'usd', unit_amount: amount_cents, product_data: { name: 'vibers.money funding' } }, quantity: 1 }],
      success_url: success_url || `${FRONTEND_URL}/chat/${business_id}?funded=1`,
      cancel_url: cancel_url || `${FRONTEND_URL}/chat/${business_id}`,
      metadata: { business_id },
    });
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
