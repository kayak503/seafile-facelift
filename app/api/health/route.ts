import { getConfig } from '@/lib/config';
import { SeafileAdapter } from '@/lib/seafile';
export async function GET() {
  const config = getConfig();
  if (!config.seafileUrl) return Response.json({ status: 'ok', setup: 'required', seafile: 'unknown' });
  // Probe Seafile independently so setup can confirm the internal address even when another
  // setting—most commonly SESSION_SECRET—is still missing or invalid.
  const health = await new SeafileAdapter(config.seafileUrl).health();
  return Response.json({
    status: 'ok',
    setup: config.public.configured ? 'complete' : 'required',
    seafile: health.connected ? 'connected' : 'unavailable',
    latencyMs: health.latencyMs,
  });
}
