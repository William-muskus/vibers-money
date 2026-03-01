const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function POST(
  _req: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await context.params;
  const res = await fetch(`${ORCHESTRATOR_URL}/api/business/${businessId}/pause`, { method: 'POST' });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Failed to pause' }), { status: res.status });
  }
  return Response.json(await res.json());
}
