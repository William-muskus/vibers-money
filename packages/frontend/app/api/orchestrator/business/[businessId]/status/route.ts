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
  const res = await fetch(`${ORCHESTRATOR_URL}/api/business/${businessId}/status`, {
    cache: 'no-store',
    headers: { 'X-Founder-Session-Id': founderId },
  });
  const data = await res.json().catch(() => ({ paused: false }));
  return Response.json(data);
}
