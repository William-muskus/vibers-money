import { getFounderIdFromRequest } from '@/lib/auth-server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(
  req: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const founderId = await getFounderIdFromRequest(req);
  if (!founderId) {
    return new Response(JSON.stringify({ allowed: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const { businessId } = await context.params;
  const url = `${ORCHESTRATOR_URL}/api/business/${businessId}/can-access?session_id=${encodeURIComponent(founderId)}`;
  const res = await fetch(url, {
    headers: { 'X-Founder-Session-Id': founderId },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({ allowed: false }));
  return Response.json(data);
}
