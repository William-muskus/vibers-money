import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getConnectAccountId } from '@/lib/stripe-connect-store';

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;

export async function GET(req: NextRequest) {
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
