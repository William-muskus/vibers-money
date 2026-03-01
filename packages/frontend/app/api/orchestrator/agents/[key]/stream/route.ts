/**
 * SSE stream proxy — per-agent stream from orchestrator (avoids CORS).
 */
const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(
  _req: Request,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  const url = `${ORCHESTRATOR_URL}/api/agents/${encodeURIComponent(key)}/stream`;

  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(JSON.stringify({ error: 'Stream failed', detail: text }), {
      status: res.status === 404 ? 404 : 502,
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
