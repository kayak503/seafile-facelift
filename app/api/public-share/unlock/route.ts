import { cookies } from 'next/headers';
import { errorResponse, AppError } from '@/lib/errors';
import {
  openPublicShare,
  passwordDigest,
  passwordsMatch,
  shareCookieName,
  shareCookieValue,
  shareExpired,
} from '@/lib/public-share';
import { rateLimit } from '@/lib/rate-limit';
import { getConfig } from '@/lib/config';

export async function POST(request: Request) {
  try {
    rateLimit(request);
    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const share = openPublicShare(token);
    if (!share || shareExpired(share))
      throw new AppError(404, 'share_unavailable', 'This share link is unavailable or has expired.');
    if (!share.passwordHash || !passwordsMatch(passwordDigest(password), share.passwordHash))
      throw new AppError(401, 'incorrect_password', 'That password is not correct.');
    (await cookies()).set(shareCookieName(token), shareCookieValue(token), {
      httpOnly: true,
      sameSite: 'lax',
      secure: getConfig().public.appUrl.startsWith('https://'),
      path: `/api/public-share/content`,
      maxAge: 60 * 60 * 12,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
