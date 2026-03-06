import { getFounderIdFromRequest } from '@/lib/auth-server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';
const PROXY_CREATE_TIMEOUT_MS = 90_000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown> & { founder_session_id?: string };
  const founderId = await getFounderIdFromRequest(req, body);
  if (!founderId) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Sign in or use the app to get a session.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const payload = { ...body, founder_session_id: founderId };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_CREATE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/business/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Founder-Session-Id': founderId },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) {
      return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    const message = (e as Error).name === 'AbortError' ? 'Orchestrator request timed out' : (e as Error).message;
    return Response.json({ error: message }, { status: 504, headers: { 'Content-Type': 'application/json' } });
  }
}
