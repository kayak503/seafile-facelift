import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { assertSameOrigin, requireSession } from '@/lib/session';
import { SeafileAdapter } from '@/lib/seafile';
import { drivePath, libraryId } from '@/lib/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    rateLimit(request, 30);
    assertSameOrigin(request);
    const session = await requireSession();
    const url = new URL(request.url);
    const id = libraryId(url.searchParams.get('libraryId'));
    const path = drivePath(url.searchParams.get('path'));
    const adapter = new SeafileAdapter();
    const uploadUrl = await adapter.transferUrl(session.token, id, path, 'upload');
    const upstream = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: adapter.authorizationHeader(session.token),
        'Content-Type': request.headers.get('content-type') || 'multipart/form-data',
      },
      body: request.body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    if (!upstream.ok)
      return Response.json(
        { error: 'upload_failed', message: 'Seafile could not upload this file.' },
        { status: upstream.status },
      );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
