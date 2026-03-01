/**
 * SSE stream proxy — Swarm Bus events (avoids CORS when same-origin).
 */
const SWARM_BUS_URL =
  process.env.SWARM_BUS_URL ||
  process.env.NEXT_PUBLIC_SWARM_BUS_URL ||
  'http://localhost:3100';

export async function GET(_req: Request) {
  const url = `${SWARM_BUS_URL}/api/events`;

  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(JSON.stringify({ error: 'Stream failed', detail: text }), {
      status: 502,
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
