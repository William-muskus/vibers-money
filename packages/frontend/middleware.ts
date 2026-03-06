import { auth } from '@/auth';

// Seamless flow: no redirect to login. Users can use /chat and /finance with anonymous session (cache);
// account is created/linked when they fund via Stripe (payer email).
export default auth((_req) => {
  return undefined;
});

export const config = {
  matcher: [],
};
