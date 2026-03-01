const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';
const PROXY_CREATE_TIMEOUT_MS = 90_000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_CREATE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/business/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) {
      return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    const message = (e as Error).name === 'AbortError' ? 'Orchestrator request timed out' : (e as Error).message;
    return Response.json({ error: message }, { status: 504, headers: { 'Content-Type': 'application/json' } });
  }
}
