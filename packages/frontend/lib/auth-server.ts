import { auth } from '@/auth';
import type { NextRequest } from 'next/server';

/** Get current session user id for orchestrator X-Founder-Session-Id. Returns null if not authenticated. */
export async function getFounderSessionId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  const id = (session.user as { id?: string }).id ?? session.user.email ?? session.user.name ?? null;
  return id ?? null;
}

/**
 * Founder id for orchestrator / business ownership.
 *
 * **Order matters:** client-sent anonymous session (header / body / query) must win over NextAuth.
 * Businesses are keyed by `getOrCreateFounderSessionId()`; if a user is logged in, auth id differs
 * and the orchestrator returns 403 — which broke SSE when we started proxying with headers.
 */
export async function getFounderIdFromRequest(
  req: Request | NextRequest,
  body?: { founder_session_id?: string } | null,
): Promise<string | null> {
  const fromHeader = req.headers.get('x-founder-session-id')?.trim();
  if (fromHeader) return fromHeader;
  const fromBody = body?.founder_session_id?.trim();
  if (fromBody) return fromBody;
  const fromNextUrl =
    'nextUrl' in req && req.nextUrl ? req.nextUrl.searchParams.get('session_id')?.trim() : undefined;
  if (fromNextUrl) return fromNextUrl;
  try {
    // Next route handlers often give a path-only req.url; new URL('/path?a=1') throws without a base.
    const href = req.url;
    const u = href.startsWith('http') ? new URL(href) : new URL(href, 'http://sse-proxy.local');
    const fromQuery = u.searchParams.get('session_id')?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }
  const fromAuth = await getFounderSessionId();
  if (fromAuth) return fromAuth;
  return null;
}
