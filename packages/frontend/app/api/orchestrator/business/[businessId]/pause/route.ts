import { getFounderIdFromRequest } from '@/lib/auth-server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function POST(
  req: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const founderId = await getFounderIdFromRequest(req);
  if (!founderId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const { businessId } = await context.params;
  const res = await fetch(`${ORCHESTRATOR_URL}/api/business/${businessId}/pause`, {
    method: 'POST',
    headers: { 'X-Founder-Session-Id': founderId },
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Failed to pause' }), { status: res.status });
  }
  return Response.json(await res.json());
}
