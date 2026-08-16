import { clearSession, assertSameOrigin } from '@/lib/session';
import { errorResponse } from '@/lib/errors';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await clearSession();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
