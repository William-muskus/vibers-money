/**
 * Proxy GET /api/admin/businesses from orchestrator (for sidebar business list).
 */
const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/admin/businesses`, {
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return Response.json(data);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Orchestrator unreachable', detail: String((err as Error).message) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
