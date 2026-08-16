import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { requireSession } from '@/lib/session';
import { SeafileAdapter, type SearchResult } from '@/lib/seafile';
import { text } from '@/lib/validation';

function kind(item: SearchResult) {
  if (item.type === 'folder') return 'folder';
  const name = item.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|heic)$/.test(name)) return 'image';
  if (/\.pdf$/.test(name)) return 'pdf';
  if (/\.(docx?|odt|rtf)$/.test(name)) return 'document';
  if (/\.(xlsx?|csv|ods)$/.test(name)) return 'sheet';
  if (/\.(pptx?|odp)$/.test(name)) return 'slides';
  if (/\.(mp4|webm|mov)$/.test(name)) return 'video';
  if (/\.(mp3|wav|m4a|flac)$/.test(name)) return 'audio';
  if (/\.(zip|rar|7z|tar|gz)$/.test(name)) return 'archive';
  if (/\.(txt|md|json|xml|ya?ml|js|ts|tsx|css|html)$/.test(name)) return 'text';
  return 'other';
}
function size(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : undefined;
}
function date(value: string | null, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

export async function GET(request: Request) {
  try {
    rateLimit(request);
    const session = await requireSession();
    const params = new URL(request.url).searchParams;
    const query = text(params.get('q'), 'Search', 200);
    const adapter = new SeafileAdapter();
    let results = await adapter.search(session.token, query);
    const library = params.get('libraryId');
    const type = params.get('type');
    const after = date(params.get('after'));
    const before = date(params.get('before'), true);
    const minSize = size(params.get('minSize'));
    const maxSize = size(params.get('maxSize'));
    if (library) results = results.filter(item => item.libraryId === library);
    if (type) results = results.filter(item => kind(item) === type);
    if (after != null)
      results = results.filter(item => item.modifiedAt && new Date(item.modifiedAt).getTime() >= after);
    if (before != null)
      results = results.filter(item => item.modifiedAt && new Date(item.modifiedAt).getTime() <= before);
    if (minSize != null) results = results.filter(item => (item.size || 0) >= minSize);
    if (maxSize != null) results = results.filter(item => (item.size || 0) <= maxSize);
    const sort = params.get('sort');
    if (sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'newest' || sort === 'oldest')
      results.sort(
        (a, b) =>
          (new Date(b.modifiedAt || 0).getTime() - new Date(a.modifiedAt || 0).getTime()) *
          (sort === 'newest' ? 1 : -1),
      );
    if (sort === 'largest' || sort === 'smallest')
      results.sort((a, b) => ((b.size || 0) - (a.size || 0)) * (sort === 'largest' ? 1 : -1));
    return Response.json({
      results,
      filters: {
        library,
        type,
        after: params.get('after'),
        before: params.get('before'),
        minSize,
        maxSize,
        sort,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
