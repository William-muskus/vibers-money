/**
 * SSE stream proxy — forwards orchestrator stream to avoid CORS.
 * Next.js rewrites buffer SSE; this route streams properly.
 */
import { getFounderIdFromRequest } from '@/lib/auth-server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

export async function GET(
  req: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const founderId = await getFounderIdFromRequest(req);
  if (!founderId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const { businessId } = await context.params;
  const url = new URL(`${ORCHESTRATOR_URL}/api/business/${businessId}/stream`);
  url.searchParams.set('session_id', founderId);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'text/event-stream', 'X-Founder-Session-Id': founderId },
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
