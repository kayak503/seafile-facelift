import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { setSession, assertSameOrigin } from '@/lib/session';
import { SeafileAdapter } from '@/lib/seafile';
import { text } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    rateLimit(request, 8, 60_000);
    assertSameOrigin(request);
    const body = await request.json();
    const username = text(body.username, 'Email or username', 254);
    const password = text(body.password, 'Password', 512);
    const token = await new SeafileAdapter().authenticate(username, password);
    await setSession({ token, username, issuedAt: Date.now() });
    return Response.json({ ok: true, username });
  } catch (error) {
    return errorResponse(error);
  }
}
