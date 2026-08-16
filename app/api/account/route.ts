import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { requireSession } from '@/lib/session';
import { SeafileAdapter } from '@/lib/seafile';

export async function GET(request: Request) {
  try {
    rateLimit(request);
    const session = await requireSession();
    return Response.json(await new SeafileAdapter().storageUsage(session.token));
  } catch (error) {
    return errorResponse(error);
  }
}
