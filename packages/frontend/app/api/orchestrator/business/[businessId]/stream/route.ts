/**
 * SSE stream proxy — forwards orchestrator stream to avoid CORS.
 * Next.js rewrites buffer SSE; this route streams properly.
 */
const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const url = `${ORCHESTRATOR_URL}/api/business/${businessId}/stream`;

  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(JSON.stringify({ error: 'Stream failed', detail: text }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  if (!res.body) {
    return new Response(JSON.stringify({ error: 'No stream body' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
