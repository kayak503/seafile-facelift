import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { requireSession } from '@/lib/session';
import { SeafileAdapter } from '@/lib/seafile';
import { drivePath, libraryId } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    rateLimit(request, 240);
    const session = await requireSession();
    const params = new URL(request.url).searchParams;
    const id = libraryId(params.get('libraryId'));
    const path = drivePath(params.get('path'));
    const requestedSize = Number(params.get('size'));
    const size = [64, 256, 512, 1024].includes(requestedSize) ? requestedSize : 256;
    const upstream = await new SeafileAdapter().thumbnail(session.token, id, path, size);
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    headers.set('Cache-Control', 'private, max-age=3600');
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
