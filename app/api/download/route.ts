import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { requireSession } from '@/lib/session';
import { SeafileAdapter } from '@/lib/seafile';
import { drivePath, libraryId } from '@/lib/validation';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    rateLimit(request, 120);
    const session = await requireSession();
    const url = new URL(request.url);
    const id = libraryId(url.searchParams.get('libraryId'));
    const path = drivePath(url.searchParams.get('path'));
    const adapter = new SeafileAdapter();
    const downloadUrl = await adapter.transferUrl(session.token, id, path, 'download');
    const range = request.headers.get('range');
    const upstream = await fetch(downloadUrl, {
      headers: {
        Authorization: adapter.authorizationHeader(session.token),
        ...(range ? { Range: range } : {}),
      },
    });
    if (!upstream.ok)
      return Response.json(
        { error: 'download_failed', message: 'This file could not be downloaded.' },
        { status: upstream.status },
      );
    const headers = new Headers();
    ['content-type', 'content-length', 'content-disposition', 'accept-ranges', 'content-range'].forEach(
      key => {
        const value = upstream.headers.get(key);
        if (value) headers.set(key, value);
      },
    );
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
