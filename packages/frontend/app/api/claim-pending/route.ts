import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPendingClaims, clearPendingClaims } from '@/lib/pending-claims-store';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

/**
 * Claim businesses that were funded by this user's email (Stripe checkout) before they had an account.
 * Call once after sign-in to link those businesses to the current user id.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id ?? session.user.email;
  const email = session.user.email;
  const businessIds = await getPendingClaims(email);
  if (businessIds.length === 0) {
    return NextResponse.json({ claimed: 0 });
  }
  for (const businessId of businessIds) {
    try {
      await fetch(`${ORCHESTRATOR_URL}/api/business/link-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, founder_session_id: userId }),
      });
    } catch {
      // continue with others
    }
  }
  await clearPendingClaims(email);
  return NextResponse.json({ claimed: businessIds.length });
}
