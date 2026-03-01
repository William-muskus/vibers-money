const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function POST(
  req: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${ORCHESTRATOR_URL}/api/business/${businessId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  }
  return Response.json(data, { status: res.status });
}
