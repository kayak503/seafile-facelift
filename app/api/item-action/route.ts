import { AppError, errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { assertSameOrigin, requireSession } from '@/lib/session';
import { SeafileAdapter } from '@/lib/seafile';
import { drivePath, libraryId, text } from '@/lib/validation';
import { getConfig } from '@/lib/config';
import { passwordDigest, sealPublicShare } from '@/lib/public-share';

function shareToken(value: unknown) {
  const token = text(value, 'Share token', 128);
  if (!/^[a-z0-9_-]+$/i.test(token)) throw new AppError(400, 'invalid_share', 'That share link is invalid.');
  return token;
}

export async function GET(request: Request) {
  try {
    rateLimit(request);
    const session = await requireSession();
    const url = new URL(request.url);
    const repo = libraryId(url.searchParams.get('libraryId'));
    const path = drivePath(url.searchParams.get('path'));
    const links = await new SeafileAdapter().listShareLinks(session.token, repo, path);
    return Response.json({ links });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    rateLimit(request);
    assertSameOrigin(request);
    const session = await requireSession();
    const body = await request.json();
    await new SeafileAdapter().deleteShareLink(session.token, shareToken(body.token));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    rateLimit(request);
    assertSameOrigin(request);
    const session = await requireSession();
    const body = await request.json();
    const operation = text(body.operation, 'Operation', 16);
    const adapter = new SeafileAdapter();
    const repo = libraryId(body.libraryId);
    const path = drivePath(body.path);
    if (operation === 'star' || operation === 'unstar') {
      await adapter.setStarred(session.token, repo, path, operation === 'star');
      return Response.json({ ok: true });
    }
    if (operation === 'share') {
      const itemType = body.itemType === 'folder' ? 'folder' : 'file';
      const name = text(body.name, 'Name');
      const password =
        typeof body.password === 'string' && body.password ? text(body.password, 'Password', 128) : undefined;
      if (password && password.length < 4)
        throw new AppError(400, 'invalid_password', 'Use at least 4 characters for the password.');
      const expireDays = body.expireDays == null ? undefined : Number(body.expireDays);
      if (expireDays != null && ![1, 7, 30, 90].includes(expireDays))
        throw new AppError(400, 'invalid_expiration', 'Choose a valid expiration period.');
      const description =
        typeof body.description === 'string' && body.description
          ? text(body.description, 'Description')
          : undefined;
      const permissions =
        body.permissions && typeof body.permissions === 'object'
          ? (body.permissions as Record<string, unknown>)
          : {};
      const options = {
        password,
        expireDays,
        description,
        canDownload: permissions.canDownload !== false,
        canEdit: permissions.canEdit === true,
        canUpload: permissions.canUpload === true,
      };
      let share;
      try {
        share = await adapter.createShareLink(session.token, repo, path, options);
      } catch (error) {
        if (
          options.canEdit &&
          error instanceof AppError &&
          ['permission_denied', 'seafile_error'].includes(error.code)
        )
          throw new AppError(
            400,
            'editing_not_supported',
            'Editing is not supported for this file or by this Seafile server. Turn off “Allow editing” and create the link again.',
          );
        throw error;
      }
      const expiresAt =
        share.expiresAt ||
        (expireDays ? new Date(Date.now() + expireDays * 86_400_000).toISOString() : undefined);
      const publicToken = sealPublicShare({
        name,
        type: itemType,
        upstreamLink: share.link,
        downloadLink: share.downloadLink,
        expiresAt,
        description,
        canDownload: options.canDownload,
        passwordHash: password ? passwordDigest(password) : undefined,
      });
      return Response.json({
        link: `${getConfig().public.appUrl}/s/${publicToken}`,
        expiresAt,
        permissions: share.permissions,
      });
    }
    throw new AppError(400, 'unsupported_operation', 'That item action is not supported.');
  } catch (error) {
    return errorResponse(error);
  }
}
