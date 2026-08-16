import { cookies } from 'next/headers';
import { AppError, errorResponse } from '@/lib/errors';
import {
  openPublicShare,
  passwordsMatch,
  shareCookieName,
  shareCookieValue,
  shareExpired,
} from '@/lib/public-share';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const share = openPublicShare(token);
    if (!share || shareExpired(share))
      throw new AppError(404, 'share_unavailable', 'This share link is unavailable or has expired.');
    if (share.passwordHash) {
      const value = (await cookies()).get(shareCookieName(token))?.value || '';
      if (!passwordsMatch(value, shareCookieValue(token)))
        throw new AppError(401, 'password_required', 'Enter the share password to continue.');
    }
    if (!share.downloadLink)
      throw new AppError(404, 'preview_unavailable', 'A download is not available for this shared item.');
    const download = url.searchParams.get('download') === '1';
    if (download && !share.canDownload)
      throw new AppError(403, 'downloads_disabled', 'Downloads are disabled for this shared file.');
    const upstream = await fetch(share.downloadLink, { redirect: 'follow', cache: 'no-store' });
    if (!upstream.ok || !upstream.body)
      throw new AppError(502, 'share_unavailable', 'The shared file could not be loaded.');
    const headers = new Headers();
    const type = upstream.headers.get('content-type');
    if (type) headers.set('Content-Type', type);
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    headers.set('Cache-Control', 'private, no-store');
    const filename = share.type === 'folder' ? `${share.name}.zip` : share.name;
    headers.set(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return new Response(upstream.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
