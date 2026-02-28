const SWARM_BUS_URL = process.env.SWARM_BUS_URL || 'http://localhost:3100';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id') || '';
  const url = `${SWARM_BUS_URL}/api/graph${businessId ? `?business_id=${encodeURIComponent(businessId)}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) return new Response(null, { status: res.status });
  const data = await res.json();
  return Response.json(data);
}
