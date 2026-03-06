'use client';

import { useSession } from 'next-auth/react';
import { useRef, useEffect } from 'react';

/**
 * When the user is signed in, claim any businesses that were funded with their email
 * (Stripe checkout) before they had an account. Runs once per session.
 */
export function ClaimPendingOnSignIn() {
  const { data: session, status } = useSession();
  const claimedRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email || claimedRef.current) return;
    claimedRef.current = true;
    fetch('/api/claim-pending', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, [status, session?.user?.email]);

  return null;
}
