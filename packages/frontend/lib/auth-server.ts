import { auth } from '@/auth';

/** Get current session user id for orchestrator X-Founder-Session-Id. Returns null if not authenticated. */
export async function getFounderSessionId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  const id = (session.user as { id?: string }).id ?? session.user.email ?? session.user.name ?? null;
  return id ?? null;
}

/** Get founder id from auth or from client (anonymous session in header/body/query). Use for seamless flow: no login until user funds via Stripe; then we create/link account from payer email. */
export async function getFounderIdFromRequest(
  req: Request,
  body?: { founder_session_id?: string } | null,
): Promise<string | null> {
  const fromAuth = await getFounderSessionId();
  if (fromAuth) return fromAuth;
  const fromHeader = req.headers.get('x-founder-session-id')?.trim();
  if (fromHeader) return fromHeader;
  const fromBody = body?.founder_session_id?.trim();
  if (fromBody) return fromBody;
  try {
    const fromQuery = new URL(req.url).searchParams.get('session_id')?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }
  return null;
}
