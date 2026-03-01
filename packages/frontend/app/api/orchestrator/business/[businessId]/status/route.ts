const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(
  _req: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await context.params;
  const res = await fetch(`${ORCHESTRATOR_URL}/api/business/${businessId}/status`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({ paused: false }));
  return Response.json(data);
}
