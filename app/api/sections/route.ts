import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { requireSession } from '@/lib/session';
import { SeafileAdapter } from '@/lib/seafile';

export async function GET(request: Request) {
  try {
    rateLimit(request);
    const session = await requireSession();
    const section = new URL(request.url).searchParams.get('section');
    const adapter = new SeafileAdapter();
    if (section === 'recent') return Response.json({ items: await adapter.listRecent(session.token) });
    if (section === 'starred') return Response.json({ items: await adapter.listStarred(session.token) });
    if (section === 'shared')
      return Response.json({ libraries: await adapter.listSharedLibraries(session.token) });
    if (section === 'trash') return Response.json({ items: await adapter.listTrash(session.token) });
    return Response.json(
      { error: 'unsupported_section', message: 'That section is not available.' },
      { status: 400 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
