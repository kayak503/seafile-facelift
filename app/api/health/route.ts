import { getConfig } from '@/lib/config';
import { SeafileAdapter } from '@/lib/seafile';
export async function GET() {
  const config = getConfig();
  if (!config.public.configured)
    return Response.json({ status: 'ok', setup: 'required', seafile: 'unknown' });
  const health = await new SeafileAdapter().health();
  return Response.json({
    status: 'ok',
    setup: 'complete',
    seafile: health.connected ? 'connected' : 'unavailable',
    latencyMs: health.latencyMs,
  });
}
