import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getConnectAccountId, setConnectAccountId } from '@/lib/stripe-connect-store';

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.' },
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const businessId = body.business_id ?? body.businessId;
    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    }
    const id = businessId.trim().replace(/\s+/g, '-');
    let accountId = await getConnectAccountId(id);
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_profile: {
          product_description: `vibers.money business: ${id}`,
          url: `${FRONTEND_URL}/chat/${id}`,
        },
      });
      accountId = account.id;
      await setConnectAccountId(id, accountId);
    }
    const returnUrl = `${FRONTEND_URL}/finance/${encodeURIComponent(id)}/stripe-return`;
    const refreshUrl = `${FRONTEND_URL}/finance/${encodeURIComponent(id)}?stripe=refresh`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return NextResponse.json({ url: link.url, accountId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
