const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(
  req: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await context.params;
  const sessionId = req.headers.get('X-Founder-Session-Id');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (sessionId) headers['X-Founder-Session-Id'] = sessionId;
  const res = await fetch(`${ORCHESTRATOR_URL}/api/business/${businessId}/tree`, { headers, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
