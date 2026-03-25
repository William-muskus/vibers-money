/**
 * SSE stream proxy — per-agent stream from orchestrator (avoids CORS).
 */
import { getFounderIdFromRequest } from '@/lib/auth-server';
import { type NextRequest } from 'next/server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const founderId = await getFounderIdFromRequest(req);
  if (!founderId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const { key } = await context.params;
  const url = new URL(`${ORCHESTRATOR_URL}/api/agents/${encodeURIComponent(key)}/stream`);
  url.searchParams.set('session_id', founderId);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'text/event-stream', 'X-Founder-Session-Id': founderId },
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
