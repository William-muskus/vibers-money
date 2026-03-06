import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getConnectAccountId } from '@/lib/stripe-connect-store';
import { getFounderIdFromRequest } from '@/lib/auth-server';

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const founderId = await getFounderIdFromRequest(req);
  if (!founderId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured.' },
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const businessId = req.nextUrl.searchParams.get('business_id')?.trim();
  if (!businessId) {
    return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  }
  const canAccessRes = await fetch(
    `${ORCHESTRATOR_URL}/api/business/${encodeURIComponent(businessId)}/can-access?session_id=${encodeURIComponent(founderId)}`,
    { headers: { 'X-Founder-Session-Id': founderId }, cache: 'no-store' },
  );
  const canAccessData = (await canAccessRes.json().catch(() => ({}))) as { allowed?: boolean };
  if (!canAccessData.allowed) {
    return NextResponse.json({ error: 'You do not own this business' }, { status: 403 });
  }
  const accountId = await getConnectAccountId(businessId);
  if (!accountId) {
    return NextResponse.json({ hasAccount: false, chargesEnabled: false, detailsSubmitted: false });
  }
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return NextResponse.json({
      hasAccount: true,
      chargesEnabled: account.charges_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
    });
  } catch {
    return NextResponse.json({ hasAccount: true, chargesEnabled: false, detailsSubmitted: false });
  }
}
