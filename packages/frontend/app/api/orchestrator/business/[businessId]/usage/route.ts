import { getFounderIdFromRequest } from '@/lib/auth-server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(
  req: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const founderId = await getFounderIdFromRequest(req);
  if (!founderId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const { businessId } = await context.params;
  const res = await fetch(`${ORCHESTRATOR_URL}/api/business/${encodeURIComponent(businessId)}/usage`, {
    headers: { 'X-Founder-Session-Id': founderId },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({ tokensUsed: 0, lastUpdated: null }));
  if (!res.ok) {
    return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  }
  return Response.json(data);
}
