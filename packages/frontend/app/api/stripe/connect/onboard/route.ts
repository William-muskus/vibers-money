import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getConnectAccountId, setConnectAccountId } from '@/lib/stripe-connect-store';
import { getFounderIdFromRequest } from '@/lib/auth-server';

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const founderId = await getFounderIdFromRequest(req, body);
  if (!founderId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.' },
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  try {
    const businessId = body.business_id ?? body.businessId;
    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    }
    const id = businessId.trim().replace(/\s+/g, '-');
    const canAccessRes = await fetch(
      `${ORCHESTRATOR_URL}/api/business/${encodeURIComponent(id)}/can-access?session_id=${encodeURIComponent(founderId)}`,
      { headers: { 'X-Founder-Session-Id': founderId }, cache: 'no-store' },
    );
    const canAccessData = (await canAccessRes.json().catch(() => ({}))) as { allowed?: boolean };
    if (!canAccessData.allowed) {
      return NextResponse.json({ error: 'You do not own this business' }, { status: 403 });
    }
    let accountId = await getConnectAccountId(id);
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
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
